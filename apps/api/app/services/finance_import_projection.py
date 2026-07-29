"""Project accepted immutable import rows into canonical Finance events."""

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import cast
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    FinanceAccount,
    FinanceAsset,
    FinanceEvent,
    FinanceEventComponent,
    FinanceEventRevision,
    FinanceImport,
    FinanceRawRecord,
    FinanceReviewGroup,
    FinanceReviewGroupMember,
    FinanceRevisionRawRecord,
    FinanceRevisionValuation,
    FinanceValuation,
    Link,
)
from app.services.finance_core import hash_payload
from app.services.finance_imports import CANONICAL_EVENT_TYPES, FinanceImportError

_CRYPTO_SYMBOLS = {
    "ADA",
    "AVAX",
    "BNB",
    "BTC",
    "DOGE",
    "DOT",
    "ETH",
    "LINK",
    "LTC",
    "SOL",
    "USDC",
    "USDT",
    "XRP",
}


@dataclass(frozen=True, slots=True)
class ImportProjectionResult:
    event_revision_ids: tuple[str, ...]
    review_group_ids: tuple[str, ...]
    created_assets: tuple[FinanceAsset, ...]
    created_event_revision_ids: tuple[str, ...]
    created: bool


def _decimal(value: object) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        result = Decimal(str(value))
    except InvalidOperation:
        return None
    return result if result.is_finite() else None


def _event_type(payload: dict[str, object]) -> str:
    candidate = str(payload.get("event_type", "other")).strip().lower()
    if candidate not in CANONICAL_EVENT_TYPES:
        raise FinanceImportError("Mapped event type is unsupported")
    return candidate


def _component_role(event_type: str) -> str:
    return {
        "income": "income",
        "staking_reward": "reward",
        "interest": "income",
        "dividend": "income",
        "funding_payment": "funding",
        "expense": "expense",
        "fee": "fee",
        "withholding": "withholding",
        "transfer": "transfer",
        "trade": "asset_in",
        "derivative_fill": "asset_in",
    }.get(event_type, "other")


def _candidate_treatment(event_type: str) -> str | None:
    return {
        "income": "income",
        "staking_reward": "staking_income",
        "interest": "interest_income",
        "dividend": "dividend_income",
        "funding_payment": "derivative_funding",
        "expense": "expense",
        "fee": "fee",
        "withholding": "withholding",
        "trade": "asset_disposal_or_acquisition",
        "derivative_fill": "derivative_result",
    }.get(event_type)


async def _asset_for_symbol(
    session: AsyncSession,
    *,
    user_id: str,
    symbol: str,
    base_currency: str,
) -> tuple[FinanceAsset, bool]:
    normalized = symbol.strip().upper()
    row = await session.scalar(
        select(FinanceAsset)
        .where(
            FinanceAsset.user_id == user_id,
            func.upper(FinanceAsset.symbol) == normalized,
        )
        .order_by(FinanceAsset.created_at, FinanceAsset.id)
    )
    if row is not None:
        return row, False
    asset_type = (
        "fiat"
        if normalized == base_currency.upper()
        else "crypto"
        if normalized in _CRYPTO_SYMBOLS
        else "other"
    )
    row = FinanceAsset(
        user_id=user_id,
        asset_type=asset_type,
        symbol=normalized,
        name=normalized,
        decimals=18 if asset_type == "crypto" else 2 if asset_type == "fiat" else None,
        attributes={"created_from_import": True, "classification_status": "candidate"},
    )
    session.add(row)
    await session.flush()
    return row, True


def _fixed_offset(value: str) -> timezone | None:
    if len(value) != 6 or value[0] not in {"+", "-"} or value[3] != ":":
        return None
    try:
        hours, minutes = int(value[1:3]), int(value[4:6])
    except ValueError:
        return None
    if hours > 23 or minutes > 59:
        return None
    offset = timedelta(hours=hours, minutes=minutes)
    return timezone(offset if value[0] == "+" else -offset)


