"""Pure, Decimal-safe Finance investment calculations.

The functions in this module do not read or write database state.  Callers persist the returned
lineage alongside the event revision, lot, position, or reconciliation that they create.
"""

from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

AssetKind = Literal["fund", "etf", "gold", "crypto"]
BlockerCode = Literal[
    "missing_lot",
    "insufficient_lot",
    "missing_price",
    "missing_destination",
    "missing_evidence",
    "equity_mismatch",
]
FuturesSide = Literal["long", "short"]
FuturesFillKind = Literal["open", "increase", "decrease", "close", "liquidation"]
FuturesCashFlowKind = Literal["funding", "fee", "liquidation_fee", "collateral"]
FuturesContractType = Literal["perpetual", "dated", "cfd", "option", "other"]
FuturesMarginMode = Literal["cross", "isolated", "portfolio", "unknown"]

ZERO = Decimal("0")


@dataclass(frozen=True, slots=True)
class SourceProvenance:
    """Immutable source lineage carried through every calculation result."""

    source_ids: tuple[str, ...] = ()
    raw_record_ids: tuple[str, ...] = ()
    event_revision_ids: tuple[str, ...] = ()
    valuation_ids: tuple[str, ...] = ()
    evidence_document_ids: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class InvestmentBlocker:
    code: BlockerCode
    message: str
    source_id: str
    asset_id: str | None = None


@dataclass(frozen=True, slots=True)
class LotState:
    lot_id: str
    asset_id: str
    quantity: Decimal
    cost_basis: Decimal
    source_id: str
    provenance: SourceProvenance = SourceProvenance()


@dataclass(frozen=True, slots=True)
class LotAllocation:
    lot_id: str
    quantity: Decimal
    cost_basis: Decimal
    provenance: SourceProvenance


@dataclass(frozen=True, slots=True)
class AverageCostWithdrawalInput:
    asset_id: str
    quantity: Decimal
    source_id: str
    provenance: SourceProvenance = SourceProvenance()


@dataclass(frozen=True, slots=True)
class AverageCostWithdrawalResult:
    asset_id: str
    quantity: Decimal
    pool_quantity_before: Decimal
    pool_cost_before: Decimal
    average_unit_cost: Decimal | None
    withdrawn_cost_basis: Decimal | None
    allocations: tuple[LotAllocation, ...]
    remaining_lots: tuple[LotState, ...]
    blockers: tuple[InvestmentBlocker, ...]
    provenance: SourceProvenance


@dataclass(frozen=True, slots=True)
class AssetAcquisitionInput:
    event_id: str
    lot_id: str
    asset_id: str
    asset_kind: AssetKind
    quantity: Decimal
    purchase_cost: Decimal | None
    fee: Decimal
    report_currency: str
    source_id: str
    provenance: SourceProvenance = SourceProvenance()


@dataclass(frozen=True, slots=True)
class AssetAcquisitionResult:
    event_id: str
    asset_id: str
    asset_kind: AssetKind
    quantity: Decimal
    total_cost_basis: Decimal | None
    cash_outflow: Decimal | None
    report_currency: str
    lot: LotState | None
    blockers: tuple[InvestmentBlocker, ...]
    provenance: SourceProvenance


@dataclass(frozen=True, slots=True)
class AverageCostDisposalInput:
    event_id: str
    asset_id: str
    asset_kind: AssetKind
    quantity: Decimal
    gross_proceeds: Decimal | None
    fee: Decimal
    report_currency: str
    source_id: str
    provenance: SourceProvenance = SourceProvenance()


@dataclass(frozen=True, slots=True)
class AverageCostDisposalResult:
    event_id: str
    asset_id: str
    asset_kind: AssetKind
    quantity: Decimal
    method: Literal["average_cost"]
    gross_proceeds: Decimal | None
    fee: Decimal
    net_proceeds: Decimal | None
    average_unit_cost: Decimal | None
    cost_basis: Decimal | None
    gain_loss: Decimal | None
    allocations: tuple[LotAllocation, ...]
    remaining_lots: tuple[LotState, ...]
    blockers: tuple[InvestmentBlocker, ...]
    provenance: SourceProvenance


@dataclass(frozen=True, slots=True)
class InvestmentIncomeInput:
    event_id: str
    event_kind: Literal["dividend", "fund_distribution", "cash_interest"]
    asset_id: str
    gross_amount: Decimal | None
    withholding: Decimal
    fee: Decimal
    report_currency: str
    source_id: str
    provenance: SourceProvenance = SourceProvenance()


@dataclass(frozen=True, slots=True)
class InvestmentIncomeResult:
    event_id: str
    event_kind: Literal["dividend", "fund_distribution", "cash_interest"]
    asset_id: str
    gross_amount: Decimal | None
    withholding: Decimal
    fee: Decimal
    net_amount: Decimal | None
    report_currency: str
    blockers: tuple[InvestmentBlocker, ...]
    provenance: SourceProvenance


