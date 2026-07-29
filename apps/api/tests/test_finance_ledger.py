import csv
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.database import get_async_session
from app.dependencies import get_current_user
from app.models import (
    FinanceAccount,
    FinanceAsset,
    FinanceAuditEntry,
    FinanceEvent,
    FinanceEventComponent,
    FinanceEventRevision,
    FinancePosting,
    FinanceReviewGroup,
    FinanceReviewGroupMember,
    User,
)
from app.routes.finance_review import router as finance_review_router
from app.services.finance_ledger import (
    CanonicalEventRevisionPlan,
    ComponentInput,
    FinanceLedgerError,
    PostingInput,
    ReviewMember,
    ReviewPartition,
    UnbalancedPostingsError,
    build_canonical_event_revision,
    plan_event_correction,
    plan_group_confirmation,
    plan_group_defer,
    plan_group_split,
    replay_postings,
    reusable_policy_matches,
    summarize_daily_group,
    validate_balanced_postings,
)

pytestmark = pytest.mark.anyio

FIXTURE = Path(__file__).parent / "fixtures" / "finance" / "staking_rewards.csv"
ACCOUNT_ID = "00000000-0000-0000-0000-000000000001"
ASSET_ID = "00000000-0000-0000-0000-000000000002"
USER_ID = "00000000-0000-0000-0000-000000000003"


@pytest.fixture
async def review_client(test_engine: AsyncEngine, test_user: User) -> AsyncIterator[AsyncClient]:
    api = FastAPI()
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


async def _seed_review_group(
    session: AsyncSession,
    user: User,
    *,
    member_count: int = 2,
    quantity: Decimal = Decimal("0.000125"),
) -> tuple[FinanceReviewGroup, list[FinanceEventRevision]]:
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
    total_quantity = quantity * member_count
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
        native_quantity=total_quantity,
        report_value=total_quantity * Decimal("2400.00"),
        report_currency="EUR",
        materiality=total_quantity * Decimal("2400.00"),
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
    return group, revisions


def _reward_revision(
    index: int, timestamp: datetime, quantity: str, value: str
) -> CanonicalEventRevisionPlan:
    revision_id = f"00000000-0000-0000-0001-{index:012d}"
    return build_canonical_event_revision(
        user_id=USER_ID,
        event_type="staking_reward",
        effective_at=timestamp,
        tax_date=date(2026, 1, 15),
        tax_day_policy="Europe/Stockholm-v1",
        source_account_id=ACCOUNT_ID,
        raw_record_ids=(f"raw-{index}",),
        revision_id=revision_id,
        components=(
            ComponentInput(
                role="reward",
                account_id=ACCOUNT_ID,
                asset_id=ASSET_ID,
                quantity=quantity,
                fiat_value=value,
                currency="EUR",
            ),
        ),
        postings=(
            PostingInput(
                ledger_account="asset:custody",
                account_id=ACCOUNT_ID,
                asset_id=ASSET_ID,
                quantity=quantity,
                fiat_value=value,
                currency="EUR",
                posting_role="reward_asset",
            ),
            PostingInput(
                ledger_account="income:staking",
                asset_id=ASSET_ID,
                quantity=-Decimal(quantity),
                fiat_value=-Decimal(value),
                currency="EUR",
                posting_role="reward_income",
            ),
        ),
    )


def _fixture_members() -> tuple[ReviewMember, ...]:
    with FIXTURE.open(newline="", encoding="utf-8") as fixture:
        rows = list(csv.DictReader(fixture))
    members: list[ReviewMember] = []
    for index, row in enumerate(rows, start=1):
        timestamp = datetime.fromisoformat(row["timestamp"])
        value = str(Decimal(row["quantity"]) * Decimal(row["price_eur"]))
        revision = _reward_revision(index, timestamp, row["quantity"], value)
        members.append(
            ReviewMember(
                revision_id=revision.revision_id,
                account_id=ACCOUNT_ID,
                source_id="fixture:staking_rewards.csv",
                asset_id=ASSET_ID,
                event_type="staking_reward",
                tax_date=date(2026, 1, 15),
                tax_day_policy="Europe/Stockholm-v1",
                jurisdiction="SE",
                candidate_treatment="staking_income",
                valuation_policy="fixture-price-v1",
                evidence_condition="present",
                effective_at=timestamp,
                native_quantity=row["quantity"],
                report_value=value,
                report_currency="EUR",
                observed_at=datetime(2026, 1, 16, tzinfo=UTC),
                revision=revision,
            )
        )
    return tuple(members)


def test_float_values_are_rejected_at_the_finance_boundary() -> None:
    with pytest.raises(FinanceLedgerError, match="decimal string"):
        validate_balanced_postings(
            (
                PostingInput("asset", ASSET_ID, cast(Any, 0.1), "asset"),
                PostingInput("income", ASSET_ID, "-0.1", "income"),
            )
        )


