from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException, status
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.database import get_async_session
from app.dependencies import get_current_user
from app.models import (
    File,
    FinanceAccount,
    FinanceAsset,
    FinanceAuditEntry,
    FinanceEvent,
    FinanceEventComponent,
    FinanceEventRevision,
    FinanceEvidenceDocument,
    FinanceLot,
    FinancePosting,
    FinanceReconciliation,
    FinanceReviewGroup,
    FinanceReviewGroupMember,
    FinanceRevisionValuation,
    FinanceTransferMatch,
    FinanceValuation,
    Link,
    User,
)
from app.routes import finance_review as finance_review_route
from app.routes.finance import router as finance_router
from app.routes.finance_review import router as finance_review_router

pytestmark = pytest.mark.anyio


@dataclass(frozen=True)
class ReviewSeed:
    account: FinanceAccount
    asset: FinanceAsset
    group: FinanceReviewGroup
    revisions: tuple[FinanceEventRevision, ...]


def test_finance_routers_mount_exactly_one_activity_operation() -> None:
    api = FastAPI()
    api.include_router(finance_router)
    api.include_router(finance_review_router)

    operations = [
        route
        for route in api.routes
        if getattr(route, "path", None) == "/api/finance/activity"
        and "GET" in getattr(route, "methods", set())
    ]
    assert len(operations) == 1


@pytest.fixture
async def finance_review_client(
    test_engine: AsyncEngine, test_user: User
) -> AsyncIterator[AsyncClient]:
    api = FastAPI()
    api.include_router(finance_router)
    api.include_router(finance_review_router)
    session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    async def override_user() -> User:
        return test_user

    api.dependency_overrides[get_async_session] = override_session
    api.dependency_overrides[get_current_user] = override_user
    async with AsyncClient(transport=ASGITransport(app=api), base_url="http://test") as client:
        yield client


async def _seed_group(
    session: AsyncSession,
    user: User,
    *,
    member_count: int = 2,
    quantity: Decimal = Decimal("0.000125"),
) -> ReviewSeed:
    account = FinanceAccount(
        user_id=user.id,
        name="Fixture exchange",
        institution="Example",
        account_type="exchange",
        country_code="SE",
        base_currency="EUR",
        tax_jurisdiction="SE",
        provider="manual",
    )
    asset = FinanceAsset(
        user_id=user.id,
        asset_type="crypto",
        symbol=f"FIX{uuid4().hex[:6]}",
        name="Fixture asset",
        chain_id=f"fixture-{uuid4()}",
        contract_address=str(uuid4()),
        decimals=18,
    )
    session.add_all((account, asset))
    await session.flush()
    revisions: list[FinanceEventRevision] = []
    start = datetime(2026, 1, 15, tzinfo=UTC)
    for index in range(member_count):
        event = FinanceEvent(user_id=user.id)
        session.add(event)
        await session.flush()
        revision = FinanceEventRevision(
            user_id=user.id,
            event_id=event.id,
            revision_number=1,
            event_type="staking_reward",
            effective_at=start + timedelta(hours=index),
            tax_date=date(2026, 1, 15),
            tax_day_policy="Europe/Stockholm-v1",
            source_account_id=account.id,
            semantic_fingerprint=uuid4().hex,
            status="proposed",
            derivation_type="fixture",
            derivation_version="1",
            created_by_type="system:import",
            attributes={
                "source_id": "fixture-source",
                "jurisdiction": "SE",
                "valuation_policy": "fixture-price-v1",
                "evidence_condition": "present",
            },
        )
        session.add(revision)
        await session.flush()
        event.current_revision_id = revision.id
        session.add(
            FinanceEventComponent(
                user_id=user.id,
                event_revision_id=revision.id,
                role="reward",
                account_id=account.id,
                asset_id=asset.id,
                quantity=quantity,
                fiat_value=quantity * Decimal("2400.00"),
                currency="EUR",
            )
        )
        revisions.append(revision)
    native_total = quantity * member_count
    group = FinanceReviewGroup(
        user_id=user.id,
        grouping_key=uuid4().hex,
        grouping_rule_version="daily-v1",
        label="Daily staking rewards",
        status="pending",
        account_id=account.id,
        asset_id=asset.id,
        event_type="staking_reward",
        tax_date=date(2026, 1, 15),
        first_effective_at=start,
        last_effective_at=start + timedelta(hours=member_count - 1),
        native_quantity=native_total,
        report_value=native_total * Decimal("2400.00"),
        report_currency="EUR",
        materiality=native_total * Decimal("2400.00"),
        evidence_coverage=Decimal("1"),
        confidence_explanation="Fixture values and evidence are complete",
        candidate_treatment="staking_income",
        warnings=[],
    )
    session.add(group)
    await session.flush()
    session.add_all(
        FinanceReviewGroupMember(group_id=group.id, event_revision_id=revision.id)
        for revision in revisions
    )
    await session.commit()
    return ReviewSeed(account, asset, group, tuple(revisions))