@dataclass(frozen=True, slots=True)
class CryptoSwapInput:
    event_id: str
    disposed_asset_id: str
    disposed_quantity: Decimal
    acquired_asset_id: str
    acquired_quantity: Decimal
    acquired_lot_id: str
    fair_value: Decimal | None
    disposal_fee: Decimal
    acquisition_fee: Decimal
    report_currency: str
    source_id: str
    provenance: SourceProvenance = SourceProvenance()


@dataclass(frozen=True, slots=True)
class CryptoSwapResult:
    event_id: str
    disposal: AverageCostDisposalResult
    acquired_lot: LotState | None
    acquired_cost_basis: Decimal | None
    blockers: tuple[InvestmentBlocker, ...]
    provenance: SourceProvenance


@dataclass(frozen=True, slots=True)
class CryptoTransferInput:
    event_id: str
    asset_id: str
    sent_quantity: Decimal
    network_fee_quantity: Decimal
    source_account_id: str
    destination_account_id: str | None
    destination_lot_id: str
    source_id: str
    provenance: SourceProvenance = SourceProvenance()


@dataclass(frozen=True, slots=True)
class CryptoTransferResult:
    event_id: str
    asset_id: str
    source_account_id: str
    destination_account_id: str | None
    sent_quantity: Decimal
    received_quantity: Decimal
    network_fee_quantity: Decimal
    carried_cost_basis: Decimal | None
    fee_cost_basis: Decimal | None
    destination_lot: LotState | None
    source_allocations: tuple[LotAllocation, ...]
    remaining_source_lots: tuple[LotState, ...]
    creates_gain: Literal[False]
    blockers: tuple[InvestmentBlocker, ...]
    provenance: SourceProvenance


@dataclass(frozen=True, slots=True)
class IncomeReceiptInput:
    event_id: str
    receipt_kind: Literal["staking_reward", "lending_interest"]
    lot_id: str
    asset_id: str
    quantity: Decimal
    receipt_unit_price: Decimal | None
    report_currency: str
    source_id: str
    provenance: SourceProvenance = SourceProvenance()


@dataclass(frozen=True, slots=True)
class IncomeReceiptResult:
    event_id: str
    receipt_kind: Literal["staking_reward", "lending_interest"]
    asset_id: str
    quantity: Decimal
    receipt_unit_price: Decimal | None
    income_value: Decimal | None
    report_currency: str
    lot: LotState | None
    blockers: tuple[InvestmentBlocker, ...]
    provenance: SourceProvenance


@dataclass(frozen=True, slots=True)
class FuturesFill:
    fill_id: str
    kind: FuturesFillKind
    quantity: Decimal
    price: Decimal | None
    fee: Decimal
    source_id: str
    provenance: SourceProvenance = SourceProvenance()


@dataclass(frozen=True, slots=True)
class FuturesCashFlow:
    cash_flow_id: str
    kind: FuturesCashFlowKind
    amount: Decimal
    source_id: str
    provenance: SourceProvenance = SourceProvenance()


@dataclass(frozen=True, slots=True)
class FuturesPositionInput:
    position_id: str
    contract_asset_id: str
    side: FuturesSide
    initial_collateral: Decimal
    fills: tuple[FuturesFill, ...]
    cash_flows: tuple[FuturesCashFlow, ...]
    mark_price: Decimal | None
    report_currency: str
    source_id: str
    provenance: SourceProvenance = SourceProvenance()
    contract_type: FuturesContractType = "perpetual"
    leverage: Decimal = Decimal("1")
    margin_mode: FuturesMarginMode = "unknown"


@dataclass(frozen=True, slots=True)
class FuturesPositionResult:
    position_id: str
    contract_asset_id: str
    side: FuturesSide
    contract_type: FuturesContractType
    leverage: Decimal
    margin_mode: FuturesMarginMode
    report_currency: str
    status: Literal["open", "closed", "liquidated"]
    open_quantity: Decimal
    average_entry_price: Decimal | None
    average_exit_price: Decimal | None
    realized_price_pnl: Decimal | None
    unrealized_price_pnl: Decimal | None
    liquidation_price: Decimal | None
    liquidation_price_pnl: Decimal | None
    funding: Decimal
    fees: Decimal
    liquidation_fees: Decimal
    collateral: Decimal
    net_realized_pnl: Decimal | None
    blockers: tuple[InvestmentBlocker, ...]
    provenance: SourceProvenance


@dataclass(frozen=True, slots=True)
class BotEquityMovement:
    movement_id: str
    kind: Literal[
        "deposit",
        "withdrawal",
        "transfer",
        "realized_pnl",
        "unrealized_pnl_change",
        "funding",
        "fee",
        "liquidation_loss",
        "adjustment",
    ]
    amount: Decimal
    source_id: str
    provenance: SourceProvenance = SourceProvenance()


@dataclass(frozen=True, slots=True)
class BotEquityReconciliationInput:
    reconciliation_id: str
    opening_equity: Decimal
    closing_equity: Decimal
    tolerance: Decimal
    movements: tuple[BotEquityMovement, ...]
    source_id: str
    provenance: SourceProvenance = SourceProvenance()


