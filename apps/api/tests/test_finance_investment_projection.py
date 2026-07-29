from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    File,
    FinanceAccount,
    FinanceAsset,
    FinanceBotEquitySnapshot,
    FinanceEvent,
    FinanceEventComponent,
    FinanceEventRevision,
    FinanceEvidenceDocument,
    FinanceLot,
    FinanceLotDisposal,
    FinanceOpenQuestion,
    FinancePosition,
    FinancePositionRevision,
    Link,
    User,
)
from app.services.finance_investment_projection import project_confirmed_investments

pytestmark = pytest.mark.anyio


async def _account_and_asset(
    session: AsyncSession,
    user: User,
    *,
    asset_type: str,
    jurisdiction: str = "SE",
) -> tuple[FinanceAccount, FinanceAsset]:
    account = FinanceAccount(
        user_id=user.id,
        name="Investment account",
        institution="Fixture provider",
        account_type="broker",
        country_code=jurisdiction,
        base_currency="EUR",
        tax_jurisdiction=jurisdiction,
        provider="fixture",
    )
    asset = FinanceAsset(
        user_id=user.id,
        asset_type=asset_type,
        symbol=f"FIX{uuid4().hex[:6]}",
        name="Fixture asset",
        attributes={},
    )
    session.add_all((account, asset))
    await session.flush()
    return account, asset


async def _confirmed_revision(
    session: AsyncSession,
    user: User,
    account: FinanceAccount,
    *,
    event_type: str,
    components: tuple[dict[str, object], ...],
    attributes: dict[str, object] | None = None,
    effective_at: datetime | None = None,
) -> FinanceEventRevision:
    event = FinanceEvent(user_id=user.id)
    session.add(event)
    await session.flush()
    timestamp = effective_at or datetime(2026, 4, 10, 12, tzinfo=UTC)
    revision = FinanceEventRevision(
        user_id=user.id,
        event_id=event.id,
        revision_number=1,
        event_type=event_type,
        effective_at=timestamp,
        tax_date=timestamp.date(),
        tax_day_policy="Europe/Stockholm-v1",
        source_account_id=account.id,
        external_id=f"fixture-{uuid4()}",
        semantic_fingerprint=uuid4().hex,
        status="confirmed",
        derivation_type="fixture",
        derivation_version="1",
        created_by_type="system",
        attributes=attributes or {"jurisdiction": account.tax_jurisdiction},
    )
    session.add(revision)
    await session.flush()
    event.current_revision_id = revision.id
    session.add_all(
        FinanceEventComponent(
            user_id=user.id,
            event_revision_id=revision.id,
            role=str(component["role"]),
            account_id=account.id,
            asset_id=str(component["asset_id"]),
            quantity=Decimal(str(component["quantity"])),
            fiat_value=(
                None
                if component.get("fiat_value") is None
                else Decimal(str(component["fiat_value"]))
            ),
            currency=(None if component.get("currency") is None else str(component["currency"])),
            attributes={},
        )
        for component in components
    )
    await session.flush()
    return revision


async def _attach_evidence(
    session: AsyncSession, user: User, revision: FinanceEventRevision
) -> FinanceEvidenceDocument:
    file_row = File(
        user_id=user.id,
        name=f"{revision.id}.csv",
        content_type="text/csv",
        size=10,
    )
    session.add(file_row)
    await session.flush()
    evidence = FinanceEvidenceDocument(
        user_id=user.id,
        file_id=file_row.id,
        original_name=file_row.name,
        media_type="text/csv",
        size=file_row.size,
        sha256=uuid4().hex * 2,
        object_version="fixture-v1",
        source_kind="statement",
        captured_at=revision.effective_at,
    )
    session.add(evidence)
    await session.flush()
    session.add(
        Link(
            source_type="finance_event_revision",
            source_id=revision.id,
            target_type="finance_evidence",
            target_id=evidence.id,
            relation="supported_by",
        )
    )
    await session.flush()
    return evidence


