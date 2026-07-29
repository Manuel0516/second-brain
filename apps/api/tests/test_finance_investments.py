import json
from decimal import Decimal
from pathlib import Path
from typing import Any, cast

import pytest

from app.services.finance_investments import (
    AssetAcquisitionInput,
    AverageCostDisposalInput,
    AverageCostWithdrawalInput,
    BotEquityMovement,
    BotEquityReconciliationInput,
    CryptoSwapInput,
    CryptoTransferInput,
    FuturesCashFlow,
    FuturesFill,
    FuturesPositionInput,
    IncomeReceiptInput,
    InvestmentIncomeInput,
    LotState,
    SourceProvenance,
    calculate_average_cost_disposal,
    calculate_crypto_swap,
    calculate_crypto_transfer,
    calculate_futures_position,
    calculate_income_receipt,
    calculate_investment_income,
    consume_average_cost,
    reconcile_bot_equity,
    record_asset_acquisition,
    validate_investment_provenance,
)

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "finance" / "investment_scenarios.json"


@pytest.fixture(scope="module")
def scenarios() -> dict[str, Any]:
    return cast(dict[str, Any], json.loads(FIXTURE_PATH.read_text(encoding="utf-8")))


def decimal(value: object) -> Decimal:
    return Decimal(str(value))


def provenance(source_id: str) -> SourceProvenance:
    return SourceProvenance(
        source_ids=(source_id,),
        raw_record_ids=(f"raw-{source_id}",),
        event_revision_ids=(f"revision-{source_id}",),
        valuation_ids=(f"valuation-{source_id}",),
        evidence_document_ids=(f"evidence-{source_id}",),
    )


def lot_from_fixture(asset_id: str, value: dict[str, str]) -> LotState:
    source_id = value["source_id"]
    return LotState(
        lot_id=value["lot_id"],
        asset_id=asset_id,
        quantity=decimal(value["quantity"]),
        cost_basis=decimal(value["cost_basis"]),
        source_id=source_id,
        provenance=provenance(source_id),
    )


def test_average_cost_disposal_preserves_lot_trace_and_weighted_basis(
    scenarios: dict[str, Any],
) -> None:
    scenario = cast(dict[str, Any], scenarios["average_cost_disposal"])
    asset_id = cast(str, scenario["asset_id"])
    lots = tuple(
        lot_from_fixture(asset_id, value) for value in cast(list[dict[str, str]], scenario["lots"])
    )

    result = calculate_average_cost_disposal(
        lots,
        AverageCostDisposalInput(
            event_id="fund-sale",
            asset_id=asset_id,
            asset_kind="fund",
            quantity=decimal(scenario["quantity"]),
            gross_proceeds=decimal(scenario["gross_proceeds"]),
            fee=decimal(scenario["fee"]),
            report_currency="SEK",
            source_id="broker-sale-row",
            provenance=provenance("broker-sale-row"),
        ),
    )

    assert result.blockers == ()
    assert result.method == "average_cost"
    assert result.average_unit_cost == decimal(scenario["expected_average_unit_cost"])
    assert result.cost_basis == decimal(scenario["expected_cost_basis"])
    assert result.gain_loss == decimal(scenario["expected_gain_loss"])
    assert sum((item.quantity for item in result.allocations), Decimal("0")) == Decimal("16")
    assert sum((item.cost_basis for item in result.allocations), Decimal("0")) == Decimal("220")
    assert {item.lot_id for item in result.allocations} == {"fund-lot-1", "fund-lot-2"}
    assert set(result.provenance.source_ids) == {
        "broker-row-1",
        "broker-row-2",
        "broker-sale-row",
    }
    assert lots[0].quantity == Decimal("10")
    assert lots[1].cost_basis == Decimal("450")


