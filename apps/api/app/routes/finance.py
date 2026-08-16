"""Authenticated, owner-scoped Finance API."""

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Literal, cast

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.dependencies import get_current_user
from app.models import (
    FinanceAccount,
    FinanceAsset,
    FinanceAuditEntry,
    FinanceEvent,
    FinanceEventComponent,
    FinanceEventRevision,
    FinanceEvidenceDocument,
    FinanceImport,
    FinancePosting,
    FinanceRawRecord,
    FinanceReconciliation,
    FinanceReviewGroup,
    FinanceRevisionRawRecord,
    FinanceRevisionValuation,
    FinanceValuation,
    Link,
    User,
)
from app.security import encrypt_finance_value
from app.services.finance_core import (
    FinanceId,
    append_audit_entry,
    decimal_string,
    prior_idempotent_response,
    store_idempotent_response,
)
from app.services.finance_evidence import acquire_finance_advisory_lock
from app.services.finance_ledger import (
    CanonicalEventRevisionPlan,
    ComponentInput,
    balanced_postings_for_components,
    build_canonical_event_revision,
)
from app.services.finance_timeseries import finance_timeseries

router = APIRouter(prefix="/api/finance", tags=["finance"])

IdempotencyKey = Annotated[
    str,
    Header(alias="Idempotency-Key", min_length=1, max_length=255),
]

AccountType = Literal["bank", "broker", "exchange", "wallet", "bot", "cash"]
AssetType = Literal["fiat", "fund", "etf", "stock", "gold", "crypto", "derivative", "other"]
EventType = Literal[
    "income",
    "expense",
    "transfer",
    "trade",
    "staking_reward",
    "interest",
    "dividend",
    "funding_payment",
    "derivative_fill",
    "fee",
    "withholding",
    "corporate_action",
    "valuation_adjustment",
    "other",
]
EventStatus = Literal["proposed", "confirmed", "superseded", "voided"]
WarningSeverity = Literal["info", "warning", "blocking"]
DecimalString = Annotated[str, Field(pattern=r"^-?[0-9]+(\.[0-9]+)?$")]
FinanceIdPath = Annotated[
    str,
    Path(
        pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
        json_schema_extra={"format": "uuid"},
    ),
]


class FinanceWarning(BaseModel):
    code: str
    severity: WarningSeverity
    message: str
    entity_type: str | None
    entity_id: FinanceId | None


class Completeness(BaseModel):
    is_complete: bool
    warnings: list[FinanceWarning]
    blockers: list[FinanceWarning]


class EmptyState(BaseModel):
    code: str
    title: str
    message: str
    next_action: str | None


class PageMeta(BaseModel):
    limit: int
    offset: int
    total: int
    has_more: bool


class AuditMetadata(BaseModel):
    audit_entry_id: FinanceId
    action: str
    entity_type: str
    entity_id: FinanceId
    prior_revision_id: FinanceId | None
    new_revision_id: FinanceId | None
    created_at: datetime


def _page(limit: int, offset: int, total: int) -> PageMeta:
    return PageMeta(
        limit=limit,
        offset=offset,
        total=total,
        has_more=offset + limit < total,
    )


def _audit_response(entry: FinanceAuditEntry) -> AuditMetadata:
    return AuditMetadata(
        audit_entry_id=entry.id,
        action=entry.action,
        entity_type=entry.entity_type,
        entity_id=entry.entity_id,
        prior_revision_id=entry.prior_revision_id,
        new_revision_id=entry.new_revision_id,
        created_at=entry.created_at,
    )


class FinanceAccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    institution: str = Field(min_length=1, max_length=255)
    account_type: AccountType
    country_code: str = Field(min_length=2, max_length=2)
    base_currency: str = Field(min_length=3, max_length=3)
    tax_jurisdiction: str | None = Field(min_length=2, max_length=2)
    provider: str = Field(min_length=1, max_length=50)
    external_reference: str | None = Field(min_length=1, max_length=500)
    opened_at: datetime | None

    @field_validator("country_code", "base_currency", "tax_jurisdiction")
    @classmethod
    def uppercase_codes(cls, value: str | None) -> str | None:
        return value.upper() if value is not None else None


class FinanceAccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: FinanceId
    name: str
    institution: str
    account_type: AccountType
    country_code: str
    base_currency: str
    tax_jurisdiction: str | None
    provider: str
    status: Literal["active", "closed"]
    opened_at: datetime | None
    closed_at: datetime | None
    last_imported_at: datetime | None
    created_at: datetime
    updated_at: datetime


def _account_response(
    row: FinanceAccount,
    last_imported_at: datetime | None,
) -> FinanceAccountResponse:
    values = {
        field: getattr(row, field)
        for field in FinanceAccountResponse.model_fields
        if field != "last_imported_at"
    }
    return FinanceAccountResponse(**values, last_imported_at=last_imported_at)


class AccountMutationResponse(BaseModel):
    account: FinanceAccountResponse
    audit: AuditMetadata


class AccountListResponse(BaseModel):
    items: list[FinanceAccountResponse]
    page: PageMeta
    completeness: Completeness
    empty_state: EmptyState | None


class FinanceAssetCreate(BaseModel):
    asset_type: AssetType
    symbol: str | None = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=255)
    isin: str | None = Field(min_length=12, max_length=12)
    chain_id: str | None = Field(max_length=100)
    contract_address: str | None = Field(max_length=255)
    issuer_country: str | None = Field(min_length=2, max_length=2)
    decimals: int | None = Field(ge=0, le=38)

    @field_validator("symbol", "isin", "issuer_country")
    @classmethod
    def uppercase_identity(cls, value: str | None) -> str | None:
        return value.upper() if value is not None else None


class FinanceAssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: FinanceId
    asset_type: AssetType
    symbol: str | None
    name: str
    isin: str | None
    chain_id: str | None
    contract_address: str | None
    issuer_country: str | None
    decimals: int | None
    created_at: datetime