async def _attach_valuation_and_evidence(
    session: AsyncSession,
    user: User,
    seed: ReviewSeed,
) -> tuple[FinanceValuation, FinanceEvidenceDocument]:
    revision = seed.revisions[0]
    file_row = File(
        user_id=user.id,
        name="fixture.csv",
        content_type="text/csv",
        size=32,
    )
    session.add(file_row)
    await session.flush()
    evidence = FinanceEvidenceDocument(
        user_id=user.id,
        file_id=file_row.id,
        original_name="fixture.csv",
        media_type="text/csv",
        size=32,
        sha256=uuid4().hex * 2,
        object_version="fixture-v1",
        source_kind="statement",
        captured_at=datetime(2026, 1, 16, tzinfo=UTC),
    )
    valuation = FinanceValuation(
        user_id=user.id,
        event_revision_id=revision.id,
        asset_id=seed.asset.id,
        source_currency=seed.asset.symbol or "ASSET",
        target_currency="EUR",
        rate=Decimal("2400"),
        value=Decimal("0.3"),
        valued_at=revision.effective_at,
        provider="fixture",
        provider_reference=f"fixture:{revision.id}",
        valuation_policy="fixture-v1",
        tax_year=2026,
        jurisdiction="SE",
        created_at=datetime(2026, 1, 16, tzinfo=UTC),
    )
    session.add_all((evidence, valuation))
    await session.flush()
    session.add_all(
        (
            FinanceRevisionValuation(
                event_revision_id=revision.id,
                valuation_id=valuation.id,
            ),
            Link(
                source_type="finance_event_revision",
                source_id=revision.id,
                target_type="finance_evidence",
                target_id=evidence.id,
                relation="supported_by",
            ),
        )
    )
    await session.commit()
    return valuation, evidence