def test_average_cost_withdrawal_blocks_when_no_lot_exists() -> None:
    result = consume_average_cost(
        (),
        AverageCostWithdrawalInput(
            asset_id="missing",
            quantity=Decimal("1"),
            source_id="sale-without-lot",
            provenance=provenance("sale-without-lot"),
        ),
    )

    assert [blocker.code for blocker in result.blockers] == ["missing_lot"]
    assert result.withdrawn_cost_basis is None
    assert result.provenance.source_ids == ("sale-without-lot",)


def test_average_cost_withdrawal_blocks_when_lot_quantity_is_insufficient() -> None:
    lot = LotState(
        lot_id="small-lot",
        asset_id="gold",
        quantity=Decimal("1"),
        cost_basis=Decimal("100"),
        source_id="gold-buy",
    )
    result = consume_average_cost(
        (lot,),
        AverageCostWithdrawalInput(
            asset_id="gold",
            quantity=Decimal("2"),
            source_id="gold-sale",
        ),
    )

    assert [blocker.code for blocker in result.blockers] == ["insufficient_lot"]
    assert result.remaining_lots == (lot,)


def test_disposal_surfaces_missing_price_without_consuming_source_lots() -> None:
    lot = LotState(
        lot_id="etf-lot",
        asset_id="etf",
        quantity=Decimal("5"),
        cost_basis=Decimal("500"),
        source_id="etf-buy",
    )
    result = calculate_average_cost_disposal(
        (lot,),
        AverageCostDisposalInput(
            event_id="etf-sale",
            asset_id="etf",
            asset_kind="etf",
            quantity=Decimal("1"),
            gross_proceeds=None,
            fee=Decimal("0"),
            report_currency="EUR",
            source_id="etf-sale-row",
        ),
    )

    assert [blocker.code for blocker in result.blockers] == ["missing_price"]
    assert result.gain_loss is None
    assert lot.quantity == Decimal("5")


@pytest.mark.parametrize("asset_kind", ["fund", "etf", "gold"])
def test_fund_etf_and_gold_acquisitions_include_fees_in_basis(asset_kind: str) -> None:
    result = record_asset_acquisition(
        AssetAcquisitionInput(
            event_id=f"{asset_kind}-purchase",
            lot_id=f"{asset_kind}-lot",
            asset_id=f"asset-{asset_kind}",
            asset_kind=cast(Any, asset_kind),
            quantity=Decimal("5"),
            purchase_cost=Decimal("500"),
            fee=Decimal("2"),
            report_currency="EUR",
            source_id=f"{asset_kind}-source",
            provenance=provenance(f"{asset_kind}-source"),
        )
    )

    assert result.blockers == ()
    assert result.total_cost_basis == Decimal("502")
    assert result.lot is not None
    assert result.lot.cost_basis == Decimal("502")
    assert result.provenance.source_ids == (f"{asset_kind}-source",)


def test_acquisition_without_value_returns_missing_price_blocker() -> None:
    result = record_asset_acquisition(
        AssetAcquisitionInput(
            event_id="gold-purchase",
            lot_id="gold-lot",
            asset_id="gold",
            asset_kind="gold",
            quantity=Decimal("1"),
            purchase_cost=None,
            fee=Decimal("0"),
            report_currency="EUR",
            source_id="gold-row",
        )
    )

    assert result.lot is None
    assert [blocker.code for blocker in result.blockers] == ["missing_price"]


def test_fund_distribution_keeps_withholding_and_fee_separate() -> None:
    result = calculate_investment_income(
        InvestmentIncomeInput(
            event_id="distribution",
            event_kind="fund_distribution",
            asset_id="fund",
            gross_amount=Decimal("100"),
            withholding=Decimal("15"),
            fee=Decimal("1"),
            report_currency="SEK",
            source_id="distribution-row",
            provenance=provenance("distribution-row"),
        )
    )

    assert result.net_amount == Decimal("84")
    assert result.withholding == Decimal("15")
    assert result.fee == Decimal("1")


