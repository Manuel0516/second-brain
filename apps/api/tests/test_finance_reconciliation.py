from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from decimal import Decimal
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
    FinanceEventRevision,
    FinancePosting,
    FinanceReconciliation,
    FinanceTaxProfile,
    User,
)
from app.routes.finance_review import router as finance_review_router
from app.services.finance_ledger import FinanceLedgerError
from app.services.finance_reconciliation import (
    TransferLeg,
    reconcile_balances,
    score_transfer_candidate,
)

pytestmark = pytest.mark.anyio


@pytest.fixture
async def reconciliation_client(
    test_engine: AsyncEngine, test_user: User
) -> AsyncIterator[AsyncClient]:
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


async def _seed_movement(
    session: AsyncSession, user: User, *, quantity: Decimal
) -> tuple[FinanceAccount, FinanceAsset, FinanceEventRevision]:
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
    event = FinanceEvent(user_id=user.id)
    session.add(event)
    await session.flush()
    revision = FinanceEventRevision(
        user_id=user.id,
        event_id=event.id,
        revision_number=1,
        event_type="staking_reward",
        effective_at=datetime(2026, 1, 15, tzinfo=UTC),
        tax_date=datetime(2026, 1, 15, tzinfo=UTC).date(),
        tax_day_policy="Europe/Stockholm-v1",
        source_account_id=account.id,
        semantic_fingerprint=uuid4().hex,
        status="confirmed",
        derivation_type="fixture",
        derivation_version="1",
        created_by_type="system:fixture",
    )
    session.add(revision)
    await session.flush()
    event.current_revision_id = revision.id
    session.add_all(
        (
            FinancePosting(
                user_id=user.id,
                event_revision_id=revision.id,
                account_id=account.id,
                ledger_account="asset:custody",
                asset_id=asset.id,
                quantity=quantity,
                posting_role="reward_asset",
            ),
            FinancePosting(
                user_id=user.id,
                event_revision_id=revision.id,
                ledger_account="income:reward",
                asset_id=asset.id,
                quantity=-quantity,
                posting_role="reward_income",
            ),
        )
    )
    await session.commit()
    return account, asset, revision


def test_transfer_match_conserves_sent_incoming_and_network_fee() -> None:
    timestamp = datetime(2026, 1, 15, tzinfo=UTC)
    candidate = score_transfer_candidate(
        TransferLeg(
            revision_id="outgoing",
            account_id="wallet-a",
            asset_id="btc",
            quantity="-1.00010000",
            effective_at=timestamp,
            owner_controlled=True,
            transaction_hash="hash-1",
            network="bitcoin",
            address="owned-address",
        ),
        TransferLeg(
            revision_id="incoming",
            account_id="wallet-b",
            asset_id="btc",
            quantity="1.00000000",
            effective_at=timestamp + timedelta(minutes=5),
            owner_controlled=True,
            transaction_hash="hash-1",
            network="bitcoin",
            address="owned-address",
        ),
    )

    assert candidate.fee_quantity == Decimal("0.00010000")
    assert Decimal("1.00010000") == Decimal("1.00000000") + candidate.fee_quantity
    assert candidate.conserves_quantity
    assert candidate.score == Decimal("1.000000")
    assert candidate.suggested


def test_transfer_match_does_not_suggest_cross_asset_pair() -> None:
    timestamp = datetime(2026, 1, 15, tzinfo=UTC)
    candidate = score_transfer_candidate(
        TransferLeg("out", "a", "btc", "-1", timestamp, True),
        TransferLeg("in", "b", "eth", "1", timestamp, True),
    )

    assert candidate.fee_quantity is None
    assert not candidate.conserves_quantity
    assert not candidate.suggested


def test_frozen_reconciliation_opening_plus_movements_equals_closing() -> None:
    result = reconcile_balances(
        account_id="exchange",
        asset_id="crypto",
        opening_balance="1.000000",
        movements=["0.000125"] * 24,
        closing_balance="1.003000",
        tolerance="0",
        materiality="0.001",
        source_revision_ids=[f"revision-{index}" for index in range(24)],
    )

    assert result.movement_total == Decimal("0.003000")
    assert result.expected_closing_balance == Decimal("1.003000")
    assert result.difference == Decimal("0.000000")
    assert result.status == "reconciled"
    assert not result.issues
    assert result.audit.action == "reconciliation.run"