@dataclass(frozen=True, slots=True)
class BotEquityReconciliationResult:
    reconciliation_id: str
    opening_equity: Decimal
    deposits: Decimal
    withdrawals: Decimal
    transfers: Decimal
    realized_pnl: Decimal
    unrealized_pnl_change: Decimal
    funding: Decimal
    fees: Decimal
    liquidation_losses: Decimal
    adjustments: Decimal
    trading_pnl: Decimal
    expected_closing_equity: Decimal
    observed_closing_equity: Decimal
    difference: Decimal
    tolerance: Decimal
    status: Literal["reconciled", "blocked"]
    blockers: tuple[InvestmentBlocker, ...]
    provenance: SourceProvenance


def _require_decimal(name: str, value: Decimal) -> None:
    if not isinstance(value, Decimal):
        raise TypeError(f"{name} must be Decimal")
    if not value.is_finite():
        raise ValueError(f"{name} must be finite")


def _non_negative(name: str, value: Decimal) -> None:
    _require_decimal(name, value)
    if value < ZERO:
        raise ValueError(f"{name} must be non-negative")


def _positive(name: str, value: Decimal) -> None:
    _require_decimal(name, value)
    if value <= ZERO:
        raise ValueError(f"{name} must be positive")


def _identifier(name: str, value: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} must not be empty")


def _choice(name: str, value: str, allowed: frozenset[str]) -> None:
    if value not in allowed:
        raise ValueError(f"unsupported {name}: {value}")


def _currency(value: str) -> None:
    if len(value) != 3 or not value.isascii() or not value.isalpha() or value != value.upper():
        raise ValueError("report_currency must be a three-letter uppercase code")


def _unique_ids(name: str, values: tuple[str, ...]) -> None:
    if len(values) != len(set(values)):
        raise ValueError(f"duplicate {name} values are not allowed")


def _dedupe(values: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(values))


def merge_provenance(*items: SourceProvenance) -> SourceProvenance:
    """Merge lineage without losing stable source order."""
    return SourceProvenance(
        source_ids=_dedupe(tuple(value for item in items for value in item.source_ids)),
        raw_record_ids=_dedupe(tuple(value for item in items for value in item.raw_record_ids)),
        event_revision_ids=_dedupe(
            tuple(value for item in items for value in item.event_revision_ids)
        ),
        valuation_ids=_dedupe(tuple(value for item in items for value in item.valuation_ids)),
        evidence_document_ids=_dedupe(
            tuple(value for item in items for value in item.evidence_document_ids)
        ),
    )


def _with_source(source_id: str, provenance: SourceProvenance) -> SourceProvenance:
    _identifier("source_id", source_id)
    return merge_provenance(SourceProvenance(source_ids=(source_id,)), provenance)


def validate_investment_provenance(
    provenance: SourceProvenance,
    *,
    source_id: str,
    asset_id: str | None = None,
) -> tuple[InvestmentBlocker, ...]:
    """Return a visible blocker when a calculation has no immutable evidence lineage."""
    _identifier("source_id", source_id)
    if provenance.evidence_document_ids:
        return ()
    return (
        InvestmentBlocker(
            code="missing_evidence",
            message="No immutable evidence document is linked to this investment calculation",
            source_id=source_id,
            asset_id=asset_id,
        ),
    )