def _tax_clock(record: FinanceRawRecord) -> tuple[datetime, str, str, date]:
    effective_at = record.source_timestamp or datetime.now(UTC)
    timezone_name = record.source_timezone or "UTC"
    fixed = _fixed_offset(timezone_name)
    try:
        local = effective_at.astimezone(fixed or ZoneInfo(timezone_name))
    except ZoneInfoNotFoundError as exc:
        raise FinanceImportError("Imported source timezone is invalid") from exc
    return effective_at, local.isoformat(), timezone_name, local.date()


def _valuation(
    record: FinanceRawRecord,
    payload: dict[str, object],
    *,
    quantity: Decimal,
    reporting_currency: str,
) -> tuple[Decimal | None, Decimal | None, str]:
    original = record.original_payload
    currency = reporting_currency.upper()
    price_keys = (
        f"price_{currency.lower()}",
        "unit_price",
        "price",
    )
    rate = next(
        (parsed for key in price_keys if (parsed := _decimal(original.get(key))) is not None),
        None,
    )
    amount = _decimal(payload.get("amount"))
    if rate is None and amount is not None and quantity != 0:
        rate = abs(amount / quantity)
    value = amount if amount is not None else quantity * rate if rate is not None else None
    return rate, value, currency


async def _existing_projection(
    session: AsyncSession,
    *,
    user_id: str,
    raw_ids: tuple[str, ...],
) -> ImportProjectionResult | None:
    if not raw_ids:
        return ImportProjectionResult((), (), (), (), False)
    revision_rows = (
        await session.execute(
            select(
                FinanceRevisionRawRecord.raw_record_id,
                FinanceEventRevision.id,
                FinanceEventRevision.revision_number,
                FinanceEventRevision.effective_at,
            )
            .join(
                FinanceEventRevision,
                FinanceEventRevision.id == FinanceRevisionRawRecord.event_revision_id,
            )
            .where(
                FinanceEventRevision.user_id == user_id,
                FinanceEventRevision.derivation_type == "import",
                FinanceRevisionRawRecord.raw_record_id.in_(raw_ids),
            )
            .order_by(
                FinanceRevisionRawRecord.raw_record_id,
                FinanceEventRevision.revision_number,
                FinanceEventRevision.id,
            )
        )
    ).all()
    first_by_raw: dict[str, tuple[str, datetime]] = {}
    for raw_id, revision_id, _, effective_at in revision_rows:
        first_by_raw.setdefault(raw_id, (revision_id, effective_at))
    revision_ids = tuple(
        revision_id
        for revision_id, _ in sorted(first_by_raw.values(), key=lambda item: (item[1], item[0]))
    )
    if len(first_by_raw) != len(raw_ids):
        return None
    group_ids = tuple(
        (
            await session.scalars(
                select(FinanceReviewGroupMember.group_id)
                .join(
                    FinanceReviewGroup,
                    FinanceReviewGroup.id == FinanceReviewGroupMember.group_id,
                )
                .where(
                    FinanceReviewGroup.user_id == user_id,
                    FinanceReviewGroupMember.event_revision_id.in_(revision_ids),
                )
                .distinct()
                .order_by(FinanceReviewGroupMember.group_id)
            )
        ).all()
    )
    return ImportProjectionResult(revision_ids, group_ids, (), (), False)


async def _reprocess_targets(
    session: AsyncSession,
    *,
    user_id: str,
    records: tuple[FinanceRawRecord, ...],
) -> dict[str, tuple[FinanceRawRecord, FinanceEventRevision]]:
    prior_by_record = {
        record.id: str(prior_id)
        for record in records
        if (prior_id := (record.extracted_payload or {}).get("prior_raw_record_id"))
    }
    if not prior_by_record:
        return {}
    prior_ids = tuple(set(prior_by_record.values()))
    prior_rows = {
        row.id: row
        for row in (
            await session.scalars(
                select(FinanceRawRecord).where(
                    FinanceRawRecord.user_id == user_id,
                    FinanceRawRecord.id.in_(prior_ids),
                )
            )
        ).all()
    }
    current_rows = (
        await session.execute(
            select(FinanceRevisionRawRecord.raw_record_id, FinanceEventRevision)
            .join(
                FinanceEventRevision,
                FinanceEventRevision.id == FinanceRevisionRawRecord.event_revision_id,
            )
            .join(
                FinanceEvent,
                FinanceEvent.id == FinanceEventRevision.event_id,
            )
            .where(
                FinanceEventRevision.user_id == user_id,
                FinanceEvent.current_revision_id == FinanceEventRevision.id,
                FinanceRevisionRawRecord.raw_record_id.in_(prior_ids),
            )
        )
    ).all()
    revision_by_prior = {raw_id: revision for raw_id, revision in current_rows}
    return {
        record_id: (prior_rows[prior_id], revision_by_prior[prior_id])
        for record_id, prior_id in prior_by_record.items()
        if prior_id in prior_rows and prior_id in revision_by_prior
    }