def test_immaterial_difference_warns_but_material_difference_blocks_reports() -> None:
    warning = reconcile_balances(
        account_id="bank",
        opening_balance="100",
        movements=("25",),
        closing_balance="125.02",
        tolerance="0.01",
        materiality="1.00",
        source_revision_ids=("revision-1",),
    )
    blocked = reconcile_balances(
        account_id="bank",
        opening_balance="100",
        movements=("25",),
        closing_balance="127",
        tolerance="0.01",
        materiality="1.00",
        source_revision_ids=("revision-1",),
    )

    assert warning.status == "warning"
    assert warning.issues[0].severity == "warning"
    assert blocked.status == "blocked"
    assert blocked.issues[0].code == "material_reconciliation_difference"
    assert blocked.issues[0].severity == "blocking"


def test_missing_movement_lineage_is_a_blocker_even_when_balances_match() -> None:
    result = reconcile_balances(
        account_id="bank",
        opening_balance="100",
        movements=("25",),
        closing_balance="125",
        tolerance="0",
        materiality="1",
        source_revision_ids=(),
        require_source_revisions=True,
    )

    assert result.difference == 0
    assert result.status == "blocked"
    assert result.issues[0].code == "missing_movement_lineage"


def test_reconciliation_rejects_duplicate_source_revision_lineage() -> None:
    with pytest.raises(FinanceLedgerError, match="must be unique"):
        reconcile_balances(
            account_id="bank",
            opening_balance="0",
            movements=("1",),
            closing_balance="1",
            tolerance="0",
            source_revision_ids=("revision-1", "revision-1"),
        )