def consume_average_cost(
    lots: tuple[LotState, ...], request: AverageCostWithdrawalInput
) -> AverageCostWithdrawalResult:
    """Consume a proportional, traceable share of an average-cost pool."""
    _identifier("asset_id", request.asset_id)
    _positive("quantity", request.quantity)
    request_provenance = _with_source(request.source_id, request.provenance)
    _unique_ids("lot_id", tuple(lot.lot_id for lot in lots))
    for lot in lots:
        _identifier("lot_id", lot.lot_id)
        _identifier("lot.asset_id", lot.asset_id)
        if lot.asset_id != request.asset_id:
            raise ValueError("all lots must match the requested asset")
        _positive("lot.quantity", lot.quantity)
        _non_negative("lot.cost_basis", lot.cost_basis)

    lot_provenance = tuple(_with_source(lot.source_id, lot.provenance) for lot in lots)
    provenance = merge_provenance(request_provenance, *lot_provenance)
    pool_quantity = sum((lot.quantity for lot in lots), ZERO)
    pool_cost = sum((lot.cost_basis for lot in lots), ZERO)
    if not lots:
        blocker = InvestmentBlocker(
            code="missing_lot",
            message=f"No acquisition lots are available for asset {request.asset_id}",
            source_id=request.source_id,
            asset_id=request.asset_id,
        )
        return AverageCostWithdrawalResult(
            asset_id=request.asset_id,
            quantity=request.quantity,
            pool_quantity_before=ZERO,
            pool_cost_before=ZERO,
            average_unit_cost=None,
            withdrawn_cost_basis=None,
            allocations=(),
            remaining_lots=(),
            blockers=(blocker,),
            provenance=provenance,
        )
    average_unit_cost = pool_cost / pool_quantity
    if request.quantity > pool_quantity:
        blocker = InvestmentBlocker(
            code="insufficient_lot",
            message=(
                f"Requested {request.quantity} of {request.asset_id}, but only "
                f"{pool_quantity} is available"
            ),
            source_id=request.source_id,
            asset_id=request.asset_id,
        )
        return AverageCostWithdrawalResult(
            asset_id=request.asset_id,
            quantity=request.quantity,
            pool_quantity_before=pool_quantity,
            pool_cost_before=pool_cost,
            average_unit_cost=average_unit_cost,
            withdrawn_cost_basis=None,
            allocations=(),
            remaining_lots=lots,
            blockers=(blocker,),
            provenance=provenance,
        )

    ratio = request.quantity / pool_quantity
    target_cost = pool_cost * ratio
    allocations: list[LotAllocation] = []
    remaining: list[LotState] = []
    allocated_quantity = ZERO
    allocated_cost = ZERO
    for index, lot in enumerate(lots):
        if index == len(lots) - 1:
            quantity = request.quantity - allocated_quantity
            cost_basis = target_cost - allocated_cost
        else:
            quantity = lot.quantity * ratio
            cost_basis = lot.cost_basis * ratio
        allocation_provenance = merge_provenance(
            request_provenance, _with_source(lot.source_id, lot.provenance)
        )
        allocations.append(
            LotAllocation(
                lot_id=lot.lot_id,
                quantity=quantity,
                cost_basis=cost_basis,
                provenance=allocation_provenance,
            )
        )
        remaining_quantity = lot.quantity - quantity
        remaining_cost = lot.cost_basis - cost_basis
        if remaining_quantity > ZERO:
            remaining.append(
                LotState(
                    lot_id=lot.lot_id,
                    asset_id=lot.asset_id,
                    quantity=remaining_quantity,
                    cost_basis=remaining_cost,
                    source_id=lot.source_id,
                    provenance=lot.provenance,
                )
            )
        allocated_quantity += quantity
        allocated_cost += cost_basis

    return AverageCostWithdrawalResult(
        asset_id=request.asset_id,
        quantity=request.quantity,
        pool_quantity_before=pool_quantity,
        pool_cost_before=pool_cost,
        average_unit_cost=average_unit_cost,
        withdrawn_cost_basis=target_cost,
        allocations=tuple(allocations),
        remaining_lots=tuple(remaining),
        blockers=(),
        provenance=provenance,
    )


def record_asset_acquisition(request: AssetAcquisitionInput) -> AssetAcquisitionResult:
    """Create basis for a fund, ETF, gold, or crypto acquisition."""
    _identifier("event_id", request.event_id)
    _identifier("lot_id", request.lot_id)
    _identifier("asset_id", request.asset_id)
    _choice("asset_kind", request.asset_kind, frozenset({"fund", "etf", "gold", "crypto"}))
    _currency(request.report_currency)
    _positive("quantity", request.quantity)
    _non_negative("fee", request.fee)
    provenance = _with_source(request.source_id, request.provenance)
    if request.purchase_cost is None:
        blocker = InvestmentBlocker(
            code="missing_price",
            message=f"Acquisition value is missing for asset {request.asset_id}",
            source_id=request.source_id,
            asset_id=request.asset_id,
        )
        return AssetAcquisitionResult(
            event_id=request.event_id,
            asset_id=request.asset_id,
            asset_kind=request.asset_kind,
            quantity=request.quantity,
            total_cost_basis=None,
            cash_outflow=None,
            report_currency=request.report_currency,
            lot=None,
            blockers=(blocker,),
            provenance=provenance,
        )
    _non_negative("purchase_cost", request.purchase_cost)
    total_cost = request.purchase_cost + request.fee
    lot = LotState(
        lot_id=request.lot_id,
        asset_id=request.asset_id,
        quantity=request.quantity,
        cost_basis=total_cost,
        source_id=request.source_id,
        provenance=request.provenance,
    )
    return AssetAcquisitionResult(
        event_id=request.event_id,
        asset_id=request.asset_id,
        asset_kind=request.asset_kind,
        quantity=request.quantity,
        total_cost_basis=total_cost,
        cash_outflow=total_cost,
        report_currency=request.report_currency,
        lot=lot,
        blockers=(),
        provenance=provenance,
    )