def test_crypto_swap_creates_disposal_and_new_receipt_value_lot(
    scenarios: dict[str, Any],
) -> None:
    scenario = cast(dict[str, Any], scenarios["crypto_swap"])
    source = "swap-row"
    disposed_lot = LotState(
        lot_id="btc-lot",
        asset_id=cast(str, scenario["disposed_asset_id"]),
        quantity=decimal(scenario["disposed_lot_quantity"]),
        cost_basis=decimal(scenario["disposed_lot_basis"]),
        source_id="btc-buy-row",
        provenance=provenance("btc-buy-row"),
    )
    result = calculate_crypto_swap(
        (disposed_lot,),
        CryptoSwapInput(
            event_id="btc-eth-swap",
            disposed_asset_id=cast(str, scenario["disposed_asset_id"]),
            disposed_quantity=decimal(scenario["disposed_quantity"]),
            acquired_asset_id=cast(str, scenario["acquired_asset_id"]),
            acquired_quantity=decimal(scenario["acquired_quantity"]),
            acquired_lot_id="eth-swap-lot",
            fair_value=decimal(scenario["fair_value"]),
            disposal_fee=decimal(scenario["disposal_fee"]),
            acquisition_fee=decimal(scenario["acquisition_fee"]),
            report_currency="EUR",
            source_id=source,
            provenance=provenance(source),
        ),
    )

    assert result.blockers == ()
    assert result.disposal.cost_basis == decimal(scenario["expected_disposal_basis"])
    assert result.disposal.gain_loss == decimal(scenario["expected_gain"])
    assert result.acquired_lot is not None
    assert result.acquired_lot.cost_basis == decimal(scenario["expected_acquired_basis"])
    assert set(result.provenance.source_ids) == {"btc-buy-row", "swap-row"}


def test_crypto_swap_blocks_both_missing_lot_and_missing_price() -> None:
    result = calculate_crypto_swap(
        (),
        CryptoSwapInput(
            event_id="incomplete-swap",
            disposed_asset_id="btc",
            disposed_quantity=Decimal("1"),
            acquired_asset_id="eth",
            acquired_quantity=Decimal("10"),
            acquired_lot_id="eth-lot",
            fair_value=None,
            disposal_fee=Decimal("0"),
            acquisition_fee=Decimal("0"),
            report_currency="EUR",
            source_id="incomplete-swap-row",
        ),
    )

    assert {blocker.code for blocker in result.blockers} == {"missing_lot", "missing_price"}
    assert result.acquired_lot is None


def test_owned_crypto_transfer_carries_basis_without_gain(scenarios: dict[str, Any]) -> None:
    scenario = cast(dict[str, Any], scenarios["crypto_transfer"])
    lot = LotState(
        lot_id="eth-origin-lot",
        asset_id=cast(str, scenario["asset_id"]),
        quantity=decimal(scenario["lot_quantity"]),
        cost_basis=decimal(scenario["lot_basis"]),
        source_id="eth-buy-row",
        provenance=provenance("eth-buy-row"),
    )
    result = calculate_crypto_transfer(
        (lot,),
        CryptoTransferInput(
            event_id="wallet-transfer",
            asset_id=cast(str, scenario["asset_id"]),
            sent_quantity=decimal(scenario["sent_quantity"]),
            network_fee_quantity=decimal(scenario["network_fee_quantity"]),
            source_account_id="exchange",
            destination_account_id="owned-wallet",
            destination_lot_id="wallet-lot",
            source_id="transfer-row",
            provenance=provenance("transfer-row"),
        ),
    )

    assert result.blockers == ()
    assert result.creates_gain is False
    assert result.received_quantity == decimal(scenario["expected_received_quantity"])
    assert result.carried_cost_basis == decimal(scenario["expected_carried_basis"])
    assert result.fee_cost_basis == decimal(scenario["expected_fee_basis"])
    assert result.destination_lot is not None
    assert result.destination_lot.quantity == Decimal("0.49")
    assert set(result.provenance.source_ids) == {"eth-buy-row", "transfer-row"}