async def test_acquisition_and_disposal_projection_is_decimal_safe_and_idempotent(
    test_db_session: AsyncSession, test_user: User
) -> None:
    account, asset = await _account_and_asset(test_db_session, test_user, asset_type="fund")
    acquisition = await _confirmed_revision(
        test_db_session,
        test_user,
        account,
        event_type="trade",
        components=(
            {
                "role": "asset_in",
                "asset_id": asset.id,
                "quantity": "10",
                "fiat_value": "1000",
                "currency": "EUR",
            },
        ),
        attributes={"jurisdiction": "SE", "source_id": "purchase-row"},
    )
    await _attach_evidence(test_db_session, test_user, acquisition)
    acquired = await project_confirmed_investments(
        test_db_session,
        user_id=test_user.id,
        revision_ids=(acquisition.id,),
        actor_id=test_user.id,
    )
    assert acquired.created is True
    assert len(acquired.lot_ids) == 1
    lot = await test_db_session.get(FinanceLot, acquired.lot_ids[0])
    assert lot is not None
    assert lot.acquired_quantity == Decimal("10")
    assert lot.remaining_quantity == Decimal("10")
    assert lot.cost_basis == Decimal("1000")
    assert lot.method == "average_cost"
    assert lot.provenance["event_revision_ids"] == [acquisition.id]

    disposal = await _confirmed_revision(
        test_db_session,
        test_user,
        account,
        event_type="trade",
        effective_at=datetime(2026, 5, 10, 12, tzinfo=UTC),
        components=(
            {
                "role": "asset_out",
                "asset_id": asset.id,
                "quantity": "-4",
                "fiat_value": "600",
                "currency": "EUR",
            },
        ),
        attributes={"jurisdiction": "SE", "source_id": "sale-row"},
    )
    await _attach_evidence(test_db_session, test_user, disposal)
    disposed = await project_confirmed_investments(
        test_db_session,
        user_id=test_user.id,
        revision_ids=(disposal.id,),
    )
    assert len(disposed.lot_disposal_ids) == 1
    allocation = await test_db_session.get(FinanceLotDisposal, disposed.lot_disposal_ids[0])
    assert allocation is not None
    assert allocation.allocated_quantity == Decimal("4")
    assert allocation.cost_basis == Decimal("400")
    assert allocation.proceeds == Decimal("600")
    assert allocation.gain_loss == Decimal("200")
    assert lot.remaining_quantity == Decimal("6")
    assert lot.cost_basis == Decimal("1000")

    repeated = await project_confirmed_investments(
        test_db_session,
        user_id=test_user.id,
        revision_ids=(acquisition.id, disposal.id),
    )
    assert repeated.created is False
    assert repeated.lot_ids == acquired.lot_ids
    assert repeated.lot_disposal_ids == disposed.lot_disposal_ids
    assert await test_db_session.scalar(select(func.count(FinanceLot.id))) == 1
    assert await test_db_session.scalar(select(func.count(FinanceLotDisposal.id))) == 1
    assert lot.remaining_quantity == Decimal("6")

    correction = await _confirmed_revision(
        test_db_session,
        test_user,
        account,
        event_type="trade",
        effective_at=datetime(2026, 6, 10, 12, tzinfo=UTC),
        components=(
            {
                "role": "asset_in",
                "asset_id": asset.id,
                "quantity": "12",
                "fiat_value": "1200",
                "currency": "EUR",
            },
        ),
        attributes={"jurisdiction": "SE"},
    )
    correction.supersedes_revision_id = acquisition.id
    await _attach_evidence(test_db_session, test_user, correction)
    correction_result = await project_confirmed_investments(
        test_db_session,
        user_id=test_user.id,
        revision_ids=(correction.id,),
    )
    restatement = await test_db_session.get(
        FinanceOpenQuestion, correction_result.open_question_ids[0]
    )
    assert restatement is not None
    assert restatement.question_type == "investment_restatement_required"
    assert await test_db_session.scalar(select(func.count(FinanceLot.id))) == 1