def calculate_average_cost_disposal(
    lots: tuple[LotState, ...], request: AverageCostDisposalInput
) -> AverageCostDisposalResult:
    """Calculate a disposal without mutating the source lots."""
    _identifier("event_id", request.event_id)
    _identifier("asset_id", request.asset_id)
    _choice("asset_kind", request.asset_kind, frozenset({"fund", "etf", "gold", "crypto"}))
    _currency(request.report_currency)
    _positive("quantity", request.quantity)
    _non_negative("fee", request.fee)
    withdrawal = consume_average_cost(
        lots,
        AverageCostWithdrawalInput(
            asset_id=request.asset_id,
            quantity=request.quantity,
            source_id=request.source_id,
            provenance=request.provenance,
        ),
    )
    price_blockers: tuple[InvestmentBlocker, ...] = ()
    if request.gross_proceeds is None:
        price_blockers = (
            InvestmentBlocker(
                code="missing_price",
                message=f"Disposal value is missing for asset {request.asset_id}",
                source_id=request.source_id,
                asset_id=request.asset_id,
            ),
        )
    else:
        _non_negative("gross_proceeds", request.gross_proceeds)
    blockers = _merge_blocker_objects(withdrawal.blockers, price_blockers)
    net_proceeds = None if request.gross_proceeds is None else request.gross_proceeds - request.fee
    cost_basis = withdrawal.withdrawn_cost_basis
    gain_loss = None if net_proceeds is None or cost_basis is None else net_proceeds - cost_basis
    return AverageCostDisposalResult(
        event_id=request.event_id,
        asset_id=request.asset_id,
        asset_kind=request.asset_kind,
        quantity=request.quantity,
        method="average_cost",
        gross_proceeds=request.gross_proceeds,
        fee=request.fee,
        net_proceeds=net_proceeds,
        average_unit_cost=withdrawal.average_unit_cost,
        cost_basis=cost_basis,
        gain_loss=gain_loss,
        allocations=withdrawal.allocations,
        remaining_lots=withdrawal.remaining_lots,
        blockers=blockers,
        provenance=withdrawal.provenance,
    )


def calculate_investment_income(request: InvestmentIncomeInput) -> InvestmentIncomeResult:
    """Keep gross cash income, withholding, and fees separate."""
    _identifier("event_id", request.event_id)
    _identifier("asset_id", request.asset_id)
    _choice(
        "event_kind",
        request.event_kind,
        frozenset({"dividend", "fund_distribution", "cash_interest"}),
    )
    _currency(request.report_currency)
    _non_negative("withholding", request.withholding)
    _non_negative("fee", request.fee)
    provenance = _with_source(request.source_id, request.provenance)
    blockers: tuple[InvestmentBlocker, ...] = ()
    if request.gross_amount is None:
        blockers = (
            InvestmentBlocker(
                code="missing_price",
                message=f"Income value is missing for asset {request.asset_id}",
                source_id=request.source_id,
                asset_id=request.asset_id,
            ),
        )
        net_amount = None
    else:
        _non_negative("gross_amount", request.gross_amount)
        net_amount = request.gross_amount - request.withholding - request.fee
    return InvestmentIncomeResult(
        event_id=request.event_id,
        event_kind=request.event_kind,
        asset_id=request.asset_id,
        gross_amount=request.gross_amount,
        withholding=request.withholding,
        fee=request.fee,
        net_amount=net_amount,
        report_currency=request.report_currency,
        blockers=blockers,
        provenance=provenance,
    )


def calculate_crypto_swap(
    disposed_lots: tuple[LotState, ...], request: CryptoSwapInput
) -> CryptoSwapResult:
    """Treat a crypto swap as one disposal and one receipt-value acquisition."""
    _identifier("event_id", request.event_id)
    _identifier("disposed_asset_id", request.disposed_asset_id)
    _identifier("acquired_asset_id", request.acquired_asset_id)
    _identifier("acquired_lot_id", request.acquired_lot_id)
    _currency(request.report_currency)
    _positive("acquired_quantity", request.acquired_quantity)
    _non_negative("acquisition_fee", request.acquisition_fee)
    disposal = calculate_average_cost_disposal(
        disposed_lots,
        AverageCostDisposalInput(
            event_id=request.event_id,
            asset_id=request.disposed_asset_id,
            asset_kind="crypto",
            quantity=request.disposed_quantity,
            gross_proceeds=request.fair_value,
            fee=request.disposal_fee,
            report_currency=request.report_currency,
            source_id=request.source_id,
            provenance=request.provenance,
        ),
    )
    provenance = merge_provenance(
        disposal.provenance, _with_source(request.source_id, request.provenance)
    )
    acquired_basis = (
        None if request.fair_value is None else request.fair_value + request.acquisition_fee
    )
    acquired_lot = None
    if not disposal.blockers and acquired_basis is not None:
        acquired_lot = LotState(
            lot_id=request.acquired_lot_id,
            asset_id=request.acquired_asset_id,
            quantity=request.acquired_quantity,
            cost_basis=acquired_basis,
            source_id=request.source_id,
            provenance=request.provenance,
        )
    return CryptoSwapResult(
        event_id=request.event_id,
        disposal=disposal,
        acquired_lot=acquired_lot,
        acquired_cost_basis=acquired_basis,
        blockers=disposal.blockers,
        provenance=provenance,
    )