def test_unbalanced_asset_or_currency_postings_are_rejected() -> None:
    with pytest.raises(UnbalancedPostingsError, match="Unbalanced postings"):
        validate_balanced_postings(
            (
                PostingInput("asset", ASSET_ID, "0.1", "asset", fiat_value="1", currency="EUR"),
                PostingInput(
                    "income", ASSET_ID, "-0.09", "income", fiat_value="-1", currency="EUR"
                ),
            )
        )


def test_append_only_correction_keeps_prior_and_links_audit_revisions() -> None:
    prior = _reward_revision(1, datetime(2026, 1, 15, tzinfo=UTC), "0.000125", "0.30000000")
    correction = plan_event_correction(prior, reason="Confirmed against source statement")

    assert prior.status == "proposed"
    assert prior.revision_number == 1
    assert correction.event_id == prior.event_id
    assert correction.revision_number == 2
    assert correction.status == "confirmed"
    assert correction.supersedes_revision_id == prior.revision_id
    assert correction.audit.prior_revision_id == prior.revision_id
    assert correction.audit.new_revision_id == correction.revision_id
    assert {posting.event_revision_id for posting in correction.postings} == {
        correction.revision_id
    }


def test_frozen_24_event_fixture_groups_without_losing_members_or_totals() -> None:
    group = summarize_daily_group(_fixture_members(), label="Daily staking rewards")

    assert len(group.members) == 24
    assert group.native_quantity == Decimal("0.003000")
    assert group.report_value == Decimal("7.20000000")
    assert group.minimum_rate == Decimal("2400.00")
    assert group.maximum_rate == Decimal("2400.00")
    assert group.weighted_average_rate == Decimal("2400.00")
    assert group.evidence_coverage == Decimal("1")
    assert len({member.revision_id for member in group.members}) == 24


def test_confirmation_creates_successor_revisions_audit_inputs_and_future_policy() -> None:
    group = summarize_daily_group(_fixture_members(), label="Daily staking rewards")
    confirmed_at = datetime(2026, 1, 17, tzinfo=UTC)
    result = plan_group_confirmation(
        group,
        expected_member_revision_ids=[member.revision_id for member in group.members],
        create_reusable_policy=True,
        reason="Checked all rows against exchange evidence",
        confirmed_at=confirmed_at,
    )

    assert len(result.confirmed_revisions) == 24
    assert all(revision.status == "confirmed" for revision in result.confirmed_revisions)
    assert all(revision.revision_number == 2 for revision in result.confirmed_revisions)
    assert len(result.audit_intents) == 25
    assert result.audit_intents[-1].action == "review_group.confirmed"
    assert result.policy_criteria is not None

    future = _fixture_members()[0]
    future = ReviewMember(
        **{
            field: getattr(future, field)
            for field in ReviewMember.__dataclass_fields__
            if field not in {"revision_id", "observed_at", "revision"}
        },
        revision_id="future-revision",
        observed_at=confirmed_at + timedelta(seconds=1),
    )
    historical = ReviewMember(
        **{
            field: getattr(future, field)
            for field in ReviewMember.__dataclass_fields__
            if field not in {"revision_id", "observed_at", "revision"}
        },
        revision_id="historical-revision",
        observed_at=confirmed_at,
    )
    assert reusable_policy_matches(result.policy_criteria, future)
    assert not reusable_policy_matches(result.policy_criteria, historical)


def test_split_8_and_16_preserves_frozen_totals_and_every_member() -> None:
    group = summarize_daily_group(_fixture_members(), label="Daily staking rewards")
    ids = tuple(member.revision_id for member in group.members)
    result = plan_group_split(
        group,
        partitions=(
            ReviewPartition("Early rewards", ids[:8]),
            ReviewPartition("Later rewards", ids[8:]),
        ),
        reason="Separate operational windows",
    )

    assert [len(item.members) for item in result.replacement_groups] == [8, 16]
    assert result.before_native_quantity == result.after_native_quantity == Decimal("0.003000")
    assert result.before_report_value == result.after_report_value == Decimal("7.20000000")
    assert len({item.grouping_key for item in result.replacement_groups}) == 2
    assert result.audit.action == "review_group.split"


def test_split_rejects_duplicates_and_defer_is_audited() -> None:
    group = summarize_daily_group(_fixture_members()[:2], label="Daily staking rewards")
    duplicate = group.members[0].revision_id
    with pytest.raises(FinanceLedgerError, match="exactly once"):
        plan_group_split(
            group,
            partitions=(ReviewPartition("One", (duplicate,)), ReviewPartition("Two", (duplicate,))),
            reason="Invalid split",
        )

    deferred = plan_group_defer(
        group,
        reason="Awaiting statement",
        revisit_on=date(2026, 2, 1),
    )
    assert deferred.status == "deferred"
    assert deferred.audit.action == "review_group.deferred"


