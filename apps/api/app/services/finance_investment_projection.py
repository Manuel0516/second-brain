"""Idempotent persistence projection from confirmed Finance events to investment subledgers."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import cast

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
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
    FinanceRawRecord,
    FinanceRevisionRawRecord,
    FinanceRevisionValuation,
    FinanceValuation,
    Link,
)
from app.services.finance_core import append_audit_entry, hash_payload
from app.services.finance_investments import (
    AssetKind,
    AverageCostDisposalInput,
    LotAllocation,
    LotState,
    SourceProvenance,
    calculate_average_cost_disposal,
)

_LOT_ASSET_TYPES = frozenset({"fund", "etf", "gold", "crypto"})
_POSITION_EVENT_TYPES = frozenset({"derivative_fill", "funding_payment", "fee"})


@dataclass(frozen=True, slots=True)
class FinanceInvestmentProjectionResult:
    processed_revision_ids: tuple[str, ...]
    skipped_revision_ids: tuple[str, ...]
    lot_ids: tuple[str, ...]
    lot_disposal_ids: tuple[str, ...]
    position_ids: tuple[str, ...]
    position_revision_ids: tuple[str, ...]
    bot_equity_snapshot_ids: tuple[str, ...]
    open_question_ids: tuple[str, ...]
    audit_entry_ids: tuple[str, ...]
    created: bool


@dataclass(frozen=True, slots=True)
class _RevisionContext:
    revision: FinanceEventRevision
    account: FinanceAccount
    components: tuple[FinanceEventComponent, ...]
    assets: Mapping[str, FinanceAsset]
    raw_record_ids: tuple[str, ...]
    valuation_ids: tuple[str, ...]
    valuation_by_asset: Mapping[str, str]
    evidence_document_ids: tuple[str, ...]
    source_fields: Mapping[str, object]

    @property
    def jurisdiction(self) -> str | None:
        value = self.source_fields.get("jurisdiction") or self.account.tax_jurisdiction
        normalized = str(value).strip().upper() if value is not None else ""
        return normalized if normalized in {"SE", "ES"} else None

    @property
    def provenance(self) -> dict[str, object]:
        source_id = self.source_fields.get("source_id") or self.revision.external_id
        return {
            "source_ids": [str(source_id)] if source_id else [],
            "raw_record_ids": list(self.raw_record_ids),
            "event_revision_ids": [self.revision.id],
            "valuation_ids": list(self.valuation_ids),
            "evidence_document_ids": list(self.evidence_document_ids),
        }

    @property
    def domain_provenance(self) -> SourceProvenance:
        provenance = self.provenance
        return SourceProvenance(
            source_ids=tuple(cast(list[str], provenance["source_ids"])),
            raw_record_ids=self.raw_record_ids,
            event_revision_ids=(self.revision.id,),
            valuation_ids=self.valuation_ids,
            evidence_document_ids=self.evidence_document_ids,
        )


def _decimal(value: object) -> Decimal | None:
    if value in (None, "") or isinstance(value, (bool, float)):
        return None
    try:
        result = value if isinstance(value, Decimal) else Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    return result if result.is_finite() else None


def _datetime(value: object, fallback: datetime | None = None) -> datetime | None:
    if value in (None, ""):
        return fallback
    if isinstance(value, datetime):
        result = value
    elif isinstance(value, str):
        try:
            result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    return result.replace(tzinfo=UTC) if result.tzinfo is None else result.astimezone(UTC)


def _as_mapping(value: object) -> Mapping[str, object] | None:
    return cast(Mapping[str, object], value) if isinstance(value, dict) else None


def _lot_method(context: _RevisionContext) -> str:
    configured = str(context.source_fields.get("lot_method", "")).strip().lower()
    if configured in {"average_cost", "fifo"}:
        return configured
    return "average_cost" if context.jurisdiction == "SE" else "fifo"


def _provenance_from_lot(lot: FinanceLot) -> SourceProvenance:
    value = lot.provenance

    def ids(key: str) -> tuple[str, ...]:
        raw = value.get(key, [])
        return tuple(str(item) for item in raw) if isinstance(raw, list) else ()

    return SourceProvenance(
        source_ids=ids("source_ids"),
        raw_record_ids=ids("raw_record_ids"),
        event_revision_ids=ids("event_revision_ids"),
        valuation_ids=ids("valuation_ids"),
        evidence_document_ids=ids("evidence_document_ids"),
    )


def _related(revision: FinanceEventRevision, asset_id: str | None = None) -> list[dict[str, str]]:
    entities = [{"type": "finance_event_revision", "id": revision.id}]
    if asset_id is not None:
        entities.append({"type": "finance_asset", "id": asset_id})
    return entities


async def _ensure_question(
    session: AsyncSession,
    *,
    context: _RevisionContext,
    code: str,
    title: str,
    description: str,
    asset_id: str | None = None,
) -> tuple[FinanceOpenQuestion, bool]:
    question_type = f"investment_{code}"
    rows = list(
        (
            await session.scalars(
                select(FinanceOpenQuestion).where(
                    FinanceOpenQuestion.user_id == context.revision.user_id,
                    FinanceOpenQuestion.question_type == question_type,
                )
            )
        ).all()
    )
    for row in rows:
        if any(
            entity.get("type") == "finance_event_revision"
            and entity.get("id") == context.revision.id
            for entity in row.related_entities
        ):
            return row, False
    row = FinanceOpenQuestion(
        user_id=context.revision.user_id,
        tax_profile_id=None,
        question_type=question_type,
        severity="blocking",
        title=title,
        description=description,
        status="open",
        owner_role="owner",
        related_entities=_related(context.revision, asset_id),
    )
    session.add(row)
    await session.flush()
    return row, True


async def _load_context(
    session: AsyncSession, revision: FinanceEventRevision
) -> _RevisionContext | None:
    account = await session.scalar(
        select(FinanceAccount).where(
            FinanceAccount.id == revision.source_account_id,
            FinanceAccount.user_id == revision.user_id,
        )
    )
    if account is None:
        return None
    components = tuple(
        (
            await session.scalars(
                select(FinanceEventComponent)
                .where(
                    FinanceEventComponent.user_id == revision.user_id,
                    FinanceEventComponent.event_revision_id == revision.id,
                )
                .order_by(FinanceEventComponent.id)
            )
        ).all()
    )
    asset_ids = tuple(dict.fromkeys(component.asset_id for component in components))
    assets = {
        row.id: row
        for row in (
            (
                await session.scalars(
                    select(FinanceAsset).where(
                        FinanceAsset.user_id == revision.user_id,
                        FinanceAsset.id.in_(asset_ids),
                    )
                )
            ).all()
            if asset_ids
            else []
        )
    }
    raw_rows = tuple(
        (
            await session.scalars(
                select(FinanceRawRecord)
                .join(
                    FinanceRevisionRawRecord,
                    FinanceRevisionRawRecord.raw_record_id == FinanceRawRecord.id,
                )
                .where(
                    FinanceRevisionRawRecord.event_revision_id == revision.id,
                    FinanceRawRecord.user_id == revision.user_id,
                )
                .order_by(FinanceRawRecord.source_index, FinanceRawRecord.id)
            )
        ).all()
    )
    valuations = tuple(
        (
            await session.scalars(
                select(FinanceValuation)
                .outerjoin(
                    FinanceRevisionValuation,
                    FinanceRevisionValuation.valuation_id == FinanceValuation.id,
                )
                .where(
                    FinanceValuation.user_id == revision.user_id,
                    or_(
                        FinanceValuation.event_revision_id == revision.id,
                        FinanceRevisionValuation.event_revision_id == revision.id,
                    ),
                )
                .order_by(FinanceValuation.created_at, FinanceValuation.id)
            )
        ).all()
    )
    evidence_ids = tuple(
        (
            await session.scalars(
                select(Link.target_id)
                .join(FinanceEvidenceDocument, FinanceEvidenceDocument.id == Link.target_id)
                .where(
                    Link.source_type == "finance_event_revision",
                    Link.source_id == revision.id,
                    Link.target_type == "finance_evidence",
                    Link.relation == "supported_by",
                    FinanceEvidenceDocument.user_id == revision.user_id,
                )
                .order_by(Link.target_id)
            )
        ).all()
    )
    source_fields: dict[str, object] = {}
    for raw in raw_rows:
        source_fields.update(raw.original_payload)
        source_fields.update(raw.extracted_payload or {})
    for component in components:
        source_fields.update(component.attributes)
    source_fields.update(revision.attributes)
    return _RevisionContext(
        revision=revision,
        account=account,
        components=components,
        assets=assets,
        raw_record_ids=tuple(row.id for row in raw_rows),
        valuation_ids=tuple(dict.fromkeys(row.id for row in valuations)),
        valuation_by_asset={row.asset_id: row.id for row in valuations},
        evidence_document_ids=tuple(dict.fromkeys(evidence_ids)),
        source_fields=source_fields,
    )


def _valuation_id(context: _RevisionContext, asset_id: str) -> str | None:
    # Revision valuation IDs are already owner-scoped by _load_context. Component values remain
    # usable without a separate valuation row, so absence is represented as null rather than
    # guessed.
    return context.valuation_by_asset.get(asset_id)


def _shares(total: Decimal, weights: Sequence[Decimal]) -> tuple[Decimal, ...]:
    if not weights:
        return ()
    weight_total = sum(weights, Decimal(0))
    resolved = list(weights if weight_total != 0 else (Decimal(1) for _ in weights))
    divisor = weight_total if weight_total != 0 else Decimal(len(resolved))
    result: list[Decimal] = []
    allocated = Decimal(0)
    for index, weight in enumerate(resolved):
        value = total - allocated if index == len(resolved) - 1 else total * weight / divisor
        result.append(value)
        allocated += value
    return tuple(result)


async def _project_acquisitions(
    session: AsyncSession,
    context: _RevisionContext,
    components: Sequence[FinanceEventComponent],
    fees: Sequence[Decimal],
) -> tuple[list[str], list[str], bool]:
    lot_ids: list[str] = []
    question_ids: list[str] = []
    created = False
    if not components:
        return lot_ids, question_ids, created
    jurisdiction = context.jurisdiction
    if jurisdiction is None:
        question, was_created = await _ensure_question(
            session,
            context=context,
            code="missing_jurisdiction",
            title="Investment jurisdiction is missing",
            description="Choose Sweden or Spain before creating jurisdiction-specific lots.",
        )
        return lot_ids, [question.id], was_created
    method = _lot_method(context)
    grouped: dict[str, list[FinanceEventComponent]] = {}
    for component in components:
        grouped.setdefault(component.asset_id, []).append(component)
    values = [
        sum((abs(cast(Decimal, row.fiat_value)) for row in rows), Decimal(0))
        for rows in grouped.values()
        if all(row.fiat_value is not None for row in rows)
    ]
    fee_total = sum(fees, Decimal(0))
    fee_shares = _shares(fee_total, values) if len(values) == len(grouped) else ()
    for index, (asset_id, rows) in enumerate(grouped.items()):
        asset = context.assets.get(asset_id)
        if asset is None or asset.asset_type not in _LOT_ASSET_TYPES:
            continue
        quantity = sum((abs(row.quantity) for row in rows), Decimal(0))
        if quantity == 0 or any(row.fiat_value is None for row in rows):
            question, was_created = await _ensure_question(
                session,
                context=context,
                code="missing_price",
                title="Investment acquisition value is missing",
                description="Add a reporting-currency value before establishing acquisition basis.",
                asset_id=asset_id,
            )
            question_ids.append(question.id)
            created = created or was_created
            continue
        existing = await session.scalar(
            select(FinanceLot).where(
                FinanceLot.user_id == context.revision.user_id,
                FinanceLot.asset_id == asset_id,
                FinanceLot.acquisition_revision_id == context.revision.id,
                FinanceLot.jurisdiction == jurisdiction,
                FinanceLot.method == method,
            )
        )
        if existing is not None:
            lot_ids.append(existing.id)
            continue
        purchase_cost = sum((abs(cast(Decimal, row.fiat_value)) for row in rows), Decimal(0))
        fee = fee_shares[index] if fee_shares else Decimal(0)
        currency_values = {row.currency for row in rows if row.currency}
        currency = next(iter(currency_values)) if len(currency_values) == 1 else None
        if currency is None:
            question, was_created = await _ensure_question(
                session,
                context=context,
                code="missing_price",
                title="Investment reporting currency is missing",
                description="Use one reporting currency for all acquisition components.",
                asset_id=asset_id,
            )
            question_ids.append(question.id)
            created = created or was_created
            continue
        row = FinanceLot(
            user_id=context.revision.user_id,
            account_id=rows[0].account_id or context.revision.source_account_id,
            asset_id=asset_id,
            acquisition_revision_id=context.revision.id,
            acquisition_valuation_id=_valuation_id(context, asset_id),
            jurisdiction=jurisdiction,
            tax_year=context.revision.tax_date.year,
            method=method,
            acquired_at=context.revision.effective_at,
            acquired_quantity=quantity,
            remaining_quantity=quantity,
            cost_basis=purchase_cost + fee,
            reporting_currency=currency.upper(),
            status="open",
            provenance={
                **context.provenance,
                "component_ids": [component.id for component in rows],
                "fee_in_basis": format(fee, "f"),
            },
        )
        session.add(row)
        await session.flush()
        lot_ids.append(row.id)
        created = True
    return lot_ids, question_ids, created


async def _open_lot_states(
    session: AsyncSession,
    *,
    context: _RevisionContext,
    asset_id: str,
    method: str,
) -> tuple[tuple[FinanceLot, LotState], ...]:
    jurisdiction = cast(str, context.jurisdiction)
    rows = tuple(
        (
            await session.scalars(
                select(FinanceLot)
                .where(
                    FinanceLot.user_id == context.revision.user_id,
                    FinanceLot.asset_id == asset_id,
                    FinanceLot.jurisdiction == jurisdiction,
                    FinanceLot.method == method,
                    FinanceLot.status == "open",
                    FinanceLot.remaining_quantity > 0,
                )
                .order_by(FinanceLot.acquired_at, FinanceLot.id)
                .with_for_update()
            )
        ).all()
    )
    if not rows:
        return ()
    allocated_costs = {
        lot_id: Decimal(str(value or 0))
        for lot_id, value in (
            await session.execute(
                select(
                    FinanceLotDisposal.lot_id,
                    func.sum(FinanceLotDisposal.cost_basis),
                )
                .where(
                    FinanceLotDisposal.user_id == context.revision.user_id,
                    FinanceLotDisposal.lot_id.in_([row.id for row in rows]),
                )
                .group_by(FinanceLotDisposal.lot_id)
            )
        ).all()
    }
    return tuple(
        (
            row,
            LotState(
                lot_id=row.id,
                asset_id=row.asset_id,
                quantity=row.remaining_quantity,
                cost_basis=row.cost_basis - allocated_costs.get(row.id, Decimal(0)),
                source_id=row.acquisition_revision_id,
                provenance=_provenance_from_lot(row),
            ),
        )
        for row in rows
    )


def _fifo_allocations(
    lots: Sequence[LotState], quantity: Decimal, provenance: SourceProvenance
) -> tuple[LotAllocation, ...]:
    remaining = quantity
    allocations: list[LotAllocation] = []
    for lot in lots:
        if remaining == 0:
            break
        allocated_quantity = min(lot.quantity, remaining)
        allocated_cost = lot.cost_basis * allocated_quantity / lot.quantity
        allocations.append(
            LotAllocation(
                lot_id=lot.lot_id,
                quantity=allocated_quantity,
                cost_basis=allocated_cost,
                provenance=provenance,
            )
        )
        remaining -= allocated_quantity
    return tuple(allocations) if remaining == 0 else ()


async def _project_disposals(
    session: AsyncSession,
    context: _RevisionContext,
    components: Sequence[FinanceEventComponent],
    fees: Sequence[Decimal],
) -> tuple[list[str], list[str], bool]:
    disposal_ids: list[str] = []
    question_ids: list[str] = []
    created = False
    if not components:
        return disposal_ids, question_ids, created
    jurisdiction = context.jurisdiction
    if jurisdiction is None:
        question, was_created = await _ensure_question(
            session,
            context=context,
            code="missing_jurisdiction",
            title="Investment jurisdiction is missing",
            description="Choose Sweden or Spain before allocating disposal basis.",
        )
        return disposal_ids, [question.id], was_created
    method = _lot_method(context)
    grouped: dict[str, list[FinanceEventComponent]] = {}
    for component in components:
        grouped.setdefault(component.asset_id, []).append(component)
    gross_values = [
        sum((abs(cast(Decimal, row.fiat_value)) for row in rows), Decimal(0))
        for rows in grouped.values()
        if all(row.fiat_value is not None for row in rows)
    ]
    fee_total = sum(fees, Decimal(0))
    fee_shares = _shares(fee_total, gross_values) if len(gross_values) == len(grouped) else ()
    for index, (asset_id, rows) in enumerate(grouped.items()):
        asset = context.assets.get(asset_id)
        if asset is None or asset.asset_type not in _LOT_ASSET_TYPES:
            continue
        existing = list(
            (
                await session.scalars(
                    select(FinanceLotDisposal).where(
                        FinanceLotDisposal.user_id == context.revision.user_id,
                        FinanceLotDisposal.disposal_revision_id == context.revision.id,
                        FinanceLotDisposal.jurisdiction == jurisdiction,
                        FinanceLotDisposal.method == method,
                    )
                )
            ).all()
        )
        if existing:
            disposal_ids.extend(row.id for row in existing)
            continue
        if any(row.fiat_value is None for row in rows):
            question, was_created = await _ensure_question(
                session,
                context=context,
                code="missing_price",
                title="Investment disposal value is missing",
                description="Add gross proceeds in the reporting currency before allocating lots.",
                asset_id=asset_id,
            )
            question_ids.append(question.id)
            created = created or was_created
            continue
        quantity = sum((abs(row.quantity) for row in rows), Decimal(0))
        gross = sum((abs(cast(Decimal, row.fiat_value)) for row in rows), Decimal(0))
        fee = fee_shares[index] if fee_shares else Decimal(0)
        currency_values = {row.currency for row in rows if row.currency}
        currency = next(iter(currency_values)) if len(currency_values) == 1 else None
        lot_pairs = await _open_lot_states(
            session, context=context, asset_id=asset_id, method=method
        )
        if not lot_pairs:
            question, was_created = await _ensure_question(
                session,
                context=context,
                code="missing_lot",
                title="Investment acquisition lot is missing",
                description="Add or reconcile acquisition history before confirming this disposal.",
                asset_id=asset_id,
            )
            question_ids.append(question.id)
            created = created or was_created
            continue
        domain_lots = tuple(pair[1] for pair in lot_pairs)
        if method == "average_cost":
            result = calculate_average_cost_disposal(
                domain_lots,
                AverageCostDisposalInput(
                    event_id=context.revision.event_id,
                    asset_id=asset_id,
                    asset_kind=cast(AssetKind, asset.asset_type),
                    quantity=quantity,
                    gross_proceeds=gross,
                    fee=fee,
                    report_currency=currency or "EUR",
                    source_id=context.revision.id,
                    provenance=context.domain_provenance,
                ),
            )
            allocations = result.allocations
        else:
            allocations = _fifo_allocations(domain_lots, quantity, context.domain_provenance)
        if not allocations:
            question, was_created = await _ensure_question(
                session,
                context=context,
                code="missing_lot",
                title="Investment lot quantity is insufficient",
                description="The confirmed disposal exceeds the available acquisition quantity.",
                asset_id=asset_id,
            )
            question_ids.append(question.id)
            created = created or was_created
            continue
        if currency is None:
            question, was_created = await _ensure_question(
                session,
                context=context,
                code="missing_price",
                title="Investment reporting currency is missing",
                description="Use one reporting currency for all disposal components.",
                asset_id=asset_id,
            )
            question_ids.append(question.id)
            created = created or was_created
            continue
        net_proceeds = gross - fee
        proceeds_shares = _shares(net_proceeds, [item.quantity for item in allocations])
        lots_by_id = {row.id: row for row, _ in lot_pairs}
        for allocation, proceeds in zip(allocations, proceeds_shares, strict=True):
            lot = lots_by_id[allocation.lot_id]
            disposal = FinanceLotDisposal(
                user_id=context.revision.user_id,
                lot_id=lot.id,
                disposal_revision_id=context.revision.id,
                jurisdiction=jurisdiction,
                tax_year=context.revision.tax_date.year,
                method=method,
                allocated_quantity=allocation.quantity,
                cost_basis=allocation.cost_basis,
                proceeds=proceeds,
                gain_loss=proceeds - allocation.cost_basis,
                reporting_currency=currency.upper(),
                calculation_trace={
                    **context.provenance,
                    "component_ids": [component.id for component in rows],
                    "gross_proceeds": format(gross, "f"),
                    "fee": format(fee, "f"),
                    "allocated_proceeds": format(proceeds, "f"),
                    "allocated_cost_basis": format(allocation.cost_basis, "f"),
                    "method": method,
                },
            )
            session.add(disposal)
            lot.remaining_quantity -= allocation.quantity
            if lot.remaining_quantity == 0:
                lot.status = "depleted"
            await session.flush()
            disposal_ids.append(disposal.id)
            created = True
    return disposal_ids, question_ids, created


async def _project_position(
    session: AsyncSession, context: _RevisionContext
) -> tuple[list[str], list[str], list[str], bool]:
    fields = context.source_fields
    nested = _as_mapping(fields.get("position_snapshot"))
    snapshot = dict(fields)
    if nested is not None:
        snapshot.update(nested)
    provider_position_id = str(snapshot.get("provider_position_id", "")).strip()
    derivative_assets = [
        asset for asset in context.assets.values() if asset.asset_type == "derivative"
    ]
    is_position_event = context.revision.event_type == "derivative_fill" or (
        context.revision.event_type in _POSITION_EVENT_TYPES
        and (provider_position_id or derivative_assets)
    )
    if not is_position_event:
        return [], [], [], False
    asset_id = str(snapshot.get("contract_asset_id", "")).strip()
    if not asset_id and derivative_assets:
        asset_id = derivative_assets[0].id
    required_text = {
        "provider_position_id": provider_position_id,
        "contract_asset_id": asset_id,
        "direction": str(snapshot.get("direction", "")).strip().lower(),
        "position_status": str(snapshot.get("position_status", "")).strip().lower(),
        "reporting_currency": str(
            snapshot.get("reporting_currency") or context.account.base_currency
        )
        .strip()
        .upper(),
    }
    required_decimals = {
        key: _decimal(snapshot.get(key))
        for key in (
            "leverage",
            "entry_price",
            "size",
            "collateral",
            "funding_total",
            "fee_total",
        )
    }
    contract_type = str(snapshot.get("contract_type", "perpetual")).strip().lower()
    margin_mode = str(snapshot.get("margin_mode", "unknown")).strip().lower()
    if (
        not all(required_text.values())
        or required_text["direction"] not in {"long", "short"}
        or required_text["position_status"] not in {"open", "closed", "liquidated"}
        or required_text["reporting_currency"] != required_text["reporting_currency"].upper()
        or len(required_text["reporting_currency"]) != 3
        or contract_type not in {"perpetual", "dated", "cfd", "option", "other"}
        or margin_mode not in {"cross", "isolated", "portfolio", "unknown"}
        or any(value is None for value in required_decimals.values())
        or cast(Decimal, required_decimals["leverage"]) <= 0
        or cast(Decimal, required_decimals["entry_price"]) < 0
        or cast(Decimal, required_decimals["size"]) < 0
        or cast(Decimal, required_decimals["collateral"]) < 0
        or cast(Decimal, required_decimals["fee_total"]) < 0
        or asset_id not in context.assets
    ):
        question, created = await _ensure_question(
            session,
            context=context,
            code="missing_source_fields",
            title="Derivative position fields are incomplete",
            description=(
                "Provide provider position ID, direction, status, leverage, entry price, size, "
                "collateral, funding, fees and reporting currency."
            ),
            asset_id=asset_id or None,
        )
        return [], [], [question.id], created
    position = await session.scalar(
        select(FinancePosition)
        .where(
            FinancePosition.user_id == context.revision.user_id,
            FinancePosition.account_id == context.revision.source_account_id,
            FinancePosition.provider_position_id == provider_position_id,
        )
        .with_for_update()
    )
    created = False
    if position is None:
        position = FinancePosition(
            user_id=context.revision.user_id,
            account_id=context.revision.source_account_id,
            asset_id=asset_id,
            provider_position_id=provider_position_id,
        )
        session.add(position)
        await session.flush()
        created = True
    revisions = list(
        (
            await session.scalars(
                select(FinancePositionRevision)
                .where(
                    FinancePositionRevision.user_id == context.revision.user_id,
                    FinancePositionRevision.position_id == position.id,
                )
                .order_by(FinancePositionRevision.revision_number)
            )
        ).all()
    )
    for row in revisions:
        if context.revision.id in row.source_revision_ids:
            return [position.id], [row.id], [], created
    prior = revisions[-1] if revisions else None
    source_revision_ids = list(
        dict.fromkeys([*(prior.source_revision_ids if prior else []), context.revision.id])
    )
    status = required_text["position_status"]
    row = FinancePositionRevision(
        user_id=context.revision.user_id,
        position_id=position.id,
        revision_number=1 if prior is None else prior.revision_number + 1,
        contract_type=contract_type,
        direction=required_text["direction"],
        leverage=cast(Decimal, required_decimals["leverage"]),
        margin_mode=margin_mode,
        opened_at=_datetime(snapshot.get("opened_at"), context.revision.effective_at),
        closed_at=(
            _datetime(snapshot.get("closed_at"), context.revision.effective_at)
            if status in {"closed", "liquidated"}
            else None
        ),
        entry_price=cast(Decimal, required_decimals["entry_price"]),
        exit_price=_decimal(snapshot.get("exit_price")),
        size=cast(Decimal, required_decimals["size"]),
        collateral=cast(Decimal, required_decimals["collateral"]),
        realized_pnl=_decimal(snapshot.get("realized_pnl")),
        unrealized_pnl=_decimal(snapshot.get("unrealized_pnl")),
        funding_total=cast(Decimal, required_decimals["funding_total"]),
        fee_total=cast(Decimal, required_decimals["fee_total"]),
        liquidation_price=_decimal(snapshot.get("liquidation_price")),
        reporting_currency=required_text["reporting_currency"],
        status=status,
        source_revision_ids=source_revision_ids,
        supersedes_revision_id=prior.id if prior else None,
    )
    session.add(row)
    await session.flush()
    position.current_revision_id = row.id
    return [position.id], [row.id], [], True


async def _project_bot_equity(
    session: AsyncSession, context: _RevisionContext
) -> tuple[list[str], list[str], bool]:
    nested = _as_mapping(context.source_fields.get("bot_equity"))
    if nested is None:
        return [], [], False
    values = {
        key: _decimal(nested.get(key))
        for key in (
            "opening_equity",
            "deposits",
            "withdrawals",
            "transfers",
            "trading_pnl",
            "funding",
            "fees",
            "observed_equity",
            "tolerance",
        )
    }
    currency = str(nested.get("reporting_currency") or context.account.base_currency).upper()
    if any(value is None for value in values.values()) or len(currency) != 3:
        question, created = await _ensure_question(
            session,
            context=context,
            code="missing_price",
            title="Bot-equity statement values are incomplete",
            description=(
                "Provide opening and observed equity, transfers, trading P&L, funding, fees and "
                "the reconciliation tolerance."
            ),
        )
        return [], [question.id], created
    expected = (
        cast(Decimal, values["opening_equity"])
        + cast(Decimal, values["deposits"])
        - cast(Decimal, values["withdrawals"])
        + cast(Decimal, values["transfers"])
        + cast(Decimal, values["trading_pnl"])
        + cast(Decimal, values["funding"])
        - cast(Decimal, values["fees"])
    )
    observed = cast(Decimal, values["observed_equity"])
    difference = observed - expected
    source_hash = hash_payload(
        {"event_revision_id": context.revision.id, "bot_equity": dict(nested)}
    )
    existing = await session.scalar(
        select(FinanceBotEquitySnapshot).where(
            FinanceBotEquitySnapshot.user_id == context.revision.user_id,
            FinanceBotEquitySnapshot.account_id == context.revision.source_account_id,
            FinanceBotEquitySnapshot.as_of == context.revision.effective_at,
            FinanceBotEquitySnapshot.source_hash == source_hash,
        )
    )
    snapshot_ids: list[str] = []
    created = False
    if existing is None:
        existing = FinanceBotEquitySnapshot(
            user_id=context.revision.user_id,
            account_id=context.revision.source_account_id,
            as_of=context.revision.effective_at,
            opening_equity=cast(Decimal, values["opening_equity"]),
            deposits=cast(Decimal, values["deposits"]),
            withdrawals=cast(Decimal, values["withdrawals"]),
            transfers=cast(Decimal, values["transfers"]),
            trading_pnl=cast(Decimal, values["trading_pnl"]),
            funding=cast(Decimal, values["funding"]),
            fees=cast(Decimal, values["fees"]),
            expected_equity=expected,
            observed_equity=observed,
            difference=difference,
            reporting_currency=currency,
            source_revision_ids=[context.revision.id],
            source_hash=source_hash,
        )
        session.add(existing)
        await session.flush()
        created = True
    snapshot_ids.append(existing.id)
    question_ids: list[str] = []
    if abs(difference) > cast(Decimal, values["tolerance"]):
        question, question_created = await _ensure_question(
            session,
            context=context,
            code="equity_mismatch",
            title="Bot equity does not reconcile",
            description=(
                f"Observed equity differs from reproduced equity by {format(difference, 'f')}."
            ),
        )
        question_ids.append(question.id)
        created = created or question_created
    return snapshot_ids, question_ids, created


async def project_confirmed_investments(
    session: AsyncSession,
    *,
    user_id: str,
    revision_ids: Sequence[str],
    actor_id: str | None = None,
) -> FinanceInvestmentProjectionResult:
    """Project owned confirmed current revisions in the caller's transaction, exactly once."""
    ordered_ids = tuple(dict.fromkeys(revision_ids))
    if not ordered_ids:
        return FinanceInvestmentProjectionResult((), (), (), (), (), (), (), (), (), False)
    revisions = list(
        (
            await session.scalars(
                select(FinanceEventRevision)
                .join(FinanceEvent, FinanceEvent.current_revision_id == FinanceEventRevision.id)
                .where(
                    FinanceEventRevision.user_id == user_id,
                    FinanceEvent.user_id == user_id,
                    FinanceEventRevision.id.in_(ordered_ids),
                    FinanceEventRevision.status == "confirmed",
                )
            )
        ).all()
    )
    by_id = {row.id: row for row in revisions}
    processed: list[str] = []
    skipped = [revision_id for revision_id in ordered_ids if revision_id not in by_id]
    lot_ids: list[str] = []
    disposal_ids: list[str] = []
    position_ids: list[str] = []
    position_revision_ids: list[str] = []
    snapshot_ids: list[str] = []
    question_ids: list[str] = []
    audit_ids: list[str] = []
    created_any = False
    for revision_id in ordered_ids:
        revision = by_id.get(revision_id)
        if revision is None:
            continue
        context = await _load_context(session, revision)
        if context is None:
            skipped.append(revision.id)
            continue
        processed.append(revision.id)
        lot_start = len(lot_ids)
        disposal_start = len(disposal_ids)
        position_revision_start = len(position_revision_ids)
        snapshot_start = len(snapshot_ids)
        revision_created = False
        revision_questions: list[str] = []
        if not context.evidence_document_ids:
            question, question_created = await _ensure_question(
                session,
                context=context,
                code="missing_evidence",
                title="Investment evidence is missing",
                description="Link immutable source evidence to this confirmed investment event.",
            )
            revision_questions.append(question.id)
            revision_created = revision_created or question_created

        components = [
            component
            for component in context.components
            if context.assets.get(component.asset_id) is not None
            and context.assets[component.asset_id].asset_type in _LOT_ASSET_TYPES
        ]
        acquisitions = [
            component
            for component in components
            if (
                context.revision.event_type == "trade"
                and component.role == "asset_in"
                and component.quantity > 0
            )
            or (
                context.revision.event_type == "staking_reward"
                and component.role in {"reward", "asset_in", "income"}
                and component.quantity > 0
            )
            or (
                context.revision.event_type == "interest"
                and context.assets[component.asset_id].asset_type == "crypto"
                and component.role in {"reward", "asset_in", "income"}
                and component.quantity > 0
            )
        ]
        disposals = [
            component
            for component in components
            if context.revision.event_type == "trade"
            and (component.role in {"asset_out", "disposal"} or component.quantity < 0)
        ]
        if context.revision.supersedes_revision_id:
            prior_projection = bool(
                await session.scalar(
                    select(
                        or_(
                            select(FinanceLot.id)
                            .where(
                                FinanceLot.user_id == user_id,
                                FinanceLot.acquisition_revision_id
                                == context.revision.supersedes_revision_id,
                            )
                            .exists(),
                            select(FinanceLotDisposal.id)
                            .where(
                                FinanceLotDisposal.user_id == user_id,
                                FinanceLotDisposal.disposal_revision_id
                                == context.revision.supersedes_revision_id,
                            )
                            .exists(),
                        )
                    )
                )
            )
            if prior_projection:
                question, question_created = await _ensure_question(
                    session,
                    context=context,
                    code="restatement_required",
                    title="Investment subledger restatement is required",
                    description=(
                        "This correction supersedes a revision already used by a lot allocation; "
                        "review the derived subledger before replacing it."
                    ),
                )
                revision_questions.append(question.id)
                revision_created = revision_created or question_created
                acquisitions = []
                disposals = []
        fee_components = [component for component in context.components if component.role == "fee"]
        missing_fee_value = any(component.fiat_value is None for component in fee_components)
        if missing_fee_value and (acquisitions or disposals):
            question, question_created = await _ensure_question(
                session,
                context=context,
                code="missing_price",
                title="Investment fee value is missing",
                description=(
                    "Value every fee before projecting acquisition basis or disposal proceeds."
                ),
            )
            revision_questions.append(question.id)
            revision_created = revision_created or question_created
        else:
            acquisition_fees = [
                abs(component.fiat_value)
                for component in fee_components
                if component.fiat_value is not None
                and str(component.attributes.get("fee_scope", "")).lower() == "acquisition"
            ]
            disposal_fees = [
                abs(component.fiat_value)
                for component in fee_components
                if component.fiat_value is not None
                and str(component.attributes.get("fee_scope", "")).lower() == "disposal"
            ]
            unscoped_fees = [
                abs(component.fiat_value)
                for component in fee_components
                if component.fiat_value is not None
                and str(component.attributes.get("fee_scope", "")).lower()
                not in {"acquisition", "disposal"}
            ]
            if disposals:
                disposal_fees.extend(unscoped_fees)
            else:
                acquisition_fees.extend(unscoped_fees)
            new_lots, new_questions, was_created = await _project_acquisitions(
                session, context, acquisitions, acquisition_fees
            )
            lot_ids.extend(new_lots)
            revision_questions.extend(new_questions)
            revision_created = revision_created or was_created
            new_disposals, new_questions, was_created = await _project_disposals(
                session, context, disposals, disposal_fees
            )
            disposal_ids.extend(new_disposals)
            revision_questions.extend(new_questions)
            revision_created = revision_created or was_created

        if context.revision.event_type == "transfer":
            destination_id = str(context.source_fields.get("destination_account_id", "")).strip()
            destination = (
                await session.scalar(
                    select(FinanceAccount.id).where(
                        FinanceAccount.id == destination_id,
                        FinanceAccount.user_id == user_id,
                    )
                )
                if destination_id
                else None
            )
            if destination is None:
                question, question_created = await _ensure_question(
                    session,
                    context=context,
                    code="missing_destination",
                    title="Transfer destination is not identified",
                    description=(
                        "Select an owner-controlled destination before treating this as a transfer."
                    ),
                )
                revision_questions.append(question.id)
                revision_created = revision_created or question_created

        new_positions, new_position_revisions, new_questions, was_created = await _project_position(
            session, context
        )
        position_ids.extend(new_positions)
        position_revision_ids.extend(new_position_revisions)
        revision_questions.extend(new_questions)
        revision_created = revision_created or was_created
        new_snapshots, new_questions, was_created = await _project_bot_equity(session, context)
        snapshot_ids.extend(new_snapshots)
        revision_questions.extend(new_questions)
        revision_created = revision_created or was_created
        question_ids.extend(revision_questions)
        if revision_created:
            audit = await append_audit_entry(
                session,
                user_id=user_id,
                actor_id=actor_id or user_id,
                action="investment.projection_created",
                entity_type="finance_event_revision",
                entity_id=revision.id,
                request={
                    "revision_id": revision.id,
                    "lot_ids": lot_ids[lot_start:],
                    "lot_disposal_ids": disposal_ids[disposal_start:],
                    "position_revision_ids": position_revision_ids[position_revision_start:],
                    "bot_equity_snapshot_ids": snapshot_ids[snapshot_start:],
                    "open_question_ids": revision_questions,
                },
                new_revision_id=revision.id,
            )
            audit_ids.append(audit.id)
            created_any = True
    await session.flush()
    return FinanceInvestmentProjectionResult(
        processed_revision_ids=tuple(processed),
        skipped_revision_ids=tuple(dict.fromkeys(skipped)),
        lot_ids=tuple(dict.fromkeys(lot_ids)),
        lot_disposal_ids=tuple(dict.fromkeys(disposal_ids)),
        position_ids=tuple(dict.fromkeys(position_ids)),
        position_revision_ids=tuple(dict.fromkeys(position_revision_ids)),
        bot_equity_snapshot_ids=tuple(dict.fromkeys(snapshot_ids)),
        open_question_ids=tuple(dict.fromkeys(question_ids)),
        audit_entry_ids=tuple(dict.fromkeys(audit_ids)),
        created=created_any,
    )