def calculate_crypto_transfer(
    source_lots: tuple[LotState, ...], request: CryptoTransferInput
) -> CryptoTransferResult:
    """Carry average basis to an owned destination; network fees remain explicit."""
    _identifier("event_id", request.event_id)
    _identifier("asset_id", request.asset_id)
    _identifier("source_account_id", request.source_account_id)
    _identifier("destination_lot_id", request.destination_lot_id)
    if request.destination_account_id is not None:
        _identifier("destination_account_id", request.destination_account_id)
    _positive("sent_quantity", request.sent_quantity)
    _non_negative("network_fee_quantity", request.network_fee_quantity)
    if request.network_fee_quantity > request.sent_quantity:
        raise ValueError("network_fee_quantity cannot exceed sent_quantity")
    withdrawal = consume_average_cost(
        source_lots,
        AverageCostWithdrawalInput(
            asset_id=request.asset_id,
            quantity=request.sent_quantity,
            source_id=request.source_id,
            provenance=request.provenance,
        ),
    )
    destination_blockers: tuple[InvestmentBlocker, ...] = ()
    if request.destination_account_id is None:
        destination_blockers = (
            InvestmentBlocker(
                code="missing_destination",
                message="The owner-controlled destination account is not identified",
                source_id=request.source_id,
                asset_id=request.asset_id,
            ),
        )
    blockers = _merge_blocker_objects(withdrawal.blockers, destination_blockers)
    received_quantity = request.sent_quantity - request.network_fee_quantity
    carried_basis: Decimal | None = None
    fee_basis: Decimal | None = None
    destination_lot = None
    if withdrawal.withdrawn_cost_basis is not None:
        if request.sent_quantity == ZERO:
            carried_basis = ZERO
            fee_basis = ZERO
        else:
            fee_basis = (
                withdrawal.withdrawn_cost_basis
                * request.network_fee_quantity
                / request.sent_quantity
            )
            carried_basis = withdrawal.withdrawn_cost_basis - fee_basis
        if not blockers and request.destination_account_id is not None and received_quantity > ZERO:
            destination_lot = LotState(
                lot_id=request.destination_lot_id,
                asset_id=request.asset_id,
                quantity=received_quantity,
                cost_basis=carried_basis,
                source_id=request.source_id,
                provenance=withdrawal.provenance,
            )
    return CryptoTransferResult(
        event_id=request.event_id,
        asset_id=request.asset_id,
        source_account_id=request.source_account_id,
        destination_account_id=request.destination_account_id,
        sent_quantity=request.sent_quantity,
        received_quantity=received_quantity,
        network_fee_quantity=request.network_fee_quantity,
        carried_cost_basis=carried_basis,
        fee_cost_basis=fee_basis,
        destination_lot=destination_lot,
        source_allocations=withdrawal.allocations,
        remaining_source_lots=withdrawal.remaining_lots,
        creates_gain=False,
        blockers=blockers,
        provenance=withdrawal.provenance,
    )


def calculate_income_receipt(request: IncomeReceiptInput) -> IncomeReceiptResult:
    """Value staking or lending income at receipt and establish the later disposal basis."""
    _identifier("event_id", request.event_id)
    _identifier("lot_id", request.lot_id)
    _identifier("asset_id", request.asset_id)
    _choice("receipt_kind", request.receipt_kind, frozenset({"staking_reward", "lending_interest"}))
    _currency(request.report_currency)
    _positive("quantity", request.quantity)
    provenance = _with_source(request.source_id, request.provenance)
    if request.receipt_unit_price is None:
        blocker = InvestmentBlocker(
            code="missing_price",
            message=f"Receipt-time value is missing for asset {request.asset_id}",
            source_id=request.source_id,
            asset_id=request.asset_id,
        )
        return IncomeReceiptResult(
            event_id=request.event_id,
            receipt_kind=request.receipt_kind,
            asset_id=request.asset_id,
            quantity=request.quantity,
            receipt_unit_price=None,
            income_value=None,
            report_currency=request.report_currency,
            lot=None,
            blockers=(blocker,),
            provenance=provenance,
        )
    _non_negative("receipt_unit_price", request.receipt_unit_price)
    income_value = request.quantity * request.receipt_unit_price
    lot = LotState(
        lot_id=request.lot_id,
        asset_id=request.asset_id,
        quantity=request.quantity,
        cost_basis=income_value,
        source_id=request.source_id,
        provenance=request.provenance,
    )
    return IncomeReceiptResult(
        event_id=request.event_id,
        receipt_kind=request.receipt_kind,
        asset_id=request.asset_id,
        quantity=request.quantity,
        receipt_unit_price=request.receipt_unit_price,
        income_value=income_value,
        report_currency=request.report_currency,
        lot=lot,
        blockers=(),
        provenance=provenance,
    )