async def test_reconciliation_run_replays_owned_postings_and_is_idempotent(
    reconciliation_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    account, asset, revision = await _seed_movement(
        test_db_session,
        test_user,
        quantity=Decimal("0.003000"),
    )
    payload = {
        "account_id": account.id,
        "asset_id": asset.id,
        "period_start": "2026-01-01",
        "period_end": "2026-01-31",
        "opening_balance": "1.000000",
        "closing_balance": "1.003000",
        "tolerance": "0",
        "source_revision_ids": [revision.id],
    }
    headers = {"Idempotency-Key": "reconcile-fixture"}

    first = await reconciliation_client.post(
        "/api/finance/reconciliations/run", json=payload, headers=headers
    )
    second = await reconciliation_client.post(
        "/api/finance/reconciliations/run", json=payload, headers=headers
    )

    assert first.status_code == 200, first.text
    assert second.json() == first.json()
    reconciliation = first.json()["reconciliation"]
    assert reconciliation["movement_total"] == "0.003000000000000000"
    assert reconciliation["difference"] == "0.000000000000000000"
    assert reconciliation["status"] == "reconciled"
    row_count = int(await test_db_session.scalar(select(func.count(FinanceReconciliation.id))) or 0)
    audit_count = int(await test_db_session.scalar(select(func.count(FinanceAuditEntry.id))) or 0)
    assert row_count == 1
    assert audit_count == 1

    listed = await reconciliation_client.get("/api/finance/reconciliations")
    assert listed.status_code == 200
    assert listed.json()["page"]["total"] == 1


async def test_reconciliation_rejects_unowned_or_mismatched_revision_scope(
    reconciliation_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    account, asset, revision = await _seed_movement(
        test_db_session,
        test_user,
        quantity=Decimal("1"),
    )
    other_account = FinanceAccount(
        user_id=test_user.id,
        name="Other",
        institution="Example",
        account_type="bank",
        country_code="SE",
        base_currency="EUR",
        provider="manual",
    )
    test_db_session.add(other_account)
    await test_db_session.commit()

    response = await reconciliation_client.post(
        "/api/finance/reconciliations/run",
        json={
            "account_id": other_account.id,
            "asset_id": asset.id,
            "period_start": "2026-01-01",
            "period_end": "2026-01-31",
            "opening_balance": "0",
            "closing_balance": "1",
            "tolerance": "0",
            "source_revision_ids": [revision.id],
        },
        headers={"Idempotency-Key": "mismatched-account"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Revision does not belong to the reconciliation account"
    assert account.id != other_account.id


async def test_reconciliation_rejects_noncurrent_or_out_of_period_revisions(
    reconciliation_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    account, asset, revision = await _seed_movement(
        test_db_session,
        test_user,
        quantity=Decimal("1"),
    )
    revision.status = "proposed"
    await test_db_session.commit()
    payload = {
        "account_id": account.id,
        "asset_id": asset.id,
        "period_start": "2026-01-01",
        "period_end": "2026-01-31",
        "opening_balance": "0",
        "closing_balance": "1",
        "tolerance": "0",
        "source_revision_ids": [revision.id],
    }

    proposed = await reconciliation_client.post(
        "/api/finance/reconciliations/run",
        json=payload,
        headers={"Idempotency-Key": "proposed-reconciliation"},
    )
    assert proposed.status_code == 409
    assert proposed.json()["detail"] == (
        "Reconciliation requires current confirmed event revisions"
    )

    revision.status = "confirmed"
    await test_db_session.commit()
    payload["period_start"] = "2025-01-01"
    payload["period_end"] = "2025-12-31"
    outside = await reconciliation_client.post(
        "/api/finance/reconciliations/run",
        json=payload,
        headers={"Idempotency-Key": "out-of-period-reconciliation"},
    )
    assert outside.status_code == 409
    assert outside.json()["detail"] == "Revision falls outside the reconciliation period"


async def test_account_currency_reconciliation_rejects_unvalued_asset_quantities(
    reconciliation_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    account, _, revision = await _seed_movement(
        test_db_session,
        test_user,
        quantity=Decimal("1"),
    )

    response = await reconciliation_client.post(
        "/api/finance/reconciliations/run",
        json={
            "account_id": account.id,
            "asset_id": None,
            "period_start": "2026-01-01",
            "period_end": "2026-01-31",
            "opening_balance": "0",
            "closing_balance": "1",
            "tolerance": "0",
            "source_revision_ids": [revision.id],
        },
        headers={"Idempotency-Key": "unvalued-account-currency"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == (
        "Account-currency reconciliation requires valued postings in EUR"
    )


async def test_active_tax_profile_makes_nonmaterial_difference_a_warning(
    reconciliation_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    account, asset, revision = await _seed_movement(
        test_db_session,
        test_user,
        quantity=Decimal("0.003"),
    )
    test_db_session.add(
        FinanceTaxProfile(
            user_id=test_user.id,
            tax_year=2026,
            jurisdiction="SE",
            reporting_currency="EUR",
            materiality_threshold=Decimal("1"),
            reconciliation_tolerance=Decimal("0.01"),
            status="active",
            valuation_policy={},
        )
    )
    await test_db_session.commit()

    response = await reconciliation_client.post(
        "/api/finance/reconciliations/run",
        json={
            "account_id": account.id,
            "asset_id": asset.id,
            "period_start": "2026-01-01",
            "period_end": "2026-01-31",
            "opening_balance": "1",
            "closing_balance": "1.503",
            "tolerance": "0.01",
            "source_revision_ids": [revision.id],
        },
        headers={"Idempotency-Key": "warning-reconciliation"},
    )

    assert response.status_code == 200, response.text
    reconciliation = response.json()["reconciliation"]
    assert reconciliation["status"] == "warning"
    assert Decimal(reconciliation["difference"]) == Decimal("0.5")


async def test_reconciliation_list_completeness_includes_blockers_outside_page(
    reconciliation_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    account, asset, _ = await _seed_movement(
        test_db_session,
        test_user,
        quantity=Decimal("0"),
    )
    blocked = FinanceReconciliation(
        user_id=test_user.id,
        account_id=account.id,
        asset_id=asset.id,
        period_start=datetime(2025, 1, 1, tzinfo=UTC).date(),
        period_end=datetime(2025, 1, 31, tzinfo=UTC).date(),
        opening_balance=Decimal("0"),
        movement_total=Decimal("0"),
        closing_balance=Decimal("1"),
        difference=Decimal("1"),
        tolerance=Decimal("0"),
        status="blocked",
        source_revision_ids=[],
        run_at=datetime(2025, 2, 1, tzinfo=UTC),
    )
    reconciled = FinanceReconciliation(
        user_id=test_user.id,
        account_id=account.id,
        asset_id=asset.id,
        period_start=datetime(2026, 1, 1, tzinfo=UTC).date(),
        period_end=datetime(2026, 1, 31, tzinfo=UTC).date(),
        opening_balance=Decimal("0"),
        movement_total=Decimal("0"),
        closing_balance=Decimal("0"),
        difference=Decimal("0"),
        tolerance=Decimal("0"),
        status="reconciled",
        source_revision_ids=[],
        run_at=datetime(2026, 2, 1, tzinfo=UTC),
    )
    test_db_session.add_all((blocked, reconciled))
    await test_db_session.commit()

    response = await reconciliation_client.get("/api/finance/reconciliations?limit=1")

    assert response.status_code == 200
    assert response.json()["items"][0]["id"] == reconciled.id
    assert response.json()["completeness"]["is_complete"] is False
    assert response.json()["completeness"]["blockers"][0]["entity_id"] == blocked.id