def test_crypto_transfer_requires_owned_destination() -> None:
    lot = LotState(
        lot_id="wallet-source-lot",
        asset_id="btc",
        quantity=Decimal("1"),
        cost_basis=Decimal("100"),
        source_id="wallet-row",
    )
    result = calculate_crypto_transfer(
        (lot,),
        CryptoTransferInput(
            event_id="unknown-destination",
            asset_id="btc",
            sent_quantity=Decimal("0.1"),
            network_fee_quantity=Decimal("0"),
            source_account_id="wallet-a",
            destination_account_id=None,
            destination_lot_id="destination-lot",
            source_id="transfer-source",
        ),
    )

    assert [blocker.code for blocker in result.blockers] == ["missing_destination"]
    assert result.destination_lot is None
    assert result.creates_gain is False


@pytest.mark.parametrize(
    ("receipt_kind", "quantity", "unit_price", "expected"),
    [
        ("staking_reward", "0.003", "2400", "7.200"),
        ("lending_interest", "0.02", "100", "2.00"),
    ],
)
def test_staking_and_lending_receipts_create_receipt_value_basis(
    receipt_kind: str, quantity: str, unit_price: str, expected: str
) -> None:
    result = calculate_income_receipt(
        IncomeReceiptInput(
            event_id=f"{receipt_kind}-event",
            receipt_kind=cast(Any, receipt_kind),
            lot_id=f"{receipt_kind}-lot",
            asset_id="reward-asset",
            quantity=Decimal(quantity),
            receipt_unit_price=Decimal(unit_price),
            report_currency="EUR",
            source_id=f"{receipt_kind}-row",
            provenance=provenance(f"{receipt_kind}-row"),
        )
    )

    assert result.blockers == ()
    assert result.income_value == Decimal(expected)
    assert result.lot is not None
    assert result.lot.cost_basis == Decimal(expected)
    assert result.provenance.source_ids == (f"{receipt_kind}-row",)


def test_staking_receipt_without_price_is_blocked() -> None:
    result = calculate_income_receipt(
        IncomeReceiptInput(
            event_id="staking-event",
            receipt_kind="staking_reward",
            lot_id="staking-lot",
            asset_id="eth",
            quantity=Decimal("0.01"),
            receipt_unit_price=None,
            report_currency="EUR",
            source_id="staking-row",
        )
    )

    assert result.lot is None
    assert [blocker.code for blocker in result.blockers] == ["missing_price"]


def test_futures_replay_separates_price_pnl_funding_fees_and_collateral(
    scenarios: dict[str, Any],
) -> None:
    scenario = cast(dict[str, Any], scenarios["futures_position"])
    fills = tuple(
        FuturesFill(
            fill_id=cast(str, item["fill_id"]),
            kind=cast(Any, item["kind"]),
            quantity=decimal(item["quantity"]),
            price=decimal(item["price"]),
            fee=decimal(item["fee"]),
            source_id=cast(str, item["source_id"]),
            provenance=provenance(cast(str, item["source_id"])),
        )
        for item in cast(list[dict[str, Any]], scenario["fills"])
    )
    cash_flows = tuple(
        FuturesCashFlow(
            cash_flow_id=cast(str, item["cash_flow_id"]),
            kind=cast(Any, item["kind"]),
            amount=decimal(item["amount"]),
            source_id=cast(str, item["source_id"]),
            provenance=provenance(cast(str, item["source_id"])),
        )
        for item in cast(list[dict[str, Any]], scenario["cash_flows"])
    )
    result = calculate_futures_position(
        FuturesPositionInput(
            position_id="btc-perp-position",
            contract_asset_id="btc-usdt-perp",
            side=cast(Any, scenario["side"]),
            initial_collateral=decimal(scenario["initial_collateral"]),
            fills=fills,
            cash_flows=cash_flows,
            mark_price=decimal(scenario["mark_price"]),
            report_currency="EUR",
            source_id="position-snapshot",
            provenance=provenance("position-snapshot"),
        )
    )

    assert result.status == "open"
    assert result.open_quantity == Decimal("2")
    assert result.average_entry_price == decimal(scenario["expected_average_entry"])
    assert result.realized_price_pnl == decimal(scenario["expected_realized_pnl"])
    assert result.unrealized_price_pnl == decimal(scenario["expected_unrealized_pnl"])
    assert result.funding == decimal(scenario["expected_funding"])
    assert result.fees == decimal(scenario["expected_fees"])
    assert result.net_realized_pnl == decimal(scenario["expected_net_realized_pnl"])
    assert result.collateral == decimal(scenario["expected_collateral"])
    assert result.report_currency == "EUR"
    assert result.contract_type == "perpetual"
    assert result.leverage == Decimal("1")
    assert result.liquidation_price is None
    assert result.liquidation_fees == Decimal("0")
    assert result.blockers == ()
    assert set(result.provenance.source_ids) == {
        "position-snapshot",
        "fills-row-1",
        "fills-row-2",
        "fills-row-3",
        "funding-row-1",
        "funding-row-2",
        "fee-row-1",
        "transfer-row-1",
    }