async def test_staking_and_lending_receipts_create_spanish_fifo_basis(
    test_db_session: AsyncSession, test_user: User
) -> None:
    account, asset = await _account_and_asset(
        test_db_session,
        test_user,
        asset_type="crypto",
        jurisdiction="ES",
    )
    revisions: list[FinanceEventRevision] = []
    for index, (event_type, role, quantity, value) in enumerate(
        (
            ("staking_reward", "reward", "0.5", "100"),
            ("interest", "income", "1", "20"),
        )
    ):
        revision = await _confirmed_revision(
            test_db_session,
            test_user,
            account,
            event_type=event_type,
            effective_at=datetime(2026, 4, 10 + index, 12, tzinfo=UTC),
            components=(
                {
                    "role": role,
                    "asset_id": asset.id,
                    "quantity": quantity,
                    "fiat_value": value,
                    "currency": "EUR",
                },
            ),
            attributes={"jurisdiction": "ES", "income_kind": event_type},
        )
        await _attach_evidence(test_db_session, test_user, revision)
        revisions.append(revision)

    result = await project_confirmed_investments(
        test_db_session,
        user_id=test_user.id,
        revision_ids=tuple(revision.id for revision in revisions),
    )
    lots = list(
        (
            await test_db_session.scalars(
                select(FinanceLot)
                .where(FinanceLot.id.in_(result.lot_ids))
                .order_by(FinanceLot.acquired_at, FinanceLot.id)
            )
        ).all()
    )
    assert len(lots) == 2
    assert {lot.method for lot in lots} == {"fifo"}
    assert {lot.acquisition_revision_id: lot.cost_basis for lot in lots} == {
        revisions[0].id: Decimal("100"),
        revisions[1].id: Decimal("20"),
    }
    assert result.open_question_ids == ()

    disposal = await _confirmed_revision(
        test_db_session,
        test_user,
        account,
        event_type="trade",
        effective_at=datetime(2026, 6, 10, 12, tzinfo=UTC),
        components=(
            {
                "role": "asset_out",
                "asset_id": asset.id,
                "quantity": "-1",
                "fiat_value": "165",
                "currency": "EUR",
            },
        ),
        attributes={"jurisdiction": "ES"},
    )
    await _attach_evidence(test_db_session, test_user, disposal)
    disposal_result = await project_confirmed_investments(
        test_db_session,
        user_id=test_user.id,
        revision_ids=(disposal.id,),
    )
    allocations = list(
        (
            await test_db_session.scalars(
                select(FinanceLotDisposal).where(
                    FinanceLotDisposal.id.in_(disposal_result.lot_disposal_ids)
                )
            )
        ).all()
    )
    assert len(allocations) == 2
    assert sum((row.cost_basis for row in allocations), Decimal(0)) == Decimal("110")
    assert sum((row.gain_loss for row in allocations), Decimal(0)) == Decimal("55")
    await test_db_session.refresh(lots[0])
    await test_db_session.refresh(lots[1])
    assert lots[0].remaining_quantity == Decimal("0")
    assert lots[1].remaining_quantity == Decimal("0.5")


async def test_projection_emits_idempotent_blocking_questions_for_missing_inputs(
    test_db_session: AsyncSession, test_user: User
) -> None:
    account, asset = await _account_and_asset(test_db_session, test_user, asset_type="crypto")
    incomplete_reward = await _confirmed_revision(
        test_db_session,
        test_user,
        account,
        event_type="staking_reward",
        components=(
            {
                "role": "reward",
                "asset_id": asset.id,
                "quantity": "0.1",
                "fiat_value": None,
                "currency": None,
            },
        ),
        attributes={"jurisdiction": "SE"},
    )
    transfer = await _confirmed_revision(
        test_db_session,
        test_user,
        account,
        event_type="transfer",
        components=(
            {
                "role": "transfer",
                "asset_id": asset.id,
                "quantity": "-0.1",
                "fiat_value": None,
                "currency": None,
            },
        ),
        attributes={"jurisdiction": "SE"},
    )
    missing_lot = await _confirmed_revision(
        test_db_session,
        test_user,
        account,
        event_type="trade",
        components=(
            {
                "role": "asset_out",
                "asset_id": asset.id,
                "quantity": "-1",
                "fiat_value": "100",
                "currency": "EUR",
            },
        ),
        attributes={"jurisdiction": "SE"},
    )
    await _attach_evidence(test_db_session, test_user, missing_lot)

    result = await project_confirmed_investments(
        test_db_session,
        user_id=test_user.id,
        revision_ids=(incomplete_reward.id, transfer.id, missing_lot.id),
    )
    questions = list(
        (
            await test_db_session.scalars(
                select(FinanceOpenQuestion).where(
                    FinanceOpenQuestion.id.in_(result.open_question_ids)
                )
            )
        ).all()
    )
    assert {question.question_type for question in questions} == {
        "investment_missing_evidence",
        "investment_missing_price",
        "investment_missing_destination",
        "investment_missing_lot",
    }
    assert all(question.severity == "blocking" for question in questions)
    assert result.lot_ids == ()
    assert result.lot_disposal_ids == ()

    repeated = await project_confirmed_investments(
        test_db_session,
        user_id=test_user.id,
        revision_ids=(incomplete_reward.id, transfer.id, missing_lot.id),
    )
    assert repeated.created is False
    assert set(repeated.open_question_ids) == set(result.open_question_ids)
    assert await test_db_session.scalar(select(func.count(FinanceOpenQuestion.id))) == 5