async def test_review_counts_and_group_filters(
    finance_review_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    ready = await _seed_group(test_db_session, test_user, member_count=1)
    needs_evidence = await _seed_group(test_db_session, test_user, member_count=1)
    problematic = await _seed_group(test_db_session, test_user, member_count=1)
    needs_grouping = await _seed_group(test_db_session, test_user, member_count=1)
    ready.group.status = "confirmed"
    needs_evidence.group.evidence_coverage = Decimal("0.5")
    problematic.group.warnings = [
        {"code": "fixture_blocker", "severity": "blocking", "message": "Blocked"}
    ]
    needs_grouping.group.warnings = [
        {"code": "fixture_warning", "severity": "warning", "message": "Review"}
    ]
    await test_db_session.commit()

    counts = await finance_review_client.get(
        "/api/finance/review-queue/counts?tax_year=2026&jurisdiction=SE"
    )
    assert counts.status_code == 200
    assert counts.json() == {
        "needs_grouping": 1,
        "needs_evidence": 1,
        "ready": 1,
        "problematic": 1,
        "total": 4,
    }

    groups = await finance_review_client.get(
        f"/api/finance/review-groups?event_type=staking_reward&group_id={ready.group.id}"
    )
    assert groups.status_code == 200
    assert [item["id"] for item in groups.json()["items"]] == [ready.group.id]
    activity = await finance_review_client.get(f"/api/finance/activity?group_id={ready.group.id}")
    assert activity.status_code == 200
    assert [item["id"] for item in activity.json()["items"]] == [ready.group.id]


async def _seed_transfer_pair(
    session: AsyncSession,
    user: User,
    *,
    shared_hash: str | None,
) -> tuple[ReviewSeed, ReviewSeed]:
    accounts = (
        FinanceAccount(
            user_id=user.id,
            name="Owner wallet",
            institution="Self custody",
            account_type="wallet",
            country_code="SE",
            base_currency="EUR",
            tax_jurisdiction="SE",
            provider="manual",
        ),
        FinanceAccount(
            user_id=user.id,
            name="Owner exchange",
            institution="Fixture exchange",
            account_type="exchange",
            country_code="SE",
            base_currency="EUR",
            tax_jurisdiction="SE",
            provider="manual",
        ),
    )
    asset = FinanceAsset(
        user_id=user.id,
        asset_type="crypto",
        symbol=f"TX{uuid4().hex[:6]}",
        name="Transfer asset",
        chain_id=f"fixture-{uuid4()}",
        contract_address=str(uuid4()),
        decimals=18,
    )
    session.add_all((*accounts, asset))
    await session.flush()
    seeds: list[ReviewSeed] = []
    timestamp = datetime(2026, 1, 20, 12, tzinfo=UTC)
    for index, (account, quantity) in enumerate(
        zip(accounts, (Decimal("-1.0001"), Decimal("1")), strict=True)
    ):
        event = FinanceEvent(user_id=user.id)
        session.add(event)
        await session.flush()
        attributes: dict[str, object] = {
            "network": "fixture-chain",
            "address": "owner-destination",
        }
        if shared_hash is not None:
            attributes["transaction_hash"] = shared_hash
        revision = FinanceEventRevision(
            user_id=user.id,
            event_id=event.id,
            revision_number=1,
            event_type="transfer",
            effective_at=timestamp + timedelta(minutes=index * 5),
            tax_date=date(2026, 1, 20),
            tax_day_policy="Europe/Stockholm-v1",
            source_account_id=account.id,
            semantic_fingerprint=uuid4().hex,
            status="proposed",
            derivation_type="fixture",
            derivation_version="1",
            created_by_type="system:fixture",
            attributes=attributes,
        )
        session.add(revision)
        await session.flush()
        event.current_revision_id = revision.id
        session.add(
            FinanceEventComponent(
                user_id=user.id,
                event_revision_id=revision.id,
                role="transfer",
                account_id=account.id,
                asset_id=asset.id,
                quantity=quantity,
            )
        )
        group = FinanceReviewGroup(
            user_id=user.id,
            grouping_key=uuid4().hex,
            grouping_rule_version="daily-v1",
            label=f"Transfer leg {index + 1}",
            status="pending",
            account_id=account.id,
            asset_id=asset.id,
            event_type="transfer",
            tax_date=date(2026, 1, 20),
            first_effective_at=revision.effective_at,
            last_effective_at=revision.effective_at,
            native_quantity=quantity,
            report_value=None,
            report_currency=None,
            materiality=abs(quantity),
            evidence_coverage=Decimal("0"),
            confidence_explanation="Transfer fixture",
            candidate_treatment="internal_transfer",
            warnings=[],
        )
        session.add(group)
        await session.flush()
        session.add(FinanceReviewGroupMember(group_id=group.id, event_revision_id=revision.id))
        seeds.append(ReviewSeed(account, asset, group, (revision,)))
    await session.commit()
    return seeds[0], seeds[1]


async def test_all_review_and_reconciliation_endpoints_require_authentication() -> None:
    api = FastAPI()
    api.include_router(finance_review_router)

    async def reject_user() -> User:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    api.dependency_overrides[get_current_user] = reject_user
    transport = ASGITransport(app=api)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        requests = (
            client.get("/api/finance/activity"),
            client.get("/api/finance/review-groups"),
            client.get("/api/finance/reconciliations"),
            client.post(
                f"/api/finance/review-groups/{uuid4()}/confirm",
                json={
                    "expected_member_revision_ids": [str(uuid4())],
                    "create_reusable_policy": False,
                    "reason": "test",
                },
                headers={"Idempotency-Key": "unauth-confirm"},
            ),
            client.post(
                f"/api/finance/review-groups/{uuid4()}/split",
                json={
                    "partitions": [
                        {"label": "one", "member_revision_ids": [str(uuid4())]},
                        {"label": "two", "member_revision_ids": [str(uuid4())]},
                    ],
                    "reason": "test",
                },
                headers={"Idempotency-Key": "unauth-split"},
            ),
            client.post(
                f"/api/finance/review-groups/{uuid4()}/defer",
                json={"reason": "test", "revisit_on": None},
                headers={"Idempotency-Key": "unauth-defer"},
            ),
            client.post(
                "/api/finance/reconciliations/run",
                json={
                    "account_id": str(uuid4()),
                    "asset_id": None,
                    "period_start": "2026-01-01",
                    "period_end": "2026-01-31",
                    "opening_balance": "0",
                    "closing_balance": "0",
                    "tolerance": "0",
                    "source_revision_ids": [],
                },
                headers={"Idempotency-Key": "unauth-reconciliation"},
            ),
        )
        responses = [await request for request in requests]
    assert {response.status_code for response in responses} == {401}


async def test_cross_owner_groups_and_accounts_are_concealed(
    finance_review_client: AsyncClient,
    test_db_session: AsyncSession,
) -> None:
    other = User(
        username=f"other-{uuid4().hex[:8]}",
        email=f"other-{uuid4().hex[:8]}@example.com",
        password_hash="unused",
        is_active=True,
    )
    test_db_session.add(other)
    await test_db_session.flush()
    seed = await _seed_group(test_db_session, other)

    listed = await finance_review_client.get("/api/finance/review-groups")
    mutation = await finance_review_client.post(
        f"/api/finance/review-groups/{seed.group.id}/defer",
        json={"reason": "cross owner", "revisit_on": None},
        headers={"Idempotency-Key": "cross-owner-defer"},
    )
    reconciliation = await finance_review_client.post(
        "/api/finance/reconciliations/run",
        json={
            "account_id": seed.account.id,
            "asset_id": seed.asset.id,
            "period_start": "2026-01-01",
            "period_end": "2026-01-31",
            "opening_balance": "0",
            "closing_balance": "0",
            "tolerance": "0",
            "source_revision_ids": [],
        },
        headers={"Idempotency-Key": "cross-owner-reconciliation"},
    )

    assert listed.status_code == 200
    assert listed.json()["items"] == []
    assert mutation.status_code == 404
    assert reconciliation.status_code == 404


async def test_confirmation_creates_append_only_balanced_revisions_and_is_idempotent(
    finance_review_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    seed = await _seed_group(test_db_session, test_user)
    payload = {
        "expected_member_revision_ids": [revision.id for revision in seed.revisions],
        "create_reusable_policy": True,
        "reason": "Checked against exchange evidence",
    }
    headers = {"Idempotency-Key": "confirm-review-api"}

    first = await finance_review_client.post(
        f"/api/finance/review-groups/{seed.group.id}/confirm",
        json=payload,
        headers=headers,
    )
    retry = await finance_review_client.post(
        f"/api/finance/review-groups/{seed.group.id}/confirm",
        json=payload,
        headers=headers,
    )

    assert first.status_code == 200, first.text
    assert retry.json() == first.json()
    result = first.json()
    confirmed_ids = set(result["confirmed_revision_ids"])
    revisions = list(
        (
            await test_db_session.scalars(
                select(FinanceEventRevision).where(FinanceEventRevision.user_id == test_user.id)
            )
        ).all()
    )
    postings = list(
        (
            await test_db_session.scalars(
                select(FinancePosting).where(FinancePosting.event_revision_id.in_(confirmed_ids))
            )
        ).all()
    )
    assert len(revisions) == 4
    assert sum(revision.status == "proposed" for revision in revisions) == 2
    assert sum(revision.status == "confirmed" for revision in revisions) == 2
    assert result["preview"]["posting_count"] == 4
    assert len(postings) == 4
    assert sum((posting.quantity for posting in postings), Decimal(0)) == 0
    audit_count = int(await test_db_session.scalar(select(func.count(FinanceAuditEntry.id))) or 0)
    projection_audit_count = int(
        await test_db_session.scalar(
            select(func.count(FinanceAuditEntry.id)).where(
                FinanceAuditEntry.action == "investment.projection_created"
            )
        )
        or 0
    )
    assert audit_count == 5
    assert projection_audit_count == 2


async def test_confirmation_carries_lineage_into_summary_and_event_history(
    finance_review_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    seed = await _seed_group(test_db_session, test_user, member_count=1)
    valuation, evidence = await _attach_valuation_and_evidence(
        test_db_session,
        test_user,
        seed,
    )
    override_valuation = FinanceValuation(
        user_id=test_user.id,
        event_revision_id=seed.revisions[0].id,
        asset_id=seed.asset.id,
        source_currency=seed.asset.symbol or "ASSET",
        target_currency="EUR",
        rate=Decimal("3200"),
        value=Decimal("0.4"),
        valued_at=seed.revisions[0].effective_at,
        provider="fixture",
        provider_reference=f"fixture-override:{seed.revisions[0].id}",
        valuation_policy="manual-override",
        tax_year=2026,
        jurisdiction="SE",
        override_reason="Use the corrected source price",
        created_at=datetime(2026, 1, 17, tzinfo=UTC),
    )
    test_db_session.add(override_valuation)
    await test_db_session.flush()
    test_db_session.add(
        FinanceRevisionValuation(
            event_revision_id=seed.revisions[0].id,
            valuation_id=override_valuation.id,
        )
    )
    await test_db_session.commit()
    confirmation = await finance_review_client.post(
        f"/api/finance/review-groups/{seed.group.id}/confirm",
        json={
            "expected_member_revision_ids": [seed.revisions[0].id],
            "create_reusable_policy": False,
            "reason": "Verified immutable evidence and valuation provenance",
        },
        headers={"Idempotency-Key": "confirm-lineage"},
    )

    assert confirmation.status_code == 200, confirmation.text
    confirmed_id = confirmation.json()["confirmed_revision_ids"][0]
    assert (
        await test_db_session.scalar(
            select(func.count(FinanceRevisionValuation.valuation_id)).where(
                FinanceRevisionValuation.event_revision_id == confirmed_id,
                FinanceRevisionValuation.valuation_id == valuation.id,
            )
        )
        == 1
    )
    assert (
        await test_db_session.scalar(
            select(func.count(Link.id)).where(
                Link.source_id == confirmed_id,
                Link.target_id == evidence.id,
                Link.relation == "supported_by",
            )
        )
        == 1
    )

    summary = await finance_review_client.get(
        "/api/finance/summary?tax_year=2026&jurisdiction=SE&reporting_currency=EUR"
    )
    assert summary.status_code == 200, summary.text
    assert summary.json()["counts"]["confirmed_events"] == 1
    assert summary.json()["counts"]["missing_evidence"] == 0
    assert Decimal(summary.json()["totals"]["rewards"]) == Decimal("0.4")
    projected_lot = await test_db_session.scalar(
        select(FinanceLot).where(
            FinanceLot.user_id == test_user.id,
            FinanceLot.acquisition_revision_id == confirmed_id,
        )
    )
    assert projected_lot is not None
    assert projected_lot.acquisition_valuation_id == override_valuation.id

    grouped = await finance_review_client.get("/api/finance/activity?view=grouped&status=confirmed")
    assert grouped.status_code == 200, grouped.text
    assert grouped.json()["page"]["total"] == 1
    assert grouped.json()["items"][0]["id"] == seed.group.id

    lineage = await finance_review_client.get(
        f"/api/finance/events/{seed.revisions[0].event_id}/lineage"
    )
    assert lineage.status_code == 200, lineage.text
    by_id = {item["id"]: item for item in lineage.json()["revisions"]}
    assert set(by_id[confirmed_id]["valuation_ids"]) == {
        valuation.id,
        override_valuation.id,
    }
    assert by_id[confirmed_id]["evidence_document_ids"] == [evidence.id]
    assert by_id[confirmed_id]["audit_entry_ids"]
    assert by_id[seed.revisions[0].id]["audit_entry_ids"]


async def test_confirmation_invokes_tax_candidate_and_report_restatement_hooks(
    finance_review_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed = await _seed_group(test_db_session, test_user, member_count=1)
    tax_calls: list[dict[str, object]] = []
    report_calls: list[dict[str, object]] = []
    investment_calls: list[dict[str, object]] = []

    async def record_tax_call(*_args: object, **kwargs: object) -> tuple[()]:
        tax_calls.append(kwargs)
        return ()

    async def record_report_call(*_args: object, **kwargs: object) -> tuple[()]:
        report_calls.append(kwargs)
        return ()

    async def record_investment_call(*_args: object, **kwargs: object) -> None:
        investment_calls.append(kwargs)

    monkeypatch.setattr(
        finance_review_route,
        "persist_default_candidates_for_confirmed_revision",
        record_tax_call,
    )
    monkeypatch.setattr(
        finance_review_route,
        "surface_report_restatement_questions",
        record_report_call,
    )
    monkeypatch.setattr(
        finance_review_route,
        "project_confirmed_investments",
        record_investment_call,
    )

    response = await finance_review_client.post(
        f"/api/finance/review-groups/{seed.group.id}/confirm",
        json={
            "expected_member_revision_ids": [seed.revisions[0].id],
            "create_reusable_policy": False,
            "reason": "Confirm and project dependent tax/report state",
        },
        headers={"Idempotency-Key": "confirm-dependent-hooks"},
    )

    assert response.status_code == 200, response.text
    successor_id = response.json()["confirmed_revision_ids"][0]
    assert tax_calls == [
        {
            "user_id": test_user.id,
            "actor_id": test_user.id,
            "event_revision_id": successor_id,
        }
    ]
    assert report_calls == [
        {
            "user_id": test_user.id,
            "actor_id": test_user.id,
            "input_type": "event_revision",
            "superseded_input_ids": (seed.revisions[0].id,),
            "successor_input_id": successor_id,
            "reason": "Confirm and project dependent tax/report state",
        }
    ]
    assert investment_calls == [
        {
            "user_id": test_user.id,
            "revision_ids": (successor_id,),
            "actor_id": test_user.id,
        }
    ]


async def test_confirmation_rejects_a_group_whose_member_is_no_longer_current(
    finance_review_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    seed = await _seed_group(test_db_session, test_user, member_count=1)
    source = seed.revisions[0]
    successor = FinanceEventRevision(
        user_id=test_user.id,
        event_id=source.event_id,
        revision_number=2,
        event_type=source.event_type,
        effective_at=source.effective_at,
        tax_date=source.tax_date,
        tax_day_policy=source.tax_day_policy,
        source_account_id=source.source_account_id,
        semantic_fingerprint=uuid4().hex,
        status="proposed",
        derivation_type="fixture",
        derivation_version="2",
        supersedes_revision_id=source.id,
        created_by_type="system:fixture",
    )
    test_db_session.add(successor)
    await test_db_session.flush()
    event = await test_db_session.get(FinanceEvent, source.event_id)
    assert event is not None
    event.current_revision_id = successor.id
    await test_db_session.commit()

    response = await finance_review_client.post(
        f"/api/finance/review-groups/{seed.group.id}/confirm",
        json={
            "expected_member_revision_ids": [source.id],
            "create_reusable_policy": False,
            "reason": "This must be rejected as stale",
        },
        headers={"Idempotency-Key": "confirm-stale-lineage"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == (
        "Review group contains stale or non-current event revisions"
    )


@pytest.mark.parametrize(
    ("shared_hash", "expected_status"),
    (("fixture-transaction-hash", "confirmed"), (None, "proposed")),
)
async def test_confirmed_transfer_legs_persist_idempotent_scored_matches(
    finance_review_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    shared_hash: str | None,
    expected_status: str,
) -> None:
    outgoing, incoming = await _seed_transfer_pair(
        test_db_session,
        test_user,
        shared_hash=shared_hash,
    )
    first = await finance_review_client.post(
        f"/api/finance/review-groups/{outgoing.group.id}/confirm",
        json={
            "expected_member_revision_ids": [outgoing.revisions[0].id],
            "create_reusable_policy": False,
            "reason": "Confirm outgoing owner-controlled transfer leg",
        },
        headers={"Idempotency-Key": f"transfer-out-{expected_status}"},
    )
    assert first.status_code == 200, first.text
    second_payload = {
        "expected_member_revision_ids": [incoming.revisions[0].id],
        "create_reusable_policy": False,
        "reason": "Confirm incoming owner-controlled transfer leg",
    }
    second_headers = {"Idempotency-Key": f"transfer-in-{expected_status}"}
    second = await finance_review_client.post(
        f"/api/finance/review-groups/{incoming.group.id}/confirm",
        json=second_payload,
        headers=second_headers,
    )
    retry = await finance_review_client.post(
        f"/api/finance/review-groups/{incoming.group.id}/confirm",
        json=second_payload,
        headers=second_headers,
    )

    assert second.status_code == 200, second.text
    assert retry.json() == second.json()
    match_rows = list(
        (
            await test_db_session.scalars(
                select(FinanceTransferMatch).where(FinanceTransferMatch.user_id == test_user.id)
            )
        ).all()
    )
    assert len(match_rows) == 1
    match = match_rows[0]
    assert match.outgoing_revision_id == first.json()["confirmed_revision_ids"][0]
    assert match.incoming_revision_id == second.json()["confirmed_revision_ids"][0]
    assert match.fee_quantity.quantize(Decimal("0.0001")) == Decimal("0.0001")
    assert match.status == expected_status
    assert match.explanation["conserves_quantity"] is True
    assert match.explanation["matching_rule_version"] == "transfer-v1"
    assert (
        await test_db_session.scalar(
            select(func.count(FinanceAuditEntry.id)).where(
                FinanceAuditEntry.user_id == test_user.id,
                FinanceAuditEntry.entity_type == "finance_transfer_match",
                FinanceAuditEntry.entity_id == match.id,
            )
        )
        == 1
    )


async def test_split_preserves_totals_and_defer_records_audit(
    finance_review_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    split_seed = await _seed_group(test_db_session, test_user)
    split = await finance_review_client.post(
        f"/api/finance/review-groups/{split_seed.group.id}/split",
        json={
            "partitions": [
                {"label": "First", "member_revision_ids": [split_seed.revisions[0].id]},
                {"label": "Second", "member_revision_ids": [split_seed.revisions[1].id]},
            ],
            "reason": "Separate review decisions",
        },
        headers={"Idempotency-Key": "split-review-api"},
    )
    assert split.status_code == 200, split.text
    assert split.json()["before_totals"] == split.json()["after_totals"]
    assert len(split.json()["replacement_groups"]) == 2
    replacement_ids = [item["id"] for item in split.json()["replacement_groups"]]
    assert (
        await test_db_session.scalar(
            select(func.count(FinanceReviewGroupMember.event_revision_id)).where(
                FinanceReviewGroupMember.group_id == split_seed.group.id
            )
        )
        == 2
    )
    assert (
        await test_db_session.scalar(
            select(func.count(FinanceReviewGroup.id)).where(
                FinanceReviewGroup.id.in_(replacement_ids),
                FinanceReviewGroup.supersedes_group_id == split_seed.group.id,
            )
        )
        == 2
    )

    defer_seed = await _seed_group(test_db_session, test_user, member_count=1)
    deferred = await finance_review_client.post(
        f"/api/finance/review-groups/{defer_seed.group.id}/defer",
        json={"reason": "Awaiting statement", "revisit_on": "2026-02-01"},
        headers={"Idempotency-Key": "defer-review-api"},
    )
    assert deferred.status_code == 200, deferred.text
    assert deferred.json()["group"]["status"] == "deferred"
    assert deferred.json()["audit"]["action"] == "review_group.deferred"


async def test_reconciliation_replays_owned_postings_with_decimal_strings(
    finance_review_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    seed = await _seed_group(test_db_session, test_user, member_count=1, quantity=Decimal("0.003"))
    revision = seed.revisions[0]
    revision.status = "confirmed"
    test_db_session.add_all(
        (
            FinancePosting(
                user_id=test_user.id,
                event_revision_id=revision.id,
                account_id=seed.account.id,
                ledger_account="asset:custody",
                asset_id=seed.asset.id,
                quantity=Decimal("0.003"),
                posting_role="reward_asset",
            ),
            FinancePosting(
                user_id=test_user.id,
                event_revision_id=revision.id,
                ledger_account="income:reward",
                asset_id=seed.asset.id,
                quantity=Decimal("-0.003"),
                posting_role="reward_income",
            ),
        )
    )
    await test_db_session.commit()

    response = await finance_review_client.post(
        "/api/finance/reconciliations/run",
        json={
            "account_id": seed.account.id,
            "asset_id": seed.asset.id,
            "period_start": "2026-01-01",
            "period_end": "2026-01-31",
            "opening_balance": "1.000000",
            "closing_balance": "1.003000",
            "tolerance": "0",
            "source_revision_ids": [revision.id],
        },
        headers={"Idempotency-Key": "reconcile-review-api"},
    )

    assert response.status_code == 200, response.text
    result = response.json()["reconciliation"]
    expected = {
        "opening_balance": Decimal("1.000000"),
        "movement_total": Decimal("0.003000"),
        "closing_balance": Decimal("1.003000"),
        "difference": Decimal("0"),
    }
    for field, value in expected.items():
        assert isinstance(result[field], str)
        assert Decimal(result[field]) == value
    assert result["status"] == "reconciled"
    assert await test_db_session.scalar(select(func.count(FinanceReconciliation.id))) == 1


async def test_activity_projects_grouped_and_raw_without_hiding_member_ids(
    finance_review_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    seed = await _seed_group(test_db_session, test_user)

    grouped = await finance_review_client.get("/api/finance/activity?view=grouped")
    raw = await finance_review_client.get("/api/finance/activity?view=raw")

    assert grouped.status_code == 200
    assert grouped.json()["items"][0]["representation"] == "group"
    assert set(grouped.json()["items"][0]["member_revision_ids"]) == {
        revision.id for revision in seed.revisions
    }
    assert raw.status_code == 200
    assert len(raw.json()["items"]) == 2
    assert {item["representation"] for item in raw.json()["items"]} == {"raw"}
    assert {item["id"] for item in raw.json()["items"]} == {
        revision.id for revision in seed.revisions
    }