class AssetMutationResponse(BaseModel):
    asset: FinanceAssetResponse
    audit: AuditMetadata


class AssetListResponse(BaseModel):
    items: list[FinanceAssetResponse]
    page: PageMeta
    completeness: Completeness
    empty_state: EmptyState | None


class SummaryTotals(BaseModel):
    income: DecimalString
    expense: DecimalString
    rewards: DecimalString
    transfers: DecimalString
    net: DecimalString
    net_worth: DecimalString | None


class PreviousYearTotals(BaseModel):
    income: DecimalString
    expense: DecimalString
    rewards: DecimalString
    transfers: DecimalString
    net_worth: DecimalString


class SummaryCounts(BaseModel):
    accounts: int
    assets: int
    raw_records: int
    confirmed_events: int
    pending_review_groups: int
    blocking_reconciliations: int
    missing_evidence: int


class ReportReadiness(BaseModel):
    status: Literal["ready", "ready_with_warnings", "blocked"]
    blocking_count: int
    warning_count: int
    blockers: list[FinanceWarning]
    warnings: list[FinanceWarning]


class FinanceSummaryResponse(BaseModel):
    tax_year: int
    jurisdiction: str | None
    reporting_currency: str
    totals: SummaryTotals
    previous_year: PreviousYearTotals
    counts: SummaryCounts
    readiness: ReportReadiness
    completeness: Completeness
    empty_state: EmptyState | None


class RevisionLineage(BaseModel):
    id: FinanceId
    revision_number: int
    status: EventStatus
    event_type: EventType
    effective_at: datetime
    supersedes_revision_id: FinanceId | None
    raw_record_ids: list[FinanceId]
    evidence_document_ids: list[FinanceId]
    component_ids: list[FinanceId]
    posting_ids: list[FinanceId]
    valuation_ids: list[FinanceId]
    audit_entry_ids: list[FinanceId]


class EventLineageResponse(BaseModel):
    event_id: FinanceId
    current_revision_id: FinanceId | None
    revisions: list[RevisionLineage]


class ManualEventCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    tax_year: int = Field(ge=1900, le=2200)
    occurred_at: datetime
    event_type: EventType
    amount: DecimalString
    currency: str = Field(min_length=3, max_length=3)
    source_account_id: FinanceId
    description: str = Field(min_length=1, max_length=1000)
    jurisdiction: Literal["SE", "ES"]
    asset_id: FinanceId | None = None

    @field_validator("occurred_at")
    @classmethod
    def aware_timestamp(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("occurred_at must include a timezone")
        return value

    @field_validator("currency")
    @classmethod
    def uppercase_currency(cls, value: str) -> str:
        return value.upper()

    @field_validator("amount")
    @classmethod
    def positive_amount(cls, value: str) -> str:
        amount = Decimal(value)
        if not amount.is_finite() or amount <= 0:
            raise ValueError("amount must be a positive decimal string")
        return value


class ManualEventPatch(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    expected_revision_id: FinanceId
    tax_year: int | None = Field(default=None, ge=1900, le=2200)
    occurred_at: datetime | None = None
    event_type: EventType | None = None
    amount: DecimalString | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    source_account_id: FinanceId | None = None
    description: str | None = Field(default=None, min_length=1, max_length=1000)
    jurisdiction: Literal["SE", "ES"] | None = None
    asset_id: FinanceId | None = None

    @field_validator("occurred_at")
    @classmethod
    def aware_optional_timestamp(cls, value: datetime | None) -> datetime | None:
        if value is not None and (value.tzinfo is None or value.utcoffset() is None):
            raise ValueError("occurred_at must include a timezone")
        return value

    @field_validator("currency")
    @classmethod
    def uppercase_optional_currency(cls, value: str | None) -> str | None:
        return value.upper() if value is not None else None

    @field_validator("amount")
    @classmethod
    def positive_optional_amount(cls, value: str | None) -> str | None:
        if value is not None:
            amount = Decimal(value)
            if not amount.is_finite() or amount <= 0:
                raise ValueError("amount must be a positive decimal string")
        return value


class ManualEventResponse(BaseModel):
    id: FinanceId
    current_revision_id: FinanceId
    revision_number: int
    status: EventStatus
    event_type: EventType
    occurred_at: datetime
    tax_year: int
    tax_date: date
    amount: DecimalString
    currency: str
    source_account_id: FinanceId
    asset_id: FinanceId
    description: str
    jurisdiction: Literal["SE", "ES"]


class EventMutationResponse(BaseModel):
    event: ManualEventResponse
    audit: AuditMetadata


class TimeseriesPoint(BaseModel):
    t: date
    v: DecimalString


class TimeseriesSeries(BaseModel):
    key: str
    label: str
    points: list[TimeseriesPoint]


class TimeseriesResponse(BaseModel):
    series: list[TimeseriesSeries]


def _manual_component_role(event_type: str) -> str:
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


def _manual_quantity(event_type: str, amount: Decimal) -> Decimal:
    return -amount if event_type in {"expense", "fee", "withholding"} else amount


async def _owned_manual_inputs(
    session: AsyncSession,
    *,
    user_id: str,
    account_id: str,
    asset_id: str | None,
    currency: str,
) -> tuple[FinanceAccount, FinanceAsset]:
    account = await session.scalar(
        select(FinanceAccount).where(
            FinanceAccount.id == account_id,
            FinanceAccount.user_id == user_id,
        )
    )
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    asset = None
    if asset_id is not None:
        asset = await session.scalar(
            select(FinanceAsset).where(
                FinanceAsset.id == asset_id,
                FinanceAsset.user_id == user_id,
            )
        )
        if asset is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    else:
        asset = await session.scalar(
            select(FinanceAsset)
            .where(
                FinanceAsset.user_id == user_id,
                FinanceAsset.asset_type == "fiat",
                func.upper(FinanceAsset.symbol) == currency,
            )
            .order_by(FinanceAsset.created_at, FinanceAsset.id)
        )
        if asset is None:
            asset = FinanceAsset(
                user_id=user_id,
                asset_type="fiat",
                symbol=currency,
                name=currency,
                decimals=2,
            )
            session.add(asset)
            await session.flush()
    return account, asset


def _persist_manual_plan(
    session: AsyncSession,
    *,
    plan: CanonicalEventRevisionPlan,
    event: FinanceEvent,
    actor_id: str,
) -> None:
    session.add(
        FinanceEventRevision(
            id=plan.revision_id,
            user_id=plan.user_id,
            event_id=plan.event_id,
            revision_number=plan.revision_number,
            event_type=plan.event_type,
            effective_at=plan.effective_at,
            source_local_time=plan.source_local_time,
            source_timezone=plan.source_timezone,
            tax_date=plan.tax_date,
            tax_day_policy=plan.tax_day_policy,
            source_account_id=plan.source_account_id,
            external_id=plan.external_id,
            semantic_fingerprint=plan.semantic_fingerprint,
            status=plan.status,
            derivation_type=plan.derivation_type,
            derivation_version=plan.derivation_version,
            supersedes_revision_id=plan.supersedes_revision_id,
            created_by_type="user",
            created_by_id=actor_id,
            attributes=dict(plan.attributes),
        )
    )
    for component in plan.components:
        session.add(
            FinanceEventComponent(
                user_id=plan.user_id,
                event_revision_id=plan.revision_id,
                role=component.role,
                account_id=component.account_id,
                asset_id=component.asset_id,
                quantity=component.quantity,
                fiat_value=component.fiat_value,
                currency=component.currency,
                attributes=dict(component.attributes),
            )
        )
    for posting in plan.postings:
        session.add(
            FinancePosting(
                user_id=plan.user_id,
                event_revision_id=plan.revision_id,
                account_id=posting.account_id,
                ledger_account=posting.ledger_account,
                asset_id=posting.asset_id,
                quantity=posting.quantity,
                fiat_value=posting.fiat_value,
                currency=posting.currency,
                posting_role=posting.posting_role,
            )
        )
    event.current_revision_id = plan.revision_id


def _manual_event_response(
    *,
    event: FinanceEvent,
    revision: CanonicalEventRevisionPlan,
) -> ManualEventResponse:
    component = revision.components[0]
    return ManualEventResponse(
        id=event.id,
        current_revision_id=revision.revision_id,
        revision_number=revision.revision_number,
        status=cast(EventStatus, revision.status),
        event_type=cast(EventType, revision.event_type),
        occurred_at=revision.effective_at,
        tax_year=revision.tax_date.year,
        tax_date=revision.tax_date,
        amount=str(
            revision.attributes.get("amount", decimal_string(abs(Decimal(component.quantity))))
        ),
        currency=component.currency or "",
        source_account_id=revision.source_account_id,
        asset_id=component.asset_id,
        description=str(revision.attributes.get("description", "")),
        jurisdiction=cast(Literal["SE", "ES"], revision.attributes["jurisdiction"]),
    )


async def _add_manual_valuation(
    session: AsyncSession,
    *,
    user_id: str,
    revision_id: str,
    asset_id: str,
    amount: Decimal,
    currency: str,
    occurred_at: datetime,
    tax_year: int,
    jurisdiction: str,
) -> None:
    valuation = FinanceValuation(
        user_id=user_id,
        event_revision_id=revision_id,
        asset_id=asset_id,
        source_currency=currency,
        target_currency=currency,
        rate=Decimal(1),
        value=amount,
        valued_at=occurred_at.astimezone(UTC),
        provider="manual",
        provider_reference=f"manual:{revision_id}",
        valuation_policy="manual_same_currency",
        tax_year=tax_year,
        jurisdiction=jurisdiction,
    )
    session.add(valuation)
    await session.flush()
    session.add(
        FinanceRevisionValuation(
            event_revision_id=revision_id,
            valuation_id=valuation.id,
        )
    )


def _build_manual_plan(
    *,
    user_id: str,
    event_id: str,
    revision_number: int,
    supersedes_revision_id: str | None,
    occurred_at: datetime,
    event_type: str,
    amount: Decimal,
    currency: str,
    account_id: str,
    asset_id: str,
    description: str,
    jurisdiction: str,
) -> CanonicalEventRevisionPlan:
    component = ComponentInput(
        role=_manual_component_role(event_type),
        account_id=account_id,
        asset_id=asset_id,
        quantity=_manual_quantity(event_type, amount),
        fiat_value=amount,
        currency=currency,
        attributes={"entry_method": "manual"},
    )
    return build_canonical_event_revision(
        user_id=user_id,
        event_id=event_id,
        revision_number=revision_number,
        supersedes_revision_id=supersedes_revision_id,
        event_type=event_type,
        effective_at=occurred_at,
        tax_date=occurred_at.date(),
        tax_day_policy="manual-local-date-v1",
        source_account_id=account_id,
        components=(component,),
        postings=balanced_postings_for_components((component,)),
        status="confirmed",
        derivation_type="manual" if supersedes_revision_id is None else "correction",
        derivation_version="manual-v1",
        source_local_time=occurred_at.isoformat(),
        source_timezone=str(occurred_at.tzinfo),
        attributes={
            "description": description,
            "jurisdiction": jurisdiction,
            "entry_method": "manual",
            "amount": decimal_string(amount),
            "currency": currency,
            "asset_id": asset_id,
        },
        audit_action="event.created" if supersedes_revision_id is None else "event.corrected",
        audit_reason=None if supersedes_revision_id is None else "Manual event edit",
    )


@router.post(
    "/events",
    response_model=EventMutationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_manual_event(
    body: ManualEventCreate,
    idempotency_key: IdempotencyKey,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> EventMutationResponse:
    request = body.model_dump(mode="json")
    await acquire_finance_advisory_lock(
        session, "workflow", user.id, "create_manual_event", idempotency_key
    )
    prior = await prior_idempotent_response(
        session,
        user_id=user.id,
        workflow="create_manual_event",
        key=idempotency_key,
        request=request,
    )
    if prior is not None:
        return EventMutationResponse.model_validate(prior)
    if body.occurred_at.date().year != body.tax_year:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="tax_year must match occurred_at",
        )
    account, asset = await _owned_manual_inputs(
        session,
        user_id=user.id,
        account_id=body.source_account_id,
        asset_id=body.asset_id,
        currency=body.currency,
    )
    event = FinanceEvent(user_id=user.id)
    session.add(event)
    await session.flush()
    amount = Decimal(body.amount)
    plan = _build_manual_plan(
        user_id=user.id,
        event_id=event.id,
        revision_number=1,
        supersedes_revision_id=None,
        occurred_at=body.occurred_at,
        event_type=body.event_type,
        amount=amount,
        currency=body.currency,
        account_id=account.id,
        asset_id=asset.id,
        description=body.description,
        jurisdiction=body.jurisdiction,
    )
    _persist_manual_plan(session, plan=plan, event=event, actor_id=user.id)
    await session.flush()
    await _add_manual_valuation(
        session,
        user_id=user.id,
        revision_id=plan.revision_id,
        asset_id=asset.id,
        amount=amount,
        currency=body.currency,
        occurred_at=body.occurred_at,
        tax_year=body.tax_year,
        jurisdiction=body.jurisdiction,
    )
    audit = await append_audit_entry(
        session,
        user_id=user.id,
        actor_id=user.id,
        action="event.created",
        entity_type="finance_event",
        entity_id=event.id,
        request=request,
        new_revision_id=plan.revision_id,
    )
    response = EventMutationResponse(
        event=_manual_event_response(event=event, revision=plan),
        audit=_audit_response(audit),
    )
    store_idempotent_response(
        session,
        user_id=user.id,
        workflow="create_manual_event",
        key=idempotency_key,
        request=request,
        response=response.model_dump(mode="json"),
        entity_id=event.id,
        audit_entry_id=audit.id,
    )
    await session.commit()
    return response


@router.patch("/events/{event_id}", response_model=EventMutationResponse)
async def patch_manual_event(
    body: ManualEventPatch,
    idempotency_key: IdempotencyKey,
    event_id: FinanceIdPath,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> EventMutationResponse:
    request = {"event_id": event_id, **body.model_dump(mode="json", exclude_unset=True)}
    await acquire_finance_advisory_lock(
        session, "workflow", user.id, "patch_manual_event", idempotency_key
    )
    prior = await prior_idempotent_response(
        session,
        user_id=user.id,
        workflow="patch_manual_event",
        key=idempotency_key,
        request=request,
    )
    if prior is not None:
        return EventMutationResponse.model_validate(prior)
    event = await session.scalar(
        select(FinanceEvent)
        .where(FinanceEvent.id == event_id, FinanceEvent.user_id == user.id)
        .with_for_update()
    )
    if event is None or event.current_revision_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    if event.current_revision_id != body.expected_revision_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "stale_revision",
                "message": "Finance event changed elsewhere",
                "current_revision_id": event.current_revision_id,
            },
        )
    current = await session.scalar(
        select(FinanceEventRevision).where(
            FinanceEventRevision.id == event.current_revision_id,
            FinanceEventRevision.user_id == user.id,
        )
    )
    if current is None or current.derivation_type not in {"manual", "correction"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only manually entered events can be edited directly",
        )
    current_components = list(
        (
            await session.scalars(
                select(FinanceEventComponent).where(
                    FinanceEventComponent.event_revision_id == current.id,
                    FinanceEventComponent.user_id == user.id,
                )
            )
        ).all()
    )
    if len(current_components) != 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complex events must be corrected through the review workflow",
        )
    current_component = current_components[0]
    occurred_at = body.occurred_at
    if occurred_at is None:
        occurred_at = (
            datetime.fromisoformat(current.source_local_time)
            if current.source_local_time
            else current.effective_at.replace(tzinfo=UTC)
        )
    tax_year = body.tax_year or occurred_at.date().year
    if occurred_at.date().year != tax_year:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="tax_year must match occurred_at",
        )
    currency = body.currency or current_component.currency
    if currency is None:
        raise HTTPException(status_code=409, detail="Current event has no reporting currency")
    account_id = body.source_account_id or current.source_account_id
    requested_asset_id = (
        body.asset_id if "asset_id" in body.model_fields_set else current_component.asset_id
    )
    account, asset = await _owned_manual_inputs(
        session,
        user_id=user.id,
        account_id=account_id,
        asset_id=requested_asset_id,
        currency=currency,
    )
    amount = (
        Decimal(body.amount)
        if body.amount is not None
        else Decimal(str(current.attributes.get("amount", abs(current_component.quantity))))
    )
    event_type = body.event_type or cast(EventType, current.event_type)
    description = body.description or str(current.attributes.get("description", "Manual record"))
    jurisdiction = body.jurisdiction or cast(
        Literal["SE", "ES"], current.attributes.get("jurisdiction") or account.tax_jurisdiction
    )
    if jurisdiction not in {"SE", "ES"}:
        raise HTTPException(status_code=422, detail="Event jurisdiction must be SE or ES")
    plan = _build_manual_plan(
        user_id=user.id,
        event_id=event.id,
        revision_number=current.revision_number + 1,
        supersedes_revision_id=current.id,
        occurred_at=occurred_at,
        event_type=event_type,
        amount=amount,
        currency=currency,
        account_id=account.id,
        asset_id=asset.id,
        description=description,
        jurisdiction=jurisdiction,
    )
    _persist_manual_plan(session, plan=plan, event=event, actor_id=user.id)
    await session.flush()
    await _add_manual_valuation(
        session,
        user_id=user.id,
        revision_id=plan.revision_id,
        asset_id=asset.id,
        amount=amount,
        currency=currency,
        occurred_at=occurred_at,
        tax_year=tax_year,
        jurisdiction=jurisdiction,
    )
    audit = await append_audit_entry(
        session,
        user_id=user.id,
        actor_id=user.id,
        action="event.corrected",
        entity_type="finance_event",
        entity_id=event.id,
        request=request,
        reason="Manual event edit",
        prior_revision_id=current.id,
        new_revision_id=plan.revision_id,
    )
    response = EventMutationResponse(
        event=_manual_event_response(event=event, revision=plan),
        audit=_audit_response(audit),
    )
    store_idempotent_response(
        session,
        user_id=user.id,
        workflow="patch_manual_event",
        key=idempotency_key,
        request=request,
        response=response.model_dump(mode="json"),
        entity_id=event.id,
        audit_entry_id=audit.id,
    )
    await session.commit()
    return response