async def _direct_reprocess_revisions(
    session: AsyncSession,
    *,
    user_id: str,
    records: tuple[FinanceRawRecord, ...],
) -> dict[str, FinanceEventRevision]:
    raw_ids = tuple(record.id for record in records)
    if not raw_ids:
        return {}
    rows = (
        await session.execute(
            select(FinanceRevisionRawRecord.raw_record_id, FinanceEventRevision)
            .join(
                FinanceEventRevision,
                FinanceEventRevision.id == FinanceRevisionRawRecord.event_revision_id,
            )
            .where(
                FinanceEventRevision.user_id == user_id,
                FinanceEventRevision.derivation_type == "import",
                FinanceRevisionRawRecord.raw_record_id.in_(raw_ids),
            )
            .order_by(
                FinanceRevisionRawRecord.raw_record_id,
                FinanceEventRevision.revision_number,
                FinanceEventRevision.id,
            )
        )
    ).all()
    result: dict[str, FinanceEventRevision] = {}
    for raw_id, revision in rows:
        result.setdefault(raw_id, revision)
    return result


async def project_import_records(
    session: AsyncSession,
    *,
    import_row: FinanceImport,
    account: FinanceAccount,
    records: tuple[FinanceRawRecord, ...],
) -> ImportProjectionResult:
    """Create one proposed canonical revision per projectable raw record, exactly once."""
    raw_ids = tuple(record.id for record in records)
    existing = await _existing_projection(
        session,
        user_id=import_row.user_id,
        raw_ids=raw_ids,
    )
    if existing is not None:
        return existing

    created_assets: list[FinanceAsset] = []
    projected: list[tuple[FinanceEventRevision, FinanceEventComponent, Decimal | None]] = []
    result_revisions: list[FinanceEventRevision] = []
    direct_reprocess_revisions = (
        await _direct_reprocess_revisions(
            session,
            user_id=import_row.user_id,
            records=records,
        )
        if import_row.import_mode == "reprocess"
        else {}
    )
    reprocess_targets = (
        await _reprocess_targets(
            session,
            user_id=import_row.user_id,
            records=records,
        )
        if import_row.import_mode == "reprocess"
        else {}
    )
    evidence_id = import_row.evidence_document_id
    base_asset_ready = False
    for record in records:
        if direct_revision := direct_reprocess_revisions.get(record.id):
            result_revisions.append(direct_revision)
            continue
        reprocess_target = reprocess_targets.get(record.id)
        if (
            reprocess_target is not None
            and record.semantic_fingerprint == reprocess_target[0].semantic_fingerprint
        ):
            result_revisions.append(reprocess_target[1])
            continue
        payload = cast(dict[str, object], record.extracted_payload or {})
        effective_at_raw = payload.get("effective_at")
        quantity = _decimal(payload.get("quantity"))
        if quantity is None:
            quantity = _decimal(payload.get("amount"))
        if effective_at_raw is None or quantity is None:
            if import_row.parser_id in {"pdf_metadata", "image_metadata", "archive_manifest"}:
                continue
            raise FinanceImportError(
                "Accepted transaction record is missing its date or amount/quantity"
            )
        if not base_asset_ready:
            base_asset, base_asset_created = await _asset_for_symbol(
                session,
                user_id=import_row.user_id,
                symbol=account.base_currency,
                base_currency=account.base_currency,
            )
            if base_asset_created:
                created_assets.append(base_asset)
            base_asset_ready = True
        symbol = str(payload.get("asset") or account.base_currency).strip().upper()
        asset, asset_created = await _asset_for_symbol(
            session,
            user_id=import_row.user_id,
            symbol=symbol,
            base_currency=account.base_currency,
        )
        if asset_created:
            created_assets.append(asset)
        event_type = _event_type(payload)
        effective_at, source_local_time, timezone_name, tax_date = _tax_clock(record)
        rate, report_value, report_currency = _valuation(
            record,
            payload,
            quantity=quantity,
            reporting_currency=account.base_currency,
        )
        if reprocess_target is None:
            event = FinanceEvent(user_id=import_row.user_id)
            session.add(event)
            await session.flush()
            revision_number = 1
            supersedes_revision_id = None
        else:
            prior_revision = reprocess_target[1]
            target_event = await session.get(FinanceEvent, prior_revision.event_id)
            if target_event is None or target_event.user_id != import_row.user_id:
                raise FinanceImportError("Reprocessing target event is unavailable")
            event = target_event
            revision_number = prior_revision.revision_number + 1
            supersedes_revision_id = prior_revision.id
        revision = FinanceEventRevision(
            user_id=import_row.user_id,
            event_id=event.id,
            revision_number=revision_number,
            event_type=event_type,
            effective_at=effective_at,
            source_local_time=source_local_time,
            source_timezone=timezone_name,
            tax_date=tax_date,
            tax_day_policy=f"{timezone_name}-v1",
            source_account_id=account.id,
            external_id=cast(str | None, payload.get("provider_external_id")),
            semantic_fingerprint=record.semantic_fingerprint or record.record_fingerprint,
            status="proposed",
            derivation_type="import",
            derivation_version=f"{import_row.parser_id}:{import_row.parser_version}",
            created_by_type="system",
            supersedes_revision_id=supersedes_revision_id,
            attributes={
                "description": payload.get("description"),
                "evidence_condition": "present",
                "jurisdiction": account.tax_jurisdiction,
                "source_id": evidence_id,
                "source_asset": symbol,
                "valuation_policy": "source_preserved" if rate is not None else "unvalued",
                "reprocessed_from_raw_record_id": (
                    reprocess_target[0].id if reprocess_target is not None else None
                ),
            },
        )
        session.add(revision)
        await session.flush()
        event.current_revision_id = revision.id
        component = FinanceEventComponent(
            user_id=import_row.user_id,
            event_revision_id=revision.id,
            role=_component_role(event_type),
            account_id=account.id,
            asset_id=asset.id,
            quantity=quantity,
            fiat_value=report_value,
            currency=report_currency if report_value is not None else None,
            attributes={"raw_record_id": record.id},
        )
        session.add_all(
            [
                FinanceRevisionRawRecord(
                    event_revision_id=revision.id,
                    raw_record_id=record.id,
                ),
                component,
                Link(
                    source_type="finance_event_revision",
                    source_id=revision.id,
                    target_type="finance_evidence",
                    target_id=evidence_id,
                    relation="supported_by",
                ),
            ]
        )
        if rate is not None:
            valuation = FinanceValuation(
                user_id=import_row.user_id,
                event_revision_id=revision.id,
                asset_id=asset.id,
                source_currency=symbol,
                target_currency=report_currency,
                rate=rate,
                value=report_value,
                valued_at=effective_at,
                provider=account.provider,
                provider_reference=f"import:{import_row.id}:raw:{record.id}",
                valuation_policy="source_preserved",
                tax_year=tax_date.year,
                jurisdiction=account.tax_jurisdiction,
            )
            session.add(valuation)
            await session.flush()
            session.add(
                FinanceRevisionValuation(
                    event_revision_id=revision.id,
                    valuation_id=valuation.id,
                )
            )
        projected.append((revision, component, rate))
        result_revisions.append(revision)

    grouped: dict[
        tuple[str, str, date, str],
        list[tuple[FinanceEventRevision, FinanceEventComponent, Decimal | None]],
    ] = {}
    for item in projected:
        revision, component, _ = item
        grouped.setdefault(
            (
                revision.event_type,
                component.asset_id,
                revision.tax_date,
                revision.tax_day_policy,
            ),
            [],
        ).append(item)
    group_ids: list[str] = list(
        (
            await session.scalars(
                select(FinanceReviewGroupMember.group_id)
                .where(
                    FinanceReviewGroupMember.event_revision_id.in_(
                        [revision.id for revision in direct_reprocess_revisions.values()]
                    )
                )
                .distinct()
                .order_by(FinanceReviewGroupMember.group_id)
            )
        ).all()
        if direct_reprocess_revisions
        else []
    )
    for (event_type, asset_id, tax_date, tax_day_policy), members in grouped.items():
        revisions = [item[0] for item in members]
        components = [item[1] for item in members]
        native_quantity = sum((component.quantity for component in components), Decimal("0"))
        valued = [component.fiat_value for component in components]
        report_value = (
            sum((cast(Decimal, value) for value in valued), Decimal("0"))
            if all(value is not None for value in valued)
            else None
        )
        group_asset = await session.get(FinanceAsset, asset_id)
        group_symbol = group_asset.symbol if group_asset is not None else None
        warnings: list[dict[str, object]] = []
        if report_value is None:
            warnings.append(
                {
                    "code": "missing_valuation",
                    "severity": "warning",
                    "message": "A reporting-currency valuation is still required",
                }
            )
        if (
            group_asset is not None
            and group_asset.asset_type != "fiat"
            and group_asset.attributes.get("classification_status") == "candidate"
        ):
            warnings.append(
                {
                    "code": "asset_classification_candidate",
                    "severity": "warning",
                    "message": "The imported asset type requires review",
                }
            )
        rates = [item[2] for item in members]
        valuation_policy = (
            "source_preserved"
            if all(rate is not None for rate in rates)
            else "unvalued"
            if all(rate is None for rate in rates)
            else "mixed"
        )
        candidate_treatment = _candidate_treatment(event_type)
        grouping_key = hash_payload(
            {
                "rule": "tax-day-v1",
                "owner_id": import_row.user_id,
                "account_id": account.id,
                "source_id": import_row.id,
                "asset_id": asset_id,
                "event_type": event_type,
                "tax_date": tax_date,
                "tax_day_policy": tax_day_policy,
                "jurisdiction": account.tax_jurisdiction,
                "candidate_treatment": candidate_treatment,
                "valuation_policy": valuation_policy,
                "warning_free": not warnings,
            }
        )
        group = FinanceReviewGroup(
            user_id=import_row.user_id,
            grouping_key=grouping_key,
            grouping_rule_version="tax-day-v1",
            label=(f"{len(revisions)} {event_type.replace('_', ' ')} · {group_symbol or 'asset'}"),
            status="pending",
            account_id=account.id,
            asset_id=asset_id,
            event_type=event_type,
            tax_date=tax_date,
            first_effective_at=min(revision.effective_at for revision in revisions),
            last_effective_at=max(revision.effective_at for revision in revisions),
            native_quantity=native_quantity,
            report_value=report_value,
            report_currency=account.base_currency.upper() if report_value is not None else None,
            materiality=abs(report_value if report_value is not None else native_quantity),
            evidence_coverage=Decimal("1"),
            confidence_explanation=(
                "All members preserve their immutable import row and evidence hash"
            ),
            candidate_treatment=candidate_treatment,
            warnings=warnings,
        )
        session.add(group)
        await session.flush()
        session.add_all(
            FinanceReviewGroupMember(group_id=group.id, event_revision_id=revision.id)
            for revision in revisions
        )
        group_ids.append(group.id)
    await session.flush()
    return ImportProjectionResult(
        event_revision_ids=tuple(revision.id for revision in result_revisions),
        review_group_ids=tuple(group_ids),
        created_assets=tuple(created_assets),
        created_event_revision_ids=tuple(revision.id for revision, _, _ in projected),
        created=bool(projected),
    )