def test_open_futures_position_without_mark_price_is_blocked() -> None:
    result = calculate_futures_position(
        FuturesPositionInput(
            position_id="open-position",
            contract_asset_id="eth-perp",
            side="long",
            initial_collateral=Decimal("100"),
            fills=(
                FuturesFill(
                    fill_id="open-fill",
                    kind="open",
                    quantity=Decimal("1"),
                    price=Decimal("2000"),
                    fee=Decimal("1"),
                    source_id="open-fill-row",
                ),
            ),
            cash_flows=(),
            mark_price=None,
            report_currency="EUR",
            source_id="open-position-row",
        )
    )

    assert result.realized_price_pnl == Decimal("0")
    assert result.unrealized_price_pnl is None
    assert [blocker.code for blocker in result.blockers] == ["missing_price"]


def test_futures_liquidation_is_closed_and_keeps_liquidation_fees_separate() -> None:
    result = calculate_futures_position(
        FuturesPositionInput(
            position_id="short-liquidation",
            contract_asset_id="btc-perp",
            side="short",
            initial_collateral=Decimal("200"),
            fills=(
                FuturesFill(
                    fill_id="open",
                    kind="open",
                    quantity=Decimal("3"),
                    price=Decimal("200"),
                    fee=Decimal("1"),
                    source_id="open-row",
                ),
                FuturesFill(
                    fill_id="liquidation",
                    kind="liquidation",
                    quantity=Decimal("3"),
                    price=Decimal("250"),
                    fee=Decimal("3"),
                    source_id="liquidation-row",
                ),
            ),
            cash_flows=(
                FuturesCashFlow(
                    cash_flow_id="funding",
                    kind="funding",
                    amount=Decimal("-2"),
                    source_id="funding-row",
                ),
                FuturesCashFlow(
                    cash_flow_id="liquidation-fee",
                    kind="liquidation_fee",
                    amount=Decimal("5"),
                    source_id="liquidation-fee-row",
                ),
            ),
            mark_price=None,
            report_currency="EUR",
            source_id="position-row",
        )
    )

    assert result.status == "liquidated"
    assert result.open_quantity == Decimal("0")
    assert result.realized_price_pnl == Decimal("-150")
    assert result.funding == Decimal("-2")
    assert result.fees == Decimal("9")
    assert result.liquidation_fees == Decimal("5")
    assert result.liquidation_price == Decimal("250")
    assert result.liquidation_price_pnl == Decimal("-150")
    assert result.net_realized_pnl == Decimal("-161")
    assert result.blockers == ()