def calculate_futures_position(request: FuturesPositionInput) -> FuturesPositionResult:
    """Replay futures fills while preserving P&L, funding, fees, and collateral separately."""
    _identifier("position_id", request.position_id)
    _identifier("contract_asset_id", request.contract_asset_id)
    _choice("side", request.side, frozenset({"long", "short"}))
    _choice(
        "contract_type",
        request.contract_type,
        frozenset({"perpetual", "dated", "cfd", "option", "other"}),
    )
    _choice(
        "margin_mode",
        request.margin_mode,
        frozenset({"cross", "isolated", "portfolio", "unknown"}),
    )
    _currency(request.report_currency)
    _positive("leverage", request.leverage)
    _non_negative("initial_collateral", request.initial_collateral)
    if not request.fills:
        raise ValueError("at least one futures fill is required")
    _unique_ids("fill_id", tuple(fill.fill_id for fill in request.fills))
    _unique_ids("cash_flow_id", tuple(flow.cash_flow_id for flow in request.cash_flows))
    for fill in request.fills:
        _identifier("fill_id", fill.fill_id)
        _choice(
            "fill kind",
            fill.kind,
            frozenset({"open", "increase", "decrease", "close", "liquidation"}),
        )
        _positive("fill.quantity", fill.quantity)
        _non_negative("fill.fee", fill.fee)
        if fill.price is not None:
            _non_negative("fill.price", fill.price)
    for cash_flow in request.cash_flows:
        _identifier("cash_flow_id", cash_flow.cash_flow_id)
        _choice(
            "cash flow kind",
            cash_flow.kind,
            frozenset({"funding", "fee", "liquidation_fee", "collateral"}),
        )
        _require_decimal("cash_flow.amount", cash_flow.amount)
        if cash_flow.kind in {"fee", "liquidation_fee"} and cash_flow.amount < ZERO:
            raise ValueError(f"{cash_flow.kind} must be non-negative")

    provenance = merge_provenance(
        _with_source(request.source_id, request.provenance),
        *(_with_source(fill.source_id, fill.provenance) for fill in request.fills),
        *(_with_source(flow.source_id, flow.provenance) for flow in request.cash_flows),
    )
    open_quantity = ZERO
    liquidated = False
    terminal = False
    for fill in request.fills:
        if terminal:
            raise ValueError("a terminal futures position cannot accept later fills")
        if fill.kind in {"open", "increase"}:
            open_quantity += fill.quantity
        else:
            if fill.quantity > open_quantity:
                raise ValueError("a reducing fill cannot exceed the open position quantity")
            if fill.kind in {"close", "liquidation"} and fill.quantity != open_quantity:
                raise ValueError(f"{fill.kind} must consume the complete open position")
            open_quantity -= fill.quantity
            liquidated = liquidated or fill.kind == "liquidation"
            terminal = open_quantity == ZERO
    status: Literal["open", "closed", "liquidated"]
    status = "liquidated" if liquidated else ("open" if open_quantity > ZERO else "closed")

    missing_prices = tuple(
        InvestmentBlocker(
            code="missing_price",
            message=f"Futures fill {fill.fill_id} has no execution price",
            source_id=fill.source_id,
            asset_id=request.contract_asset_id,
        )
        for fill in request.fills
        if fill.price is None
    )
    mark_blockers: tuple[InvestmentBlocker, ...] = ()
    if open_quantity > ZERO and request.mark_price is None:
        mark_blockers = (
            InvestmentBlocker(
                code="missing_price",
                message=f"Open position {request.position_id} has no mark price",
                source_id=request.source_id,
                asset_id=request.contract_asset_id,
            ),
        )
    elif request.mark_price is not None:
        _non_negative("mark_price", request.mark_price)
    blockers = _merge_blocker_objects(missing_prices, mark_blockers)

    liquidation_fees = sum(
        (flow.amount for flow in request.cash_flows if flow.kind == "liquidation_fee"), ZERO
    )
    fees = sum((fill.fee for fill in request.fills), ZERO) + sum(
        (flow.amount for flow in request.cash_flows if flow.kind in {"fee", "liquidation_fee"}),
        ZERO,
    )
    funding = sum((flow.amount for flow in request.cash_flows if flow.kind == "funding"), ZERO)
    collateral = request.initial_collateral + sum(
        (flow.amount for flow in request.cash_flows if flow.kind == "collateral"), ZERO
    )
    if collateral < ZERO:
        raise ValueError("collateral movements cannot produce negative collateral")
    if missing_prices:
        return FuturesPositionResult(
            position_id=request.position_id,
            contract_asset_id=request.contract_asset_id,
            side=request.side,
            contract_type=request.contract_type,
            leverage=request.leverage,
            margin_mode=request.margin_mode,
            report_currency=request.report_currency,
            status=status,
            open_quantity=open_quantity,
            average_entry_price=None,
            average_exit_price=None,
            realized_price_pnl=None,
            unrealized_price_pnl=None,
            liquidation_price=None,
            liquidation_price_pnl=None,
            funding=funding,
            fees=fees,
            liquidation_fees=liquidation_fees,
            collateral=collateral,
            net_realized_pnl=None,
            blockers=blockers,
            provenance=provenance,
        )

    position_quantity = ZERO
    entry_price = ZERO
    closed_quantity = ZERO
    exit_notional = ZERO
    realized = ZERO
    liquidation_quantity = ZERO
    liquidation_notional = ZERO
    liquidation_price_pnl = ZERO
    direction = Decimal("1") if request.side == "long" else Decimal("-1")
    for fill in request.fills:
        assert fill.price is not None
        if fill.kind in {"open", "increase"}:
            new_quantity = position_quantity + fill.quantity
            entry_price = (
                (entry_price * position_quantity) + (fill.price * fill.quantity)
            ) / new_quantity
            position_quantity = new_quantity
        else:
            fill_pnl = direction * (fill.price - entry_price) * fill.quantity
            realized += fill_pnl
            position_quantity -= fill.quantity
            closed_quantity += fill.quantity
            exit_notional += fill.price * fill.quantity
            if fill.kind == "liquidation":
                liquidation_quantity += fill.quantity
                liquidation_notional += fill.price * fill.quantity
                liquidation_price_pnl += fill_pnl

    average_entry_price = entry_price
    average_exit_price = None if closed_quantity == ZERO else exit_notional / closed_quantity
    liquidation_price = (
        None if liquidation_quantity == ZERO else liquidation_notional / liquidation_quantity
    )
    if position_quantity == ZERO:
        unrealized = ZERO
    elif request.mark_price is None:
        unrealized = None
    else:
        unrealized = direction * (request.mark_price - entry_price) * position_quantity
    return FuturesPositionResult(
        position_id=request.position_id,
        contract_asset_id=request.contract_asset_id,
        side=request.side,
        contract_type=request.contract_type,
        leverage=request.leverage,
        margin_mode=request.margin_mode,
        report_currency=request.report_currency,
        status=status,
        open_quantity=position_quantity,
        average_entry_price=average_entry_price,
        average_exit_price=average_exit_price,
        realized_price_pnl=realized,
        unrealized_price_pnl=unrealized,
        liquidation_price=liquidation_price,
        liquidation_price_pnl=(None if liquidation_quantity == ZERO else liquidation_price_pnl),
        funding=funding,
        fees=fees,
        liquidation_fees=liquidation_fees,
        collateral=collateral,
        net_realized_pnl=realized + funding - fees,
        blockers=blockers,
        provenance=provenance,
    )