async def test_position_and_bot_snapshot_projection_preserves_lineage_and_is_idempotent(
    test_db_session: AsyncSession, test_user: User
) -> None:
    account, asset = await _account_and_asset(test_db_session, test_user, asset_type="derivative")
    revision = await _confirmed_revision(
        test_db_session,
        test_user,
        account,
        event_type="derivative_fill",
        components=(
            {
                "role": "asset_in",
                "asset_id": asset.id,
                "quantity": "2",
                "fiat_value": "200",
                "currency": "EUR",
            },
        ),
        attributes={
            "jurisdiction": "SE",
            "position_snapshot": {
                "provider_position_id": "provider-position-1",
                "contract_asset_id": asset.id,
                "contract_type": "perpetual",
                "direction": "long",
                "leverage": "2",
                "margin_mode": "isolated",
                "entry_price": "100",
                "size": "2",
                "collateral": "100",
                "realized_pnl": "0",
                "unrealized_pnl": "20",
                "funding_total": "-1",
                "fee_total": "2",
                "reporting_currency": "EUR",
                "position_status": "open",
            },
            "bot_equity": {
                "opening_equity": "1000",
                "deposits": "100",
                "withdrawals": "20",
                "transfers": "0",
                "trading_pnl": "30",
                "funding": "-1",
                "fees": "2",
                "observed_equity": "1107",
                "tolerance": "0.01",
                "reporting_currency": "EUR",
            },
        },
    )
    await _attach_evidence(test_db_session, test_user, revision)

    result = await project_confirmed_investments(
        test_db_session,
        user_id=test_user.id,
        revision_ids=(revision.id,),
    )
    assert result.created is True
    assert len(result.position_ids) == 1
    assert len(result.position_revision_ids) == 1
    assert len(result.bot_equity_snapshot_ids) == 1
    position = await test_db_session.get(FinancePosition, result.position_ids[0])
    position_revision = await test_db_session.get(
        FinancePositionRevision, result.position_revision_ids[0]
    )
    snapshot = await test_db_session.get(
        FinanceBotEquitySnapshot, result.bot_equity_snapshot_ids[0]
    )
    assert position_revision is not None
    assert position is not None and position.current_revision_id == position_revision.id
    assert position_revision.source_revision_ids == [revision.id]
    assert position_revision.leverage == Decimal("2")
    assert position_revision.funding_total == Decimal("-1")
    assert snapshot is not None
    assert snapshot.expected_equity == Decimal("1107")
    assert snapshot.difference == Decimal("0")
    assert snapshot.source_revision_ids == [revision.id]
    assert result.open_question_ids == ()

    repeated = await project_confirmed_investments(
        test_db_session,
        user_id=test_user.id,
        revision_ids=(revision.id,),
    )
    assert repeated.created is False
    assert repeated.position_revision_ids == result.position_revision_ids
    assert repeated.bot_equity_snapshot_ids == result.bot_equity_snapshot_ids
    assert await test_db_session.scalar(select(func.count(FinancePositionRevision.id))) == 1
    assert await test_db_session.scalar(select(func.count(FinanceBotEquitySnapshot.id))) == 1