def test_bot_equity_reconciliation_reproduces_golden_statement(
    scenarios: dict[str, Any],
) -> None:
    scenario = cast(dict[str, Any], scenarios["bot_equity"])
    movements = tuple(
        BotEquityMovement(
            movement_id=cast(str, item["movement_id"]),
            kind=cast(Any, item["kind"]),
            amount=decimal(item["amount"]),
            source_id=cast(str, item["source_id"]),
            provenance=provenance(cast(str, item["source_id"])),
        )
        for item in cast(list[dict[str, Any]], scenario["movements"])
    )
    result = reconcile_bot_equity(
        BotEquityReconciliationInput(
            reconciliation_id="bot-daily-equity",
            opening_equity=decimal(scenario["opening_equity"]),
            closing_equity=decimal(scenario["closing_equity"]),
            tolerance=decimal(scenario["tolerance"]),
            movements=movements,
            source_id="bot-equity-statement",
            provenance=provenance("bot-equity-statement"),
        )
    )

    assert result.expected_closing_equity == decimal(scenario["expected_closing_equity"])
    assert result.difference == decimal(scenario["expected_difference"])
    assert result.status == "reconciled"
    assert result.transfers == Decimal("0")
    assert result.trading_pnl == Decimal("2")
    assert result.blockers == ()
    assert len(result.provenance.source_ids) == 9


def test_bot_equity_difference_outside_tolerance_is_blocking() -> None:
    result = reconcile_bot_equity(
        BotEquityReconciliationInput(
            reconciliation_id="bot-mismatch",
            opening_equity=Decimal("100"),
            closing_equity=Decimal("90"),
            tolerance=Decimal("0.01"),
            movements=(),
            source_id="bot-statement",
        )
    )

    assert result.status == "blocked"
    assert result.difference == Decimal("-10")
    assert [blocker.code for blocker in result.blockers] == ["equity_mismatch"]


def test_binary_float_is_rejected_at_runtime() -> None:
    with pytest.raises(TypeError, match="quantity must be Decimal"):
        consume_average_cost(
            (),
            AverageCostWithdrawalInput(
                asset_id="btc",
                quantity=cast(Decimal, 0.1),
                source_id="float-row",
            ),
        )


def test_duplicate_lot_ids_are_rejected_before_average_cost_allocation() -> None:
    lots = tuple(
        LotState(
            lot_id="duplicate-lot",
            asset_id="gold",
            quantity=Decimal("1"),
            cost_basis=Decimal("100"),
            source_id=f"gold-row-{index}",
        )
        for index in range(2)
    )

    with pytest.raises(ValueError, match="duplicate lot_id"):
        consume_average_cost(
            lots,
            AverageCostWithdrawalInput(
                asset_id="gold",
                quantity=Decimal("1"),
                source_id="gold-sale-row",
            ),
        )


def test_runtime_discriminants_and_currency_are_validated() -> None:
    with pytest.raises(ValueError, match="unsupported asset_kind"):
        record_asset_acquisition(
            AssetAcquisitionInput(
                event_id="bad-acquisition",
                lot_id="bad-lot",
                asset_id="asset",
                asset_kind=cast(Any, "stock"),
                quantity=Decimal("1"),
                purchase_cost=Decimal("10"),
                fee=Decimal("0"),
                report_currency="EUR",
                source_id="bad-row",
            )
        )

    with pytest.raises(ValueError, match="three-letter uppercase"):
        calculate_income_receipt(
            IncomeReceiptInput(
                event_id="reward",
                receipt_kind="staking_reward",
                lot_id="reward-lot",
                asset_id="eth",
                quantity=Decimal("1"),
                receipt_unit_price=Decimal("1"),
                report_currency="eur",
                source_id="reward-row",
            )
        )