@router.get("/timeseries", response_model=TimeseriesResponse)
async def get_finance_timeseries(
    tax_year: int = Query(ge=1900, le=2200),
    metric: Literal["net_worth", "income", "expense", "rewards", "readiness"] = Query(),
    granularity: Literal["day", "week", "month"] = Query(default="day"),
    group_by: Literal["account", "source", "jurisdiction", "none"] = Query(default="none"),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> TimeseriesResponse:
    series = await finance_timeseries(
        session,
        user_id=user.id,
        tax_year=tax_year,
        metric=metric,
        granularity=granularity,
        group_by=group_by,
        from_date=from_date,
        to_date=to_date,
    )
    return TimeseriesResponse.model_validate({"series": series})


@router.get("/summary", response_model=FinanceSummaryResponse)
async def finance_summary(
    tax_year: int = Query(ge=1900, le=2200),
    jurisdiction: str | None = Query(default=None, min_length=2, max_length=2),
    reporting_currency: str = Query(default="EUR", min_length=3, max_length=3),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> FinanceSummaryResponse:
    year_start = date(tax_year, 1, 1)
    year_end = date(tax_year, 12, 31)
    jurisdiction_code = jurisdiction.upper() if jurisdiction else None
    account_count = int(
        await session.scalar(
            select(func.count(FinanceAccount.id)).where(FinanceAccount.user_id == user.id)
        )
        or 0
    )
    asset_count = int(
        await session.scalar(
            select(func.count(FinanceAsset.id)).where(FinanceAsset.user_id == user.id)
        )
        or 0
    )
    raw_record_count = int(
        await session.scalar(
            select(func.count(FinanceRawRecord.id)).where(FinanceRawRecord.user_id == user.id)
        )
        or 0
    )
    current_confirmed_statement = (
        select(
            FinanceEventRevision.id,
            FinanceEventRevision.event_type,
            FinanceEventRevision.source_account_id,
        )
        .select_from(FinanceEventRevision)
        .join(FinanceEvent, FinanceEvent.current_revision_id == FinanceEventRevision.id)
        .join(FinanceAccount, FinanceAccount.id == FinanceEventRevision.source_account_id)
        .where(
            FinanceEventRevision.user_id == user.id,
            FinanceEvent.user_id == user.id,
            FinanceAccount.user_id == user.id,
            FinanceEventRevision.status == "confirmed",
            FinanceEventRevision.tax_date >= year_start,
            FinanceEventRevision.tax_date <= year_end,
        )
    )
    if jurisdiction_code is not None:
        current_confirmed_statement = current_confirmed_statement.where(
            FinanceAccount.tax_jurisdiction == jurisdiction_code
        )
    current_confirmed = current_confirmed_statement.subquery()
    confirmed_count = int(await session.scalar(select(func.count(current_confirmed.c.id))) or 0)
    pending_review_statement = (
        select(func.count(FinanceReviewGroup.id))
        .join(FinanceAccount, FinanceAccount.id == FinanceReviewGroup.account_id)
        .where(
            FinanceReviewGroup.user_id == user.id,
            FinanceAccount.user_id == user.id,
            FinanceReviewGroup.status.in_(["pending", "deferred"]),
            FinanceReviewGroup.tax_date >= year_start,
            FinanceReviewGroup.tax_date <= year_end,
        )
    )
    if jurisdiction_code is not None:
        pending_review_statement = pending_review_statement.where(
            FinanceAccount.tax_jurisdiction == jurisdiction_code
        )
    pending_review_count = int(await session.scalar(pending_review_statement) or 0)
    blocked_reconciliation_statement = (
        select(func.count(FinanceReconciliation.id))
        .join(FinanceAccount, FinanceAccount.id == FinanceReconciliation.account_id)
        .where(
            FinanceReconciliation.user_id == user.id,
            FinanceAccount.user_id == user.id,
            FinanceReconciliation.status == "blocked",
            FinanceReconciliation.period_start <= year_end,
            FinanceReconciliation.period_end >= year_start,
        )
    )
    if jurisdiction_code is not None:
        blocked_reconciliation_statement = blocked_reconciliation_statement.where(
            FinanceAccount.tax_jurisdiction == jurisdiction_code
        )
    blocked_reconciliation_count = int(await session.scalar(blocked_reconciliation_statement) or 0)

    ranked_valuations = (
        select(
            current_confirmed.c.id.label("event_revision_id"),
            current_confirmed.c.event_type,
            FinanceValuation.value,
            func.row_number()
            .over(
                partition_by=(current_confirmed.c.id, FinanceValuation.asset_id),
                order_by=(FinanceValuation.created_at.desc(), FinanceValuation.id.desc()),
            )
            .label("valuation_rank"),
        )
        .select_from(current_confirmed)
        .join(
            FinanceRevisionValuation,
            FinanceRevisionValuation.event_revision_id == current_confirmed.c.id,
        )
        .join(
            FinanceValuation,
            FinanceValuation.id == FinanceRevisionValuation.valuation_id,
        )
        .where(
            FinanceValuation.user_id == user.id,
            FinanceValuation.target_currency == reporting_currency.upper(),
        )
    ).subquery()

    async def event_total(*event_types: str) -> Decimal:
        value = await session.scalar(
            select(func.coalesce(func.sum(ranked_valuations.c.value), 0)).where(
                ranked_valuations.c.valuation_rank == 1,
                ranked_valuations.c.event_type.in_(event_types),
            )
        )
        return Decimal(str(value or 0))

    income_total = await event_total("income", "interest", "dividend")
    expense_total = await event_total("expense", "fee", "withholding")
    reward_total = await event_total("staking_reward", "funding_payment")
    transfer_total = await event_total("transfer")

    async def previous_year_totals() -> PreviousYearTotals:
        previous_start = date(tax_year - 1, 1, 1)
        previous_end = date(tax_year - 1, 12, 31)
        revisions = (
            select(FinanceEventRevision.id, FinanceEventRevision.event_type)
            .join(FinanceEvent, FinanceEvent.current_revision_id == FinanceEventRevision.id)
            .join(FinanceAccount, FinanceAccount.id == FinanceEventRevision.source_account_id)
            .where(
                FinanceEventRevision.user_id == user.id,
                FinanceEvent.user_id == user.id,
                FinanceAccount.user_id == user.id,
                FinanceEventRevision.status == "confirmed",
                FinanceEventRevision.tax_date >= previous_start,
                FinanceEventRevision.tax_date <= previous_end,
            )
        )
        if jurisdiction_code is not None:
            revisions = revisions.where(FinanceAccount.tax_jurisdiction == jurisdiction_code)
        previous_revisions = revisions.subquery()
        valuations = (
            select(
                previous_revisions.c.id.label("event_revision_id"),
                previous_revisions.c.event_type,
                FinanceValuation.value,
                func.row_number()
                .over(
                    partition_by=(previous_revisions.c.id, FinanceValuation.asset_id),
                    order_by=(FinanceValuation.created_at.desc(), FinanceValuation.id.desc()),
                )
                .label("valuation_rank"),
            )
            .join(
                FinanceRevisionValuation,
                FinanceRevisionValuation.event_revision_id == previous_revisions.c.id,
            )
            .join(FinanceValuation, FinanceValuation.id == FinanceRevisionValuation.valuation_id)
            .where(
                FinanceValuation.user_id == user.id,
                FinanceValuation.target_currency == reporting_currency.upper(),
            )
        ).subquery()

        async def total(*types: str) -> Decimal:
            value = await session.scalar(
                select(func.coalesce(func.sum(valuations.c.value), 0)).where(
                    valuations.c.valuation_rank == 1,
                    valuations.c.event_type.in_(types),
                )
            )
            return Decimal(str(value or 0))

        income = await total("income", "interest", "dividend")
        expense = await total("expense", "fee", "withholding")
        rewards = await total("staking_reward", "funding_payment")
        transfers = await total("transfer")
        return PreviousYearTotals(
            income=decimal_string(income),
            expense=decimal_string(expense),
            rewards=decimal_string(rewards),
            transfers=decimal_string(transfers),
            net_worth=decimal_string(income + rewards - expense),
        )

    explicit_evidence = (
        select(Link.id)
        .select_from(Link)
        .join(FinanceEvidenceDocument, FinanceEvidenceDocument.id == Link.target_id)
        .where(
            Link.source_type == "finance_event_revision",
            Link.source_id == current_confirmed.c.id,
            Link.target_type == "finance_evidence",
            Link.relation == "supported_by",
            FinanceEvidenceDocument.user_id == user.id,
        )
        .exists()
    )
    imported_evidence = (
        select(FinanceImport.evidence_document_id)
        .select_from(FinanceRevisionRawRecord)
        .join(
            FinanceRawRecord,
            FinanceRawRecord.id == FinanceRevisionRawRecord.raw_record_id,
        )
        .join(FinanceImport, FinanceImport.id == FinanceRawRecord.import_id)
        .join(
            FinanceEvidenceDocument,
            FinanceEvidenceDocument.id == FinanceImport.evidence_document_id,
        )
        .where(
            FinanceRevisionRawRecord.event_revision_id == current_confirmed.c.id,
            FinanceRawRecord.user_id == user.id,
            FinanceImport.user_id == user.id,
            FinanceEvidenceDocument.user_id == user.id,
        )
        .exists()
    )
    missing_evidence_count = int(
        await session.scalar(
            select(func.count(current_confirmed.c.id)).where(
                ~explicit_evidence,
                ~imported_evidence,
            )
        )
        or 0
    )
    blockers = (
        [
            FinanceWarning(
                code="reconciliation_blocked",
                severity="blocking",
                message="One or more reconciliations have a material unresolved difference",
                entity_type=None,
                entity_id=None,
            )
        ]
        if blocked_reconciliation_count
        else []
    )
    warnings = []
    if pending_review_count:
        warnings.append(
            FinanceWarning(
                code="pending_review_groups",
                severity="warning",
                message="One or more imported activity groups still require review",
                entity_type=None,
                entity_id=None,
            )
        )
    if missing_evidence_count:
        warnings.append(
            FinanceWarning(
                code="missing_evidence",
                severity="warning",
                message="One or more confirmed events are not linked to source evidence",
                entity_type=None,
                entity_id=None,
            )
        )
    empty_state = (
        EmptyState(
            code="finance_not_started",
            title="Build your financial source of truth",
            message="Add an account, upload a statement, then review the first group.",
            next_action="add_account",
        )
        if account_count == 0
        else None
    )
    completeness = Completeness(
        is_complete=not blockers and not warnings,
        warnings=warnings,
        blockers=blockers,
    )
    return FinanceSummaryResponse(
        tax_year=tax_year,
        jurisdiction=jurisdiction_code,
        reporting_currency=reporting_currency.upper(),
        totals=SummaryTotals(
            income=decimal_string(income_total),
            expense=decimal_string(expense_total),
            rewards=decimal_string(reward_total),
            transfers=decimal_string(transfer_total),
            net=decimal_string(income_total + reward_total - expense_total),
            net_worth=None,
        ),
        previous_year=await previous_year_totals(),
        counts=SummaryCounts(
            accounts=account_count,
            assets=asset_count,
            raw_records=raw_record_count,
            confirmed_events=confirmed_count,
            pending_review_groups=pending_review_count,
            blocking_reconciliations=blocked_reconciliation_count,
            missing_evidence=missing_evidence_count,
        ),
        readiness=ReportReadiness(
            status="blocked" if blockers else "ready_with_warnings" if warnings else "ready",
            blocking_count=len(blockers),
            warning_count=len(warnings),
            blockers=blockers,
            warnings=warnings,
        ),
        completeness=completeness,
        empty_state=empty_state,
    )


@router.get("/accounts", response_model=AccountListResponse)
async def list_accounts(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> AccountListResponse:
    total = int(
        await session.scalar(
            select(func.count(FinanceAccount.id)).where(FinanceAccount.user_id == user.id)
        )
        or 0
    )
    rows = list(
        (
            await session.scalars(
                select(FinanceAccount)
                .where(FinanceAccount.user_id == user.id)
                .order_by(FinanceAccount.created_at, FinanceAccount.id)
                .limit(limit)
                .offset(offset)
            )
        ).all()
    )
    last_imports: dict[str, datetime | None] = {}
    if rows:
        import_result = await session.execute(
            select(
                FinanceImport.account_id,
                func.max(FinanceImport.committed_at),
            )
            .where(
                FinanceImport.user_id == user.id,
                FinanceImport.account_id.in_([row.id for row in rows]),
                FinanceImport.committed_at.is_not(None),
            )
            .group_by(FinanceImport.account_id)
        )
        last_imports = {
            account_id: imported_at for account_id, imported_at in import_result.tuples().all()
        }
    return AccountListResponse(
        items=[_account_response(row, last_imports.get(row.id)) for row in rows],
        page=_page(limit, offset, total),
        completeness=Completeness(is_complete=True, warnings=[], blockers=[]),
        empty_state=(
            EmptyState(
                code="no_finance_accounts",
                title="Add your first account",
                message="Accounts define where imported financial activity belongs.",
                next_action="add_account",
            )
            if total == 0
            else None
        ),
    )


@router.post(
    "/accounts",
    response_model=AccountMutationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_account(
    body: FinanceAccountCreate,
    idempotency_key: IdempotencyKey,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> AccountMutationResponse:
    request = body.model_dump(mode="json")
    prior = await prior_idempotent_response(
        session,
        user_id=user.id,
        workflow="create_account",
        key=idempotency_key,
        request=request,
    )
    if prior is not None:
        return AccountMutationResponse.model_validate(prior)

    encrypted_reference = None
    if body.external_reference:
        try:
            encrypted_reference = encrypt_finance_value(body.external_reference)
        except (RuntimeError, ValueError) as error:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Finance encryption is not configured",
            ) from error

    row = FinanceAccount(
        user_id=user.id,
        name=body.name.strip(),
        institution=body.institution.strip(),
        account_type=body.account_type,
        country_code=body.country_code,
        base_currency=body.base_currency,
        tax_jurisdiction=body.tax_jurisdiction,
        external_reference_encrypted=encrypted_reference,
        provider=body.provider.strip(),
        opened_at=body.opened_at,
    )
    session.add(row)
    await session.flush()
    audit = await append_audit_entry(
        session,
        user_id=user.id,
        actor_id=user.id,
        action="account.created",
        entity_type="finance_account",
        entity_id=row.id,
        request=request,
    )
    response = AccountMutationResponse(
        account=_account_response(row, None),
        audit=_audit_response(audit),
    )
    response_body = response.model_dump(mode="json")
    store_idempotent_response(
        session,
        user_id=user.id,
        workflow="create_account",
        key=idempotency_key,
        request=request,
        response=response_body,
        entity_id=row.id,
        audit_entry_id=audit.id,
    )
    await session.commit()
    return response


@router.get("/assets", response_model=AssetListResponse)
async def list_assets(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> AssetListResponse:
    total = int(
        await session.scalar(
            select(func.count(FinanceAsset.id)).where(FinanceAsset.user_id == user.id)
        )
        or 0
    )
    rows = list(
        (
            await session.scalars(
                select(FinanceAsset)
                .where(FinanceAsset.user_id == user.id)
                .order_by(FinanceAsset.created_at, FinanceAsset.id)
                .limit(limit)
                .offset(offset)
            )
        ).all()
    )
    return AssetListResponse(
        items=[FinanceAssetResponse.model_validate(row) for row in rows],
        page=_page(limit, offset, total),
        completeness=Completeness(is_complete=True, warnings=[], blockers=[]),
        empty_state=(
            EmptyState(
                code="no_finance_assets",
                title="No assets yet",
                message="Assets are created explicitly or from a reviewed import.",
                next_action="add_asset",
            )
            if total == 0
            else None
        ),
    )


@router.post(
    "/assets",
    response_model=AssetMutationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_asset(
    body: FinanceAssetCreate,
    idempotency_key: IdempotencyKey,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> AssetMutationResponse:
    request = body.model_dump(mode="json")
    prior = await prior_idempotent_response(
        session,
        user_id=user.id,
        workflow="create_asset",
        key=idempotency_key,
        request=request,
    )
    if prior is not None:
        return AssetMutationResponse.model_validate(prior)

    row = FinanceAsset(
        user_id=user.id,
        asset_type=body.asset_type,
        symbol=body.symbol,
        name=body.name.strip(),
        isin=body.isin,
        chain_id=body.chain_id,
        contract_address=body.contract_address,
        issuer_country=body.issuer_country,
        decimals=body.decimals,
    )
    session.add(row)
    await session.flush()
    audit = await append_audit_entry(
        session,
        user_id=user.id,
        actor_id=user.id,
        action="asset.created",
        entity_type="finance_asset",
        entity_id=row.id,
        request=request,
    )
    response = AssetMutationResponse(
        asset=FinanceAssetResponse.model_validate(row),
        audit=_audit_response(audit),
    )
    response_body = response.model_dump(mode="json")
    store_idempotent_response(
        session,
        user_id=user.id,
        workflow="create_asset",
        key=idempotency_key,
        request=request,
        response=response_body,
        entity_id=row.id,
        audit_entry_id=audit.id,
    )
    await session.commit()
    return response


@router.get("/events/{event_id}/lineage", response_model=EventLineageResponse)
async def event_lineage(
    event_id: FinanceIdPath,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> EventLineageResponse:
    event = await session.scalar(
        select(FinanceEvent).where(
            FinanceEvent.id == event_id,
            FinanceEvent.user_id == user.id,
        )
    )
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    revisions = list(
        (
            await session.scalars(
                select(FinanceEventRevision)
                .where(
                    FinanceEventRevision.event_id == event.id,
                    FinanceEventRevision.user_id == user.id,
                )
                .order_by(FinanceEventRevision.revision_number)
            )
        ).all()
    )
    lineage: list[RevisionLineage] = []
    for revision in revisions:
        raw_ids = list(
            (
                await session.scalars(
                    select(FinanceRevisionRawRecord.raw_record_id)
                    .join(
                        FinanceRawRecord,
                        FinanceRawRecord.id == FinanceRevisionRawRecord.raw_record_id,
                    )
                    .where(
                        FinanceRevisionRawRecord.event_revision_id == revision.id,
                        FinanceRawRecord.user_id == user.id,
                    )
                )
            ).all()
        )
        component_ids = list(
            (
                await session.scalars(
                    select(FinanceEventComponent.id).where(
                        FinanceEventComponent.event_revision_id == revision.id,
                        FinanceEventComponent.user_id == user.id,
                    )
                )
            ).all()
        )
        posting_ids = list(
            (
                await session.scalars(
                    select(FinancePosting.id).where(
                        FinancePosting.event_revision_id == revision.id,
                        FinancePosting.user_id == user.id,
                    )
                )
            ).all()
        )
        valuation_ids = list(
            (
                await session.scalars(
                    select(FinanceRevisionValuation.valuation_id)
                    .join(
                        FinanceValuation,
                        FinanceValuation.id == FinanceRevisionValuation.valuation_id,
                    )
                    .where(
                        FinanceRevisionValuation.event_revision_id == revision.id,
                        FinanceValuation.user_id == user.id,
                    )
                )
            ).all()
        )
        audit_ids = list(
            (
                await session.scalars(
                    select(FinanceAuditEntry.id).where(
                        FinanceAuditEntry.user_id == user.id,
                        or_(
                            FinanceAuditEntry.prior_revision_id == revision.id,
                            FinanceAuditEntry.new_revision_id == revision.id,
                            and_(
                                FinanceAuditEntry.entity_type == "finance_event_revision",
                                FinanceAuditEntry.entity_id == revision.id,
                            ),
                        ),
                    )
                )
            ).all()
        )
        evidence_ids = list(
            (
                await session.scalars(
                    select(Link.target_id)
                    .join(
                        FinanceEvidenceDocument,
                        FinanceEvidenceDocument.id == Link.target_id,
                    )
                    .where(
                        Link.source_type == "finance_event_revision",
                        Link.source_id == revision.id,
                        Link.target_type == "finance_evidence",
                        Link.relation == "supported_by",
                        FinanceEvidenceDocument.user_id == user.id,
                    )
                )
            ).all()
        )
        imported_evidence_ids = (
            list(
                (
                    await session.scalars(
                        select(FinanceImport.evidence_document_id)
                        .join(
                            FinanceRawRecord,
                            FinanceRawRecord.import_id == FinanceImport.id,
                        )
                        .join(
                            FinanceEvidenceDocument,
                            FinanceEvidenceDocument.id == FinanceImport.evidence_document_id,
                        )
                        .where(
                            FinanceImport.user_id == user.id,
                            FinanceRawRecord.user_id == user.id,
                            FinanceRawRecord.id.in_(raw_ids),
                            FinanceEvidenceDocument.user_id == user.id,
                        )
                        .distinct()
                    )
                ).all()
            )
            if raw_ids
            else []
        )
        evidence_ids = list(dict.fromkeys([*evidence_ids, *imported_evidence_ids]))
        lineage.append(
            RevisionLineage(
                id=revision.id,
                revision_number=revision.revision_number,
                status=cast(EventStatus, revision.status),
                event_type=cast(EventType, revision.event_type),
                effective_at=revision.effective_at,
                supersedes_revision_id=revision.supersedes_revision_id,
                raw_record_ids=sorted(raw_ids),
                evidence_document_ids=sorted(evidence_ids),
                component_ids=sorted(component_ids),
                posting_ids=sorted(posting_ids),
                valuation_ids=sorted(valuation_ids),
                audit_entry_ids=sorted(audit_ids),
            )
        )
    return EventLineageResponse(
        event_id=event.id,
        current_revision_id=event.current_revision_id,
        revisions=lineage,
    )