def reconcile_bot_equity(
    request: BotEquityReconciliationInput,
) -> BotEquityReconciliationResult:
    """Reproduce closing bot equity from frozen statement movements."""
    _identifier("reconciliation_id", request.reconciliation_id)
    _require_decimal("opening_equity", request.opening_equity)
    _require_decimal("closing_equity", request.closing_equity)
    _non_negative("tolerance", request.tolerance)
    _unique_ids("movement_id", tuple(movement.movement_id for movement in request.movements))
    for movement in request.movements:
        _identifier("movement_id", movement.movement_id)
        _choice(
            "movement kind",
            movement.kind,
            frozenset(
                {
                    "deposit",
                    "withdrawal",
                    "transfer",
                    "realized_pnl",
                    "unrealized_pnl_change",
                    "funding",
                    "fee",
                    "liquidation_loss",
                    "adjustment",
                }
            ),
        )
        _require_decimal("movement.amount", movement.amount)
        if movement.kind in {"deposit", "withdrawal", "fee", "liquidation_loss"}:
            _non_negative(f"{movement.kind}.amount", movement.amount)

    def total(kind: str) -> Decimal:
        return sum((item.amount for item in request.movements if item.kind == kind), ZERO)

    deposits = total("deposit")
    withdrawals = total("withdrawal")
    transfers = total("transfer")
    realized = total("realized_pnl")
    unrealized = total("unrealized_pnl_change")
    funding = total("funding")
    fees = total("fee")
    liquidation_losses = total("liquidation_loss")
    adjustments = total("adjustment")
    trading_pnl = realized + unrealized - liquidation_losses + adjustments
    expected = (
        request.opening_equity + deposits - withdrawals + transfers + trading_pnl + funding - fees
    )
    difference = request.closing_equity - expected
    status: Literal["reconciled", "blocked"] = (
        "reconciled" if abs(difference) <= request.tolerance else "blocked"
    )
    blockers: tuple[InvestmentBlocker, ...] = ()
    if status == "blocked":
        blockers = (
            InvestmentBlocker(
                code="equity_mismatch",
                message=f"Observed bot equity differs from reproduced equity by {difference}",
                source_id=request.source_id,
            ),
        )
    provenance = merge_provenance(
        _with_source(request.source_id, request.provenance),
        *(_with_source(movement.source_id, movement.provenance) for movement in request.movements),
    )
    return BotEquityReconciliationResult(
        reconciliation_id=request.reconciliation_id,
        opening_equity=request.opening_equity,
        deposits=deposits,
        withdrawals=withdrawals,
        transfers=transfers,
        realized_pnl=realized,
        unrealized_pnl_change=unrealized,
        funding=funding,
        fees=fees,
        liquidation_losses=liquidation_losses,
        adjustments=adjustments,
        trading_pnl=trading_pnl,
        expected_closing_equity=expected,
        observed_closing_equity=request.closing_equity,
        difference=difference,
        tolerance=request.tolerance,
        status=status,
        blockers=blockers,
        provenance=provenance,
    )


def _merge_blocker_objects(
    *groups: tuple[InvestmentBlocker, ...],
) -> tuple[InvestmentBlocker, ...]:
    seen: set[tuple[BlockerCode, str, str | None, str]] = set()
    result: list[InvestmentBlocker] = []
    for blocker in (blocker for group in groups for blocker in group):
        key = (blocker.code, blocker.source_id, blocker.asset_id, blocker.message)
        if key not in seen:
            seen.add(key)
            result.append(blocker)
    return tuple(result)