def test_futures_terminal_fill_and_negative_collateral_are_rejected() -> None:
    terminal_fills = (
        FuturesFill(
            fill_id="open",
            kind="open",
            quantity=Decimal("1"),
            price=Decimal("100"),
            fee=Decimal("0"),
            source_id="open-row",
        ),
        FuturesFill(
            fill_id="close",
            kind="close",
            quantity=Decimal("1"),
            price=Decimal("110"),
            fee=Decimal("0"),
            source_id="close-row",
        ),
        FuturesFill(
            fill_id="reopen",
            kind="open",
            quantity=Decimal("1"),
            price=Decimal("105"),
            fee=Decimal("0"),
            source_id="reopen-row",
        ),
    )
    with pytest.raises(ValueError, match="terminal futures position"):
        calculate_futures_position(
            FuturesPositionInput(
                position_id="position",
                contract_asset_id="btc-perp",
                side="long",
                initial_collateral=Decimal("100"),
                fills=terminal_fills,
                cash_flows=(),
                mark_price=None,
                report_currency="EUR",
                source_id="position-row",
            )
        )

    with pytest.raises(ValueError, match="negative collateral"):
        calculate_futures_position(
            FuturesPositionInput(
                position_id="position",
                contract_asset_id="btc-perp",
                side="long",
                initial_collateral=Decimal("10"),
                fills=(terminal_fills[0],),
                cash_flows=(
                    FuturesCashFlow(
                        cash_flow_id="withdrawal",
                        kind="collateral",
                        amount=Decimal("-11"),
                        source_id="withdrawal-row",
                    ),
                ),
                mark_price=Decimal("100"),
                report_currency="EUR",
                source_id="position-row",
            )
        )


def test_futures_rejects_unknown_side_and_duplicate_fill_ids() -> None:
    fill = FuturesFill(
        fill_id="fill",
        kind="open",
        quantity=Decimal("1"),
        price=Decimal("100"),
        fee=Decimal("0"),
        source_id="fill-row",
    )
    request = FuturesPositionInput(
        position_id="position",
        contract_asset_id="btc-perp",
        side=cast(Any, "flat"),
        initial_collateral=Decimal("10"),
        fills=(fill,),
        cash_flows=(),
        mark_price=Decimal("100"),
        report_currency="EUR",
        source_id="position-row",
    )
    with pytest.raises(ValueError, match="unsupported side"):
        calculate_futures_position(request)

    with pytest.raises(ValueError, match="duplicate fill_id"):
        calculate_futures_position(
            FuturesPositionInput(
                position_id="position",
                contract_asset_id="btc-perp",
                side="long",
                initial_collateral=Decimal("10"),
                fills=(fill, fill),
                cash_flows=(),
                mark_price=Decimal("100"),
                report_currency="EUR",
                source_id="position-row",
            )
        )


def test_bot_equity_preserves_signed_transfers_and_model_compatible_trading_pnl() -> None:
    result = reconcile_bot_equity(
        BotEquityReconciliationInput(
            reconciliation_id="bot-transfer",
            opening_equity=Decimal("100"),
            closing_equity=Decimal("118"),
            tolerance=Decimal("0"),
            movements=(
                BotEquityMovement("transfer", "transfer", Decimal("10"), "transfer-row"),
                BotEquityMovement("realized", "realized_pnl", Decimal("12"), "pnl-row"),
                BotEquityMovement("liquidation", "liquidation_loss", Decimal("4"), "liq-row"),
            ),
            source_id="statement-row",
        )
    )

    assert result.transfers == Decimal("10")
    assert result.trading_pnl == Decimal("8")
    assert result.expected_closing_equity == Decimal("118")
    assert result.status == "reconciled"


def test_bot_equity_rejects_duplicate_movement_ids() -> None:
    movement = BotEquityMovement("movement", "deposit", Decimal("1"), "movement-row")
    with pytest.raises(ValueError, match="duplicate movement_id"):
        reconcile_bot_equity(
            BotEquityReconciliationInput(
                reconciliation_id="bot-duplicate",
                opening_equity=Decimal("0"),
                closing_equity=Decimal("2"),
                tolerance=Decimal("0"),
                movements=(movement, movement),
                source_id="statement-row",
            )
        )


def test_missing_evidence_is_an_explicit_investment_blocker() -> None:
    blockers = validate_investment_provenance(
        SourceProvenance(event_revision_ids=("revision",)),
        source_id="statement-row",
        asset_id="btc",
    )
    assert [blocker.code for blocker in blockers] == ["missing_evidence"]
    assert (
        validate_investment_provenance(
            SourceProvenance(evidence_document_ids=("evidence",)), source_id="statement-row"
        )
        == ()
    )