def test_posting_replay_uses_the_explicit_revision_set() -> None:
    first = _reward_revision(1, datetime(2026, 1, 15, tzinfo=UTC), "0.000125", "0.30000000")
    second = _reward_revision(2, datetime(2026, 1, 15, 1, tzinfo=UTC), "0.000125", "0.30000000")
    balances = replay_postings(
        (*first.postings, *second.postings),
        selected_revision_ids=(first.revision_id,),
    )

    by_ledger = {balance.ledger_account: balance.quantity for balance in balances}
    assert by_ledger == {
        "asset:custody": Decimal("0.000125"),
        "income:staking": Decimal("-0.000125"),
    }


async def test_review_group_list_is_owner_scoped_and_contract_typed(
    review_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    group, revisions = await _seed_review_group(test_db_session, test_user)

    response = await review_client.get("/api/finance/review-groups")

    assert response.status_code == 200
    body = response.json()
    assert body["page"]["total"] == 1
    assert body["items"][0]["id"] == group.id
    assert set(body["items"][0]["member_revision_ids"]) == {revision.id for revision in revisions}
    assert body["items"][0]["native_quantity"] == "0.000250000000000000"
    assert body["items"][0]["completeness"]["is_complete"] is True


async def test_review_confirmation_is_append_only_balanced_audited_and_idempotent(
    review_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    group, revisions = await _seed_review_group(test_db_session, test_user)
    payload = {
        "expected_member_revision_ids": [revision.id for revision in revisions],
        "create_reusable_policy": True,
        "reason": "Checked against exchange evidence",
    }
    headers = {"Idempotency-Key": "confirm-fixture-group"}

    first = await review_client.post(
        f"/api/finance/review-groups/{group.id}/confirm",
        json=payload,
        headers=headers,
    )
    second = await review_client.post(
        f"/api/finance/review-groups/{group.id}/confirm",
        json=payload,
        headers=headers,
    )

    assert first.status_code == 200, first.text
    assert second.json() == first.json()
    body = first.json()
    assert len(body["confirmed_revision_ids"]) == 2
    assert body["preview"]["posting_count"] == 4
    assert body["policy_id"] is not None
    all_revisions = list(
        (
            await test_db_session.scalars(
                select(FinanceEventRevision).where(FinanceEventRevision.user_id == test_user.id)
            )
        ).all()
    )
    assert len(all_revisions) == 4
    assert sum(revision.status == "proposed" for revision in all_revisions) == 2
    assert sum(revision.status == "confirmed" for revision in all_revisions) == 2
    confirmed_ids = set(body["confirmed_revision_ids"])
    postings = list(
        (
            await test_db_session.scalars(
                select(FinancePosting).where(FinancePosting.event_revision_id.in_(confirmed_ids))
            )
        ).all()
    )
    assert len(postings) == 4
    assert sum((posting.quantity for posting in postings), Decimal(0)) == 0
    audit_count = int(
        await test_db_session.scalar(
            select(func.count(FinanceAuditEntry.id)).where(
                FinanceAuditEntry.user_id == test_user.id
            )
        )
        or 0
    )
    projection_audit_count = int(
        await test_db_session.scalar(
            select(func.count(FinanceAuditEntry.id)).where(
                FinanceAuditEntry.user_id == test_user.id,
                FinanceAuditEntry.action == "investment.projection_created",
            )
        )
        or 0
    )
    assert audit_count == 5
    assert projection_audit_count == 2


async def test_review_split_and_defer_preserve_totals_and_audit(
    review_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    split_group, split_revisions = await _seed_review_group(test_db_session, test_user)
    split = await review_client.post(
        f"/api/finance/review-groups/{split_group.id}/split",
        json={
            "partitions": [
                {"label": "First", "member_revision_ids": [split_revisions[0].id]},
                {"label": "Second", "member_revision_ids": [split_revisions[1].id]},
            ],
            "reason": "Separate review decisions",
        },
        headers={"Idempotency-Key": "split-fixture-group"},
    )

    assert split.status_code == 200, split.text
    split_body = split.json()
    assert split_body["before_totals"] == split_body["after_totals"]
    assert len(split_body["replacement_groups"]) == 2

    defer_group, _ = await _seed_review_group(test_db_session, test_user, member_count=1)
    deferred = await review_client.post(
        f"/api/finance/review-groups/{defer_group.id}/defer",
        json={"reason": "Awaiting statement", "revisit_on": "2026-02-01"},
        headers={"Idempotency-Key": "defer-fixture-group"},
    )
    assert deferred.status_code == 200, deferred.text
    assert deferred.json()["group"]["status"] == "deferred"
    assert deferred.json()["audit"]["action"] == "review_group.deferred"
