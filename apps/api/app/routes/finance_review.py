"""Owner-scoped Finance review and reconciliation workflows."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Literal, cast

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.database import get_async_session
from app.dependencies import get_current_user
from app.models import (
    FinanceAccount,
    FinanceAsset,
    FinanceEvent,
    FinanceEventComponent,
    FinanceEventRevision,
    FinanceEvidenceDocument,
    FinancePosting,
    FinanceRawRecord,
    FinanceReconciliation,
    FinanceReviewGroup,
    FinanceReviewGroupMember,
    FinanceReviewPolicy,
    FinanceRevisionRawRecord,
    FinanceRevisionValuation,
    FinanceTaxProfile,
    FinanceTransferMatch,
    FinanceValuation,
    Link,
    User,
)
from app.routes.finance import (
    AuditMetadata,
    Completeness,
    EmptyState,
    EventStatus,
    EventType,
    FinanceWarning,
    PageMeta,
    _audit_response,
    _page,
)
from app.services.finance_core import (
    FinanceId,
    append_audit_entry,
    decimal_string,
    hash_payload,
    prior_idempotent_response,
    store_idempotent_response,
)
from app.services.finance_investment_projection import project_confirmed_investments
from app.services.finance_ledger import (
    AuditIntent,
    CanonicalEventRevisionPlan,
    ComponentInput,
    FinanceLedgerError,
    PostingInput,
    ReviewGroupPlan,
    ReviewMember,
    ReviewPartition,
    balanced_postings_for_components,
    plan_group_confirmation,
    plan_group_defer,
    plan_group_split,
)
from app.services.finance_reconciliation import (
    TransferCandidate,
    TransferLeg,
    reconcile_balances,
    score_transfer_candidate,
)
from app.services.finance_reports import surface_report_restatement_questions
from app.services.finance_tax import persist_default_candidates_for_confirmed_revision

router = APIRouter(prefix="/api/finance", tags=["finance"])

IdempotencyKey = Annotated[
    str,
    Header(alias="Idempotency-Key", min_length=1, max_length=255),
]
DecimalString = Annotated[str, Field(pattern=r"^-?[0-9]+(\.[0-9]+)?$")]
FinanceIdPath = Annotated[
    str,
    Path(
        pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
        json_schema_extra={"format": "uuid"},
    ),
]
ReviewStatus = Literal["pending", "confirmed", "split", "deferred"]
ReconciliationStatus = Literal["pending", "reconciled", "warning", "blocked"]


class ReviewGroupResponse(BaseModel):
    id: FinanceId
    status: ReviewStatus
    grouping_rule_version: str
    label: str
    account_id: FinanceId
    asset_id: FinanceId
    event_type: EventType
    tax_date: date
    first_effective_at: datetime
    last_effective_at: datetime
    member_revision_ids: list[FinanceId]
    member_count: int
    native_quantity: DecimalString
    report_value: DecimalString | None
    report_currency: str | None
    materiality: DecimalString
    evidence_coverage: DecimalString
    confidence_explanation: str
    candidate_treatment: str | None
    completeness: Completeness


class ReviewGroupListResponse(BaseModel):
    items: list[ReviewGroupResponse]
    page: PageMeta
    completeness: Completeness
    empty_state: EmptyState | None


class GroupedActivityItem(BaseModel):
    representation: Literal["group"]
    id: FinanceId
    review_status: ReviewStatus
    label: str
    event_type: EventType
    account_id: FinanceId
    asset_id: FinanceId
    tax_date: date
    first_effective_at: datetime
    last_effective_at: datetime
    member_count: int
    native_quantity: DecimalString
    report_value: DecimalString | None
    report_currency: str | None
    member_revision_ids: list[FinanceId]
    completeness: Completeness


class RawActivityItem(BaseModel):
    representation: Literal["raw"]
    id: FinanceId
    event_id: FinanceId
    revision_number: int
    status: Literal["proposed", "confirmed", "superseded", "voided"]
    event_type: EventType
    effective_at: datetime
    source_account_id: FinanceId
    native_quantity: DecimalString
    asset_id: FinanceId
    report_value: DecimalString | None
    report_currency: str | None
    raw_record_ids: list[FinanceId]
    evidence_document_ids: list[FinanceId]
    completeness: Completeness


class ActivityListResponse(BaseModel):
    items: list[GroupedActivityItem | RawActivityItem]
    page: PageMeta
    completeness: Completeness
    empty_state: EmptyState | None


class ReviewConfirmRequest(BaseModel):
    expected_member_revision_ids: list[FinanceId] = Field(min_length=1)
    create_reusable_policy: bool
    reason: str = Field(min_length=1, max_length=2000)


class ReusablePolicyPreview(BaseModel):
    will_create: bool
    matching_fields: list[str]
    applies_to_future_only: Literal[True]


class ReviewConfirmationPreview(BaseModel):
    group_id: FinanceId
    member_count: int
    before_status: ReviewStatus
    after_status: Literal["confirmed"]
    posting_count: int
    native_quantity: DecimalString
    report_value: DecimalString | None
    reusable_policy: ReusablePolicyPreview
    invalidated_report_ids: list[FinanceId]
    warnings: list[FinanceWarning]


class ReviewConfirmResponse(BaseModel):
    preview: ReviewConfirmationPreview
    confirmed_revision_ids: list[FinanceId]
    policy_id: FinanceId | None
    audit: AuditMetadata


class ReviewSplitPartitionRequest(BaseModel):
    label: str = Field(min_length=1, max_length=255)
    member_revision_ids: list[FinanceId] = Field(min_length=1)


class ReviewSplitRequest(BaseModel):
    partitions: list[ReviewSplitPartitionRequest] = Field(min_length=2)
    reason: str = Field(min_length=1, max_length=2000)


class ReviewTotals(BaseModel):
    native_quantity: DecimalString
    report_value: DecimalString | None


class ReviewSplitResponse(BaseModel):
    original_group_id: FinanceId
    replacement_groups: list[ReviewGroupResponse]
    before_totals: ReviewTotals
    after_totals: ReviewTotals
    audit: AuditMetadata


class ReviewDeferRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)
    revisit_on: date | None


class ReviewDeferResponse(BaseModel):
    group: ReviewGroupResponse
    audit: AuditMetadata


class ReconciliationResponse(BaseModel):
    id: FinanceId
    account_id: FinanceId
    asset_id: FinanceId | None
    period_start: date
    period_end: date
    opening_balance: DecimalString
    movement_total: DecimalString
    closing_balance: DecimalString
    difference: DecimalString
    tolerance: DecimalString
    status: ReconciliationStatus
    source_revision_ids: list[FinanceId]
    open_question_ids: list[FinanceId]
    explanation: str | None
    run_at: datetime


class ReconciliationListResponse(BaseModel):
    items: list[ReconciliationResponse]
    page: PageMeta
    completeness: Completeness
    empty_state: EmptyState | None


class ReconciliationRunRequest(BaseModel):
    account_id: FinanceId
    asset_id: FinanceId | None
    period_start: date
    period_end: date
    opening_balance: DecimalString
    closing_balance: DecimalString
    tolerance: DecimalString
    source_revision_ids: list[FinanceId]


class ReconciliationRunResponse(BaseModel):
    reconciliation: ReconciliationResponse
    audit: AuditMetadata


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def _warning_models(group: FinanceReviewGroup) -> list[FinanceWarning]:
    warnings: list[FinanceWarning] = []
    for raw in group.warnings:
        severity_raw = raw.get("severity", "warning")
        severity = cast(
            Literal["info", "warning", "blocking"],
            severity_raw if severity_raw in {"info", "warning", "blocking"} else "warning",
        )
        warnings.append(
            FinanceWarning(
                code=str(raw.get("code", "review_warning")),
                severity=severity,
                message=str(raw.get("message", "Review requires attention")),
                entity_type="finance_review_group",
                entity_id=group.id,
            )
        )
    return warnings


async def _member_ids(
    session: AsyncSession, group_id: str, *, for_update: bool = False
) -> list[str]:
    statement = (
        select(FinanceReviewGroupMember.event_revision_id)
        .where(FinanceReviewGroupMember.group_id == group_id)
        .order_by(FinanceReviewGroupMember.event_revision_id)
    )
    if for_update:
        statement = statement.with_for_update()
    return list((await session.scalars(statement)).all())


async def _group_response(session: AsyncSession, group: FinanceReviewGroup) -> ReviewGroupResponse:
    members = await _member_ids(session, group.id)
    warnings = _warning_models(group)
    blockers = [warning for warning in warnings if warning.severity == "blocking"]
    return ReviewGroupResponse(
        id=group.id,
        status=cast(ReviewStatus, group.status),
        grouping_rule_version=group.grouping_rule_version,
        label=group.label,
        account_id=group.account_id,
        asset_id=group.asset_id,
        event_type=cast(EventType, group.event_type),
        tax_date=group.tax_date,
        first_effective_at=group.first_effective_at,
        last_effective_at=group.last_effective_at,
        member_revision_ids=members,
        member_count=len(members),
        native_quantity=decimal_string(group.native_quantity),
        report_value=(None if group.report_value is None else decimal_string(group.report_value)),
        report_currency=group.report_currency,
        materiality=decimal_string(group.materiality),
        evidence_coverage=decimal_string(group.evidence_coverage),
        confidence_explanation=group.confidence_explanation,
        candidate_treatment=group.candidate_treatment,
        completeness=Completeness(
            is_complete=not blockers,
            warnings=[warning for warning in warnings if warning.severity != "blocking"],
            blockers=blockers,
        ),
    )


async def _owned_group(session: AsyncSession, *, group_id: str, user_id: str) -> FinanceReviewGroup:
    group = await session.scalar(
        select(FinanceReviewGroup)
        .where(
            FinanceReviewGroup.id == group_id,
            FinanceReviewGroup.user_id == user_id,
        )
        .with_for_update()
    )
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review group not found")
    return group


async def _revision_plan(
    session: AsyncSession, *, revision: FinanceEventRevision, group: FinanceReviewGroup
) -> CanonicalEventRevisionPlan:
    component_rows = list(
        (
            await session.scalars(
                select(FinanceEventComponent).where(
                    FinanceEventComponent.user_id == revision.user_id,
                    FinanceEventComponent.event_revision_id == revision.id,
                )
            )
        ).all()
    )
    components = tuple(
        ComponentInput(
            role=row.role,
            account_id=row.account_id,
            asset_id=row.asset_id,
            quantity=row.quantity,
            fiat_value=row.fiat_value,
            currency=row.currency,
            attributes=row.attributes,
        )
        for row in component_rows
    )
    posting_rows = list(
        (
            await session.scalars(
                select(FinancePosting).where(
                    FinancePosting.user_id == revision.user_id,
                    FinancePosting.event_revision_id == revision.id,
                )
            )
        ).all()
    )
    postings = tuple(
        PostingInput(
            ledger_account=row.ledger_account,
            account_id=row.account_id,
            asset_id=row.asset_id,
            quantity=row.quantity,
            fiat_value=row.fiat_value,
            currency=row.currency,
            posting_role=row.posting_role,
            event_revision_id=row.event_revision_id,
        )
        for row in posting_rows
    )
    if not postings:
        postings = balanced_postings_for_components(components)
    raw_record_ids = list(
        (
            await session.scalars(
                select(FinanceRevisionRawRecord.raw_record_id)
                .join(
                    FinanceRawRecord,
                    FinanceRawRecord.id == FinanceRevisionRawRecord.raw_record_id,
                )
                .where(
                    FinanceRevisionRawRecord.event_revision_id == revision.id,
                    FinanceRawRecord.user_id == revision.user_id,
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
                    FinanceValuation.user_id == revision.user_id,
                )
                .order_by(FinanceRevisionValuation.valuation_id)
            )
        ).all()
    )
    evidence_document_ids = list(
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
    return CanonicalEventRevisionPlan(
        user_id=revision.user_id,
        event_id=revision.event_id,
        revision_id=revision.id,
        revision_number=revision.revision_number,
        event_type=revision.event_type,
        effective_at=_aware(revision.effective_at),
        tax_date=revision.tax_date,
        tax_day_policy=revision.tax_day_policy,
        source_account_id=revision.source_account_id,
        status=revision.status,
        semantic_fingerprint=revision.semantic_fingerprint,
        derivation_type=revision.derivation_type,
        derivation_version=revision.derivation_version,
        source_local_time=revision.source_local_time,
        source_timezone=revision.source_timezone,
        external_id=revision.external_id,
        supersedes_revision_id=revision.supersedes_revision_id,
        raw_record_ids=tuple(raw_record_ids),
        valuation_ids=tuple(valuation_ids),
        evidence_document_ids=tuple(evidence_document_ids),
        components=components,
        postings=postings,
        attributes=revision.attributes,
        audit=AuditIntent(
            action="event.projected",
            entity_type="finance_event",
            entity_id=revision.event_id,
            request={"revision_id": revision.id},
            new_revision_id=revision.id,
        ),
    )


async def _domain_group(
    session: AsyncSession,
    *,
    group: FinanceReviewGroup,
    ordered_member_ids: list[str] | None = None,
) -> ReviewGroupPlan:
    ids = ordered_member_ids or await _member_ids(session, group.id, for_update=True)
    revisions = list(
        (
            await session.scalars(
                select(FinanceEventRevision)
                .where(
                    FinanceEventRevision.user_id == group.user_id,
                    FinanceEventRevision.id.in_(ids),
                )
                .with_for_update()
            )
        ).all()
    )
    by_id = {revision.id: revision for revision in revisions}
    if set(by_id) != set(ids):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Review group contains unavailable event revisions",
        )
    events = list(
        (
            await session.scalars(
                select(FinanceEvent)
                .where(
                    FinanceEvent.user_id == group.user_id,
                    FinanceEvent.id.in_([revision.event_id for revision in revisions]),
                )
                .with_for_update()
            )
        ).all()
    )
    events_by_id = {event.id: event for event in events}
    stale = any(
        revision.status != "proposed"
        or revision.source_account_id != group.account_id
        or revision.event_type != group.event_type
        or revision.tax_date != group.tax_date
        or revision.event_id not in events_by_id
        or events_by_id[revision.event_id].current_revision_id != revision.id
        for revision in revisions
    )
    if stale:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Review group contains stale or non-current event revisions",
        )
    members: list[ReviewMember] = []
    for revision_id in ids:
        revision = by_id[revision_id]
        plan = await _revision_plan(session, revision=revision, group=group)
        attributes = revision.attributes
        evidence_condition = "present" if plan.evidence_document_ids else "missing"
        members.append(
            ReviewMember(
                revision_id=revision.id,
                account_id=group.account_id,
                source_id=str(attributes.get("source_id", revision.derivation_type)),
                asset_id=group.asset_id,
                event_type=group.event_type,
                tax_date=group.tax_date,
                tax_day_policy=revision.tax_day_policy,
                jurisdiction=str(attributes.get("jurisdiction", "")),
                candidate_treatment=group.candidate_treatment,
                valuation_policy=str(attributes.get("valuation_policy", "unvalued")),
                evidence_condition=evidence_condition,
                effective_at=_aware(revision.effective_at),
                native_quantity=next(
                    (
                        component.quantity
                        for component in plan.components
                        if component.asset_id == group.asset_id
                    ),
                    "0",
                ),
                report_value=next(
                    (
                        component.fiat_value
                        for component in plan.components
                        if component.asset_id == group.asset_id
                    ),
                    None,
                ),
                report_currency=group.report_currency,
                warning_codes=tuple(
                    str(item.get("code", "review_warning")) for item in group.warnings
                ),
                observed_at=_aware(revision.created_at),
                revision=plan,
            )
        )
    return ReviewGroupPlan(
        group_id=group.id,
        grouping_key=group.grouping_key,
        compatibility_key=group.grouping_key,
        grouping_rule_version=group.grouping_rule_version,
        label=group.label,
        status=cast(ReviewStatus, group.status),
        members=tuple(members),
        native_quantity=group.native_quantity,
        report_value=group.report_value,
        report_currency=group.report_currency,
        minimum_rate=None,
        maximum_rate=None,
        weighted_average_rate=None,
        evidence_coverage=group.evidence_coverage,
        materiality=group.materiality,
        warnings=tuple(str(item.get("code", "review_warning")) for item in group.warnings),
    )


def _persist_revision(
    session: AsyncSession, *, plan: CanonicalEventRevisionPlan, actor_id: str
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
    for raw_record_id in plan.raw_record_ids:
        session.add(
            FinanceRevisionRawRecord(
                event_revision_id=plan.revision_id,
                raw_record_id=raw_record_id,
            )
        )
    for valuation_id in plan.valuation_ids:
        session.add(
            FinanceRevisionValuation(
                event_revision_id=plan.revision_id,
                valuation_id=valuation_id,
            )
        )
    for evidence_document_id in plan.evidence_document_ids:
        session.add(
            Link(
                source_type="finance_event_revision",
                source_id=plan.revision_id,
                target_type="finance_evidence",
                target_id=evidence_document_id,
                relation="supported_by",
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


def _transfer_evidence_value(
    attributes: dict[str, object], *keys: str, fallback: str | None = None
) -> str | None:
    for key in keys:
        value = attributes.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return fallback


async def _transfer_legs_for_revision(
    session: AsyncSession,
    *,
    revision: FinanceEventRevision,
    owner_account_ids: set[str],
) -> tuple[TransferLeg, ...]:
    posting_rows = list(
        (
            await session.scalars(
                select(FinancePosting).where(
                    FinancePosting.user_id == revision.user_id,
                    FinancePosting.event_revision_id == revision.id,
                    FinancePosting.account_id == revision.source_account_id,
                )
            )
        ).all()
    )
    quantities: dict[str, Decimal] = {}
    for posting in posting_rows:
        quantities[posting.asset_id] = quantities.get(posting.asset_id, Decimal(0)) + Decimal(
            posting.quantity
        )
    raw_rows = list(
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
    attributes: dict[str, object] = {}
    for raw in raw_rows:
        attributes.update(raw.original_payload)
        attributes.update(raw.extracted_payload or {})
        if raw.provider_external_id:
            attributes.setdefault("provider_reference", raw.provider_external_id)
    attributes.update(revision.attributes)
    return tuple(
        TransferLeg(
            revision_id=revision.id,
            account_id=revision.source_account_id,
            asset_id=asset_id,
            quantity=quantity,
            effective_at=_aware(revision.effective_at),
            owner_controlled=revision.source_account_id in owner_account_ids,
            transaction_hash=_transfer_evidence_value(
                attributes,
                "transaction_hash",
                "tx_hash",
            ),
            provider_reference=_transfer_evidence_value(
                attributes,
                "provider_reference",
                "provider_id",
                fallback=revision.external_id,
            ),
            network=_transfer_evidence_value(attributes, "network", "chain", "chain_id"),
            address=_transfer_evidence_value(
                attributes,
                "address",
                "wallet_address",
                "destination_address",
                "deposit_address",
            ),
        )
        for asset_id, quantity in sorted(quantities.items())
        if quantity != 0
    )


async def _persist_transfer_matches(
    session: AsyncSession,
    *,
    user_id: str,
    actor_id: str,
    confirmed_revision_ids: set[str],
) -> None:
    if not confirmed_revision_ids:
        return
    confirmed_transfers = list(
        (
            await session.scalars(
                select(FinanceEventRevision)
                .join(FinanceEvent, FinanceEvent.current_revision_id == FinanceEventRevision.id)
                .join(
                    FinanceAccount,
                    FinanceAccount.id == FinanceEventRevision.source_account_id,
                )
                .where(
                    FinanceEventRevision.id.in_(confirmed_revision_ids),
                    FinanceEventRevision.user_id == user_id,
                    FinanceEvent.user_id == user_id,
                    FinanceAccount.user_id == user_id,
                    FinanceEventRevision.status == "confirmed",
                    FinanceEventRevision.event_type == "transfer",
                )
            )
        ).all()
    )
    if not confirmed_transfers:
        return
    window_start = min(revision.effective_at for revision in confirmed_transfers) - timedelta(
        hours=72
    )
    window_end = max(revision.effective_at for revision in confirmed_transfers) + timedelta(
        hours=72
    )
    candidate_revisions = list(
        (
            await session.scalars(
                select(FinanceEventRevision)
                .join(FinanceEvent, FinanceEvent.current_revision_id == FinanceEventRevision.id)
                .join(
                    FinanceAccount,
                    FinanceAccount.id == FinanceEventRevision.source_account_id,
                )
                .where(
                    FinanceEventRevision.user_id == user_id,
                    FinanceEvent.user_id == user_id,
                    FinanceAccount.user_id == user_id,
                    FinanceEventRevision.status == "confirmed",
                    FinanceEventRevision.event_type == "transfer",
                    FinanceEventRevision.effective_at >= window_start,
                    FinanceEventRevision.effective_at <= window_end,
                )
                .order_by(FinanceEventRevision.effective_at, FinanceEventRevision.id)
            )
        ).all()
    )
    account_ids = set(
        (
            await session.scalars(
                select(FinanceAccount.id).where(FinanceAccount.user_id == user_id)
            )
        ).all()
    )
    leg_rows: list[TransferLeg] = []
    for revision in candidate_revisions:
        leg_rows.extend(
            await _transfer_legs_for_revision(
                session,
                revision=revision,
                owner_account_ids=account_ids,
            )
        )
    legs: tuple[TransferLeg, ...] = tuple(leg_rows)
    candidates: dict[tuple[str, str], TransferCandidate] = {}
    for left_index, left in enumerate(legs):
        for right in legs[left_index + 1 :]:
            if (
                left.revision_id not in confirmed_revision_ids
                and right.revision_id not in confirmed_revision_ids
            ):
                continue
            if (
                left.asset_id != right.asset_id
                or left.account_id == right.account_id
                or (Decimal(left.quantity) < 0) == (Decimal(right.quantity) < 0)
            ):
                continue
            outgoing, incoming = (left, right) if Decimal(left.quantity) < 0 else (right, left)
            candidate = score_transfer_candidate(outgoing, incoming)
            if not candidate.conserves_quantity:
                continue
            candidates[(candidate.outgoing_revision_id, candidate.incoming_revision_id)] = candidate
    if not candidates:
        return

    candidate_revision_ids = {revision_id for pair in candidates for revision_id in pair}
    existing_matches = list(
        (
            await session.scalars(
                select(FinanceTransferMatch)
                .where(
                    FinanceTransferMatch.user_id == user_id,
                    or_(
                        FinanceTransferMatch.outgoing_revision_id.in_(candidate_revision_ids),
                        FinanceTransferMatch.incoming_revision_id.in_(candidate_revision_ids),
                    ),
                )
                .with_for_update()
            )
        ).all()
    )
    existing_pairs = {
        (match.outgoing_revision_id, match.incoming_revision_id) for match in existing_matches
    }
    confirmed_legs = {
        revision_id
        for match in existing_matches
        if match.status == "confirmed"
        for revision_id in (match.outgoing_revision_id, match.incoming_revision_id)
    }
    ordered_candidates = sorted(
        candidates.values(),
        key=lambda candidate: (
            -candidate.score,
            candidate.outgoing_revision_id,
            candidate.incoming_revision_id,
        ),
    )
    for candidate in ordered_candidates:
        pair = (candidate.outgoing_revision_id, candidate.incoming_revision_id)
        if pair in existing_pairs:
            continue
        exact_reference = bool(
            candidate.explanation.get("exact_transaction_hash")
            or candidate.explanation.get("exact_provider_reference")
        )
        match_is_confirmed = (
            candidate.suggested
            and exact_reference
            and candidate.outgoing_revision_id not in confirmed_legs
            and candidate.incoming_revision_id not in confirmed_legs
        )
        match_status = "confirmed" if match_is_confirmed else "proposed"
        explanation = {
            **candidate.explanation,
            "conserves_quantity": candidate.conserves_quantity,
            "suggested": candidate.suggested,
            "matching_rule_version": "transfer-v1",
            "status_basis": (
                "confirmed_revisions_with_exact_source_reference"
                if match_is_confirmed
                else "candidate_requires_review"
            ),
        }
        row = FinanceTransferMatch(
            user_id=user_id,
            outgoing_revision_id=candidate.outgoing_revision_id,
            incoming_revision_id=candidate.incoming_revision_id,
            score=candidate.score,
            fee_quantity=candidate.fee_quantity or Decimal(0),
            status=match_status,
            explanation=explanation,
        )
        session.add(row)
        await session.flush()
        await append_audit_entry(
            session,
            user_id=user_id,
            actor_id=actor_id,
            action=f"transfer_match.{match_status}",
            entity_type="finance_transfer_match",
            entity_id=row.id,
            request={
                "outgoing_revision_id": candidate.outgoing_revision_id,
                "incoming_revision_id": candidate.incoming_revision_id,
                "score": decimal_string(candidate.score),
                "fee_quantity": decimal_string(candidate.fee_quantity or Decimal(0)),
                "status": match_status,
                "matching_rule_version": "transfer-v1",
            },
            reason="Deterministic match of explicitly confirmed transfer revisions",
            prior_revision_id=candidate.outgoing_revision_id,
            new_revision_id=candidate.incoming_revision_id,
        )
        existing_pairs.add(pair)
        if match_is_confirmed:
            confirmed_legs.update(pair)


@router.get("/activity", response_model=ActivityListResponse)
async def finance_activity(
    view: Literal["grouped", "raw"] = "grouped",
    from_date: datetime | None = Query(default=None, alias="from"),
    to_date: datetime | None = Query(default=None, alias="to"),
    account_id: str | None = None,
    asset_id: str | None = None,
    event_type: EventType | None = None,
    event_status: Literal["proposed", "confirmed", "superseded", "voided"] | None = Query(
        default=None, alias="status"
    ),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ActivityListResponse:
    items: list[GroupedActivityItem | RawActivityItem] = []
    if view == "grouped":
        criteria = [FinanceReviewGroup.user_id == user.id]
        if from_date is not None:
            criteria.append(FinanceReviewGroup.last_effective_at >= from_date)
        if to_date is not None:
            criteria.append(FinanceReviewGroup.first_effective_at <= to_date)
        if account_id is not None:
            criteria.append(FinanceReviewGroup.account_id == account_id)
        if asset_id is not None:
            criteria.append(FinanceReviewGroup.asset_id == asset_id)
        if event_type is not None:
            criteria.append(FinanceReviewGroup.event_type == event_type)
        if event_status is not None:
            current_group_revision = aliased(FinanceEventRevision)
            criteria.append(
                select(1)
                .select_from(FinanceReviewGroupMember)
                .join(
                    FinanceEventRevision,
                    FinanceEventRevision.id == FinanceReviewGroupMember.event_revision_id,
                )
                .join(FinanceEvent, FinanceEvent.id == FinanceEventRevision.event_id)
                .join(
                    current_group_revision,
                    current_group_revision.id == FinanceEvent.current_revision_id,
                )
                .where(
                    FinanceReviewGroupMember.group_id == FinanceReviewGroup.id,
                    FinanceEventRevision.user_id == user.id,
                    FinanceEvent.user_id == user.id,
                    current_group_revision.user_id == user.id,
                    current_group_revision.status == event_status,
                )
                .exists()
            )
        total = int(
            await session.scalar(select(func.count(FinanceReviewGroup.id)).where(*criteria)) or 0
        )
        groups = list(
            (
                await session.scalars(
                    select(FinanceReviewGroup)
                    .where(*criteria)
                    .order_by(FinanceReviewGroup.last_effective_at.desc(), FinanceReviewGroup.id)
                    .limit(limit)
                    .offset(offset)
                )
            ).all()
        )
        for group in groups:
            response = await _group_response(session, group)
            items.append(
                GroupedActivityItem(
                    representation="group",
                    id=response.id,
                    review_status=response.status,
                    label=response.label,
                    event_type=response.event_type,
                    account_id=response.account_id,
                    asset_id=response.asset_id,
                    tax_date=response.tax_date,
                    first_effective_at=response.first_effective_at,
                    last_effective_at=response.last_effective_at,
                    member_count=response.member_count,
                    native_quantity=response.native_quantity,
                    report_value=response.report_value,
                    report_currency=response.report_currency,
                    member_revision_ids=response.member_revision_ids,
                    completeness=response.completeness,
                )
            )
    else:
        current_revision = FinanceEvent.current_revision_id == FinanceEventRevision.id
        raw_criteria = [
            FinanceEventRevision.user_id == user.id,
            FinanceEvent.user_id == user.id,
            current_revision,
        ]
        if from_date is not None:
            raw_criteria.append(FinanceEventRevision.effective_at >= from_date)
        if to_date is not None:
            raw_criteria.append(FinanceEventRevision.effective_at <= to_date)
        if account_id is not None:
            raw_criteria.append(FinanceEventRevision.source_account_id == account_id)
        if event_type is not None:
            raw_criteria.append(FinanceEventRevision.event_type == event_type)
        if event_status is not None:
            raw_criteria.append(FinanceEventRevision.status == event_status)
        if asset_id is not None:
            raw_criteria.append(
                exists().where(
                    FinanceEventComponent.event_revision_id == FinanceEventRevision.id,
                    FinanceEventComponent.user_id == user.id,
                    FinanceEventComponent.asset_id == asset_id,
                )
            )
        total = int(
            await session.scalar(
                select(func.count(FinanceEventRevision.id))
                .select_from(FinanceEventRevision)
                .join(FinanceEvent, current_revision)
                .where(*raw_criteria)
            )
            or 0
        )
        revisions = list(
            (
                await session.scalars(
                    select(FinanceEventRevision)
                    .join(FinanceEvent, current_revision)
                    .where(*raw_criteria)
                    .order_by(FinanceEventRevision.effective_at.desc(), FinanceEventRevision.id)
                    .limit(limit)
                    .offset(offset)
                )
            ).all()
        )
        for revision in revisions:
            components = list(
                (
                    await session.scalars(
                        select(FinanceEventComponent)
                        .where(
                            FinanceEventComponent.user_id == user.id,
                            FinanceEventComponent.event_revision_id == revision.id,
                        )
                        .order_by(FinanceEventComponent.id)
                    )
                ).all()
            )
            primary = components[0] if components else None
            valuation = await session.scalar(
                select(FinanceValuation)
                .join(
                    FinanceRevisionValuation,
                    FinanceRevisionValuation.valuation_id == FinanceValuation.id,
                )
                .where(
                    FinanceRevisionValuation.event_revision_id == revision.id,
                    FinanceValuation.user_id == user.id,
                    *(
                        [FinanceValuation.asset_id == primary.asset_id]
                        if primary is not None
                        else []
                    ),
                )
                .order_by(FinanceValuation.created_at.desc(), FinanceValuation.id)
            )
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
                        .order_by(Link.target_id)
                    )
                ).all()
            )
            warnings: list[FinanceWarning] = []
            if primary is None:
                warnings.append(
                    FinanceWarning(
                        code="missing_component",
                        severity="blocking",
                        message="Event revision has no economic component",
                        entity_type="finance_event_revision",
                        entity_id=revision.id,
                    )
                )
            elif len({component.asset_id for component in components}) > 1:
                warnings.append(
                    FinanceWarning(
                        code="multi_asset_projection",
                        severity="warning",
                        message=(
                            "Activity row shows the primary component; lineage keeps all assets"
                        ),
                        entity_type="finance_event_revision",
                        entity_id=revision.id,
                    )
                )
            blockers = [warning for warning in warnings if warning.severity == "blocking"]
            items.append(
                RawActivityItem(
                    representation="raw",
                    id=revision.id,
                    event_id=revision.event_id,
                    revision_number=revision.revision_number,
                    status=cast(EventStatus, revision.status),
                    event_type=cast(EventType, revision.event_type),
                    effective_at=revision.effective_at,
                    source_account_id=revision.source_account_id,
                    native_quantity=(
                        decimal_string(primary.quantity) if primary is not None else "0"
                    ),
                    asset_id=primary.asset_id if primary is not None else "",
                    report_value=(
                        None
                        if valuation is None or valuation.value is None
                        else decimal_string(valuation.value)
                    ),
                    report_currency=(valuation.target_currency if valuation is not None else None),
                    raw_record_ids=raw_ids,
                    evidence_document_ids=evidence_ids,
                    completeness=Completeness(
                        is_complete=not blockers,
                        warnings=[
                            warning for warning in warnings if warning.severity != "blocking"
                        ],
                        blockers=blockers,
                    ),
                )
            )
    blockers = [blocker for item in items for blocker in item.completeness.blockers]
    warnings = [warning for item in items for warning in item.completeness.warnings]
    return ActivityListResponse(
        items=items,
        page=_page(limit, offset, total),
        completeness=Completeness(
            is_complete=not blockers,
            warnings=warnings,
            blockers=blockers,
        ),
        empty_state=(
            EmptyState(
                code="no_finance_activity",
                title="No activity yet",
                message="Committed event revisions appear here.",
                next_action="upload_evidence",
            )
            if total == 0
            else None
        ),
    )


@router.get("/review-groups", response_model=ReviewGroupListResponse)
async def list_review_groups(
    review_status: ReviewStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ReviewGroupListResponse:
    filters = [FinanceReviewGroup.user_id == user.id]
    if review_status is not None:
        filters.append(FinanceReviewGroup.status == review_status)
    total = int(
        await session.scalar(select(func.count(FinanceReviewGroup.id)).where(*filters)) or 0
    )
    groups = list(
        (
            await session.scalars(
                select(FinanceReviewGroup)
                .where(*filters)
                .order_by(FinanceReviewGroup.tax_date.desc(), FinanceReviewGroup.id)
                .limit(limit)
                .offset(offset)
            )
        ).all()
    )
    return ReviewGroupListResponse(
        items=[await _group_response(session, group) for group in groups],
        page=_page(limit, offset, total),
        completeness=Completeness(is_complete=True, warnings=[], blockers=[]),
        empty_state=(
            EmptyState(
                code="no_review_groups",
                title="Nothing to review",
                message="Committed event proposals appear here when a decision is needed.",
                next_action="upload_evidence",
            )
            if total == 0
            else None
        ),
    )


@router.post(
    "/review-groups/{group_id}/confirm",
    response_model=ReviewConfirmResponse,
)
async def confirm_review_group(
    group_id: FinanceIdPath,
    body: ReviewConfirmRequest,
    idempotency_key: IdempotencyKey,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ReviewConfirmResponse:
    request_data = body.model_dump(mode="json")
    prior = await prior_idempotent_response(
        session,
        user_id=user.id,
        workflow=f"review_group.confirm:{group_id}",
        key=idempotency_key,
        request=request_data,
    )
    if prior is not None:
        return ReviewConfirmResponse.model_validate(prior)
    group = await _owned_group(session, group_id=group_id, user_id=user.id)
    stored_ids = await _member_ids(session, group.id, for_update=True)
    if len(body.expected_member_revision_ids) != len(set(body.expected_member_revision_ids)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Duplicate member IDs")
    if set(stored_ids) != set(body.expected_member_revision_ids):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Review group is stale")
    domain_group = await _domain_group(
        session,
        group=group,
        ordered_member_ids=body.expected_member_revision_ids,
    )
    confirmed_at = datetime.now(UTC)
    try:
        plan = plan_group_confirmation(
            domain_group,
            expected_member_revision_ids=body.expected_member_revision_ids,
            create_reusable_policy=body.create_reusable_policy,
            reason=body.reason,
            confirmed_at=confirmed_at,
        )
    except FinanceLedgerError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    for revision in plan.confirmed_revisions:
        _persist_revision(session, plan=revision, actor_id=user.id)
        event = await session.scalar(
            select(FinanceEvent)
            .where(
                FinanceEvent.id == revision.event_id,
                FinanceEvent.user_id == user.id,
            )
            .with_for_update()
        )
        if event is None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Event is unavailable")
        event.current_revision_id = revision.revision_id
        await append_audit_entry(
            session,
            user_id=user.id,
            actor_id=user.id,
            action=revision.audit.action,
            entity_type=revision.audit.entity_type,
            entity_id=revision.audit.entity_id,
            request=revision.audit.request,
            reason=revision.audit.reason,
            prior_revision_id=revision.audit.prior_revision_id,
            new_revision_id=revision.audit.new_revision_id,
        )
        await persist_default_candidates_for_confirmed_revision(
            session,
            user_id=user.id,
            actor_id=user.id,
            event_revision_id=revision.revision_id,
        )
        await surface_report_restatement_questions(
            session,
            user_id=user.id,
            actor_id=user.id,
            input_type="event_revision",
            superseded_input_ids=(
                (revision.supersedes_revision_id,)
                if revision.supersedes_revision_id is not None
                else ()
            ),
            successor_input_id=revision.revision_id,
            reason=body.reason,
        )
    confirmed_revision_ids = tuple(revision.revision_id for revision in plan.confirmed_revisions)
    await session.flush()
    await project_confirmed_investments(
        session,
        user_id=user.id,
        revision_ids=confirmed_revision_ids,
        actor_id=user.id,
    )
    await _persist_transfer_matches(
        session,
        user_id=user.id,
        actor_id=user.id,
        confirmed_revision_ids=set(confirmed_revision_ids),
    )
    group.status = "confirmed"
    group.confirmed_at = confirmed_at
    policy_id: str | None = None
    if plan.policy_criteria is not None:
        stable_criteria = {
            key: value
            for key, value in plan.policy_criteria.items()
            if key not in {"applies_after", "applies_to_future_only"}
        }
        policy_key = hash_payload(stable_criteria)
        latest_policy = await session.scalar(
            select(FinanceReviewPolicy)
            .where(
                FinanceReviewPolicy.user_id == user.id,
                FinanceReviewPolicy.policy_key == policy_key,
            )
            .order_by(FinanceReviewPolicy.version.desc())
            .limit(1)
            .with_for_update()
        )
        policy = FinanceReviewPolicy(
            user_id=user.id,
            policy_key=policy_key,
            version=1 if latest_policy is None else latest_policy.version + 1,
            status="active",
            criteria=dict(plan.policy_criteria),
            decision={"revision_status": "confirmed"},
            source_group_id=group.id,
        )
        session.add(policy)
        await session.flush()
        policy_id = policy.id
    group_audit_intent = plan.audit_intents[-1]
    group_audit = await append_audit_entry(
        session,
        user_id=user.id,
        actor_id=user.id,
        action=group_audit_intent.action,
        entity_type=group_audit_intent.entity_type,
        entity_id=group_audit_intent.entity_id,
        request=group_audit_intent.request,
        reason=group_audit_intent.reason,
    )
    await session.flush()
    warnings = _warning_models(group)
    response = ReviewConfirmResponse(
        preview=ReviewConfirmationPreview(
            group_id=group.id,
            member_count=len(plan.confirmed_revisions),
            before_status="pending",
            after_status="confirmed",
            posting_count=sum(len(revision.postings) for revision in plan.confirmed_revisions),
            native_quantity=decimal_string(group.native_quantity),
            report_value=(
                None if group.report_value is None else decimal_string(group.report_value)
            ),
            reusable_policy=ReusablePolicyPreview(
                will_create=policy_id is not None,
                matching_fields=(
                    [
                        "account_id",
                        "source_id",
                        "asset_id",
                        "event_type",
                        "jurisdiction",
                        "candidate_treatment",
                        "valuation_policy",
                        "evidence_condition",
                        "warning_free",
                    ]
                    if policy_id is not None
                    else []
                ),
                applies_to_future_only=True,
            ),
            invalidated_report_ids=[],
            warnings=warnings,
        ),
        confirmed_revision_ids=[revision.revision_id for revision in plan.confirmed_revisions],
        policy_id=policy_id,
        audit=_audit_response(group_audit),
    )
    response_body = response.model_dump(mode="json")
    store_idempotent_response(
        session,
        user_id=user.id,
        workflow=f"review_group.confirm:{group_id}",
        key=idempotency_key,
        request=request_data,
        response=response_body,
        entity_id=group.id,
        audit_entry_id=group_audit.id,
    )
    await session.commit()
    return response


@router.post("/review-groups/{group_id}/split", response_model=ReviewSplitResponse)
async def split_review_group(
    group_id: FinanceIdPath,
    body: ReviewSplitRequest,
    idempotency_key: IdempotencyKey,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ReviewSplitResponse:
    request_data = body.model_dump(mode="json")
    workflow = f"review_group.split:{group_id}"
    prior = await prior_idempotent_response(
        session,
        user_id=user.id,
        workflow=workflow,
        key=idempotency_key,
        request=request_data,
    )
    if prior is not None:
        return ReviewSplitResponse.model_validate(prior)
    group = await _owned_group(session, group_id=group_id, user_id=user.id)
    domain_group = await _domain_group(session, group=group)
    try:
        plan = plan_group_split(
            domain_group,
            partitions=tuple(
                ReviewPartition(item.label, tuple(item.member_revision_ids))
                for item in body.partitions
            ),
            reason=body.reason,
        )
    except FinanceLedgerError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    group.status = "split"
    new_rows: list[FinanceReviewGroup] = []
    for replacement in plan.replacement_groups:
        row = FinanceReviewGroup(
            id=replacement.group_id,
            user_id=user.id,
            supersedes_group_id=group.id,
            grouping_key=replacement.grouping_key,
            grouping_rule_version=replacement.grouping_rule_version,
            label=replacement.label,
            status="pending",
            account_id=group.account_id,
            asset_id=group.asset_id,
            event_type=group.event_type,
            tax_date=group.tax_date,
            first_effective_at=min(member.effective_at for member in replacement.members),
            last_effective_at=max(member.effective_at for member in replacement.members),
            native_quantity=replacement.native_quantity,
            report_value=replacement.report_value,
            report_currency=replacement.report_currency,
            materiality=replacement.materiality,
            evidence_coverage=replacement.evidence_coverage,
            confidence_explanation=group.confidence_explanation,
            candidate_treatment=group.candidate_treatment,
            warnings=group.warnings,
        )
        session.add(row)
        new_rows.append(row)
        for member in replacement.members:
            session.add(
                FinanceReviewGroupMember(
                    group_id=row.id,
                    event_revision_id=member.revision_id,
                )
            )
    audit = await append_audit_entry(
        session,
        user_id=user.id,
        actor_id=user.id,
        action=plan.audit.action,
        entity_type=plan.audit.entity_type,
        entity_id=plan.audit.entity_id,
        request=plan.audit.request,
        reason=plan.audit.reason,
    )
    await session.flush()
    response = ReviewSplitResponse(
        original_group_id=group.id,
        replacement_groups=[await _group_response(session, row) for row in new_rows],
        before_totals=ReviewTotals(
            native_quantity=decimal_string(plan.before_native_quantity),
            report_value=(
                None
                if plan.before_report_value is None
                else decimal_string(plan.before_report_value)
            ),
        ),
        after_totals=ReviewTotals(
            native_quantity=decimal_string(plan.after_native_quantity),
            report_value=(
                None if plan.after_report_value is None else decimal_string(plan.after_report_value)
            ),
        ),
        audit=_audit_response(audit),
    )
    response_body = response.model_dump(mode="json")
    store_idempotent_response(
        session,
        user_id=user.id,
        workflow=workflow,
        key=idempotency_key,
        request=request_data,
        response=response_body,
        entity_id=group.id,
        audit_entry_id=audit.id,
    )
    await session.commit()
    return response


@router.post("/review-groups/{group_id}/defer", response_model=ReviewDeferResponse)
async def defer_review_group(
    group_id: FinanceIdPath,
    body: ReviewDeferRequest,
    idempotency_key: IdempotencyKey,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ReviewDeferResponse:
    request_data = body.model_dump(mode="json")
    workflow = f"review_group.defer:{group_id}"
    prior = await prior_idempotent_response(
        session,
        user_id=user.id,
        workflow=workflow,
        key=idempotency_key,
        request=request_data,
    )
    if prior is not None:
        return ReviewDeferResponse.model_validate(prior)
    group = await _owned_group(session, group_id=group_id, user_id=user.id)
    domain_group = await _domain_group(session, group=group)
    try:
        plan = plan_group_defer(
            domain_group,
            reason=body.reason,
            revisit_on=body.revisit_on,
        )
    except FinanceLedgerError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    group.status = "deferred"
    group.deferred_until = plan.revisit_on
    audit = await append_audit_entry(
        session,
        user_id=user.id,
        actor_id=user.id,
        action=plan.audit.action,
        entity_type=plan.audit.entity_type,
        entity_id=plan.audit.entity_id,
        request=plan.audit.request,
        reason=plan.audit.reason,
    )
    await session.flush()
    response = ReviewDeferResponse(
        group=await _group_response(session, group),
        audit=_audit_response(audit),
    )
    response_body = response.model_dump(mode="json")
    store_idempotent_response(
        session,
        user_id=user.id,
        workflow=workflow,
        key=idempotency_key,
        request=request_data,
        response=response_body,
        entity_id=group.id,
        audit_entry_id=audit.id,
    )
    await session.commit()
    return response


def _reconciliation_response(row: FinanceReconciliation) -> ReconciliationResponse:
    return ReconciliationResponse(
        id=row.id,
        account_id=row.account_id,
        asset_id=row.asset_id,
        period_start=row.period_start,
        period_end=row.period_end,
        opening_balance=decimal_string(row.opening_balance),
        movement_total=decimal_string(row.movement_total),
        closing_balance=decimal_string(row.closing_balance),
        difference=decimal_string(row.difference),
        tolerance=decimal_string(row.tolerance),
        status=cast(ReconciliationStatus, row.status),
        source_revision_ids=row.source_revision_ids,
        open_question_ids=row.open_question_ids,
        explanation=row.explanation,
        run_at=row.run_at,
    )


@router.get("/reconciliations", response_model=ReconciliationListResponse)
async def list_reconciliations(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ReconciliationListResponse:
    total = int(
        await session.scalar(
            select(func.count(FinanceReconciliation.id)).where(
                FinanceReconciliation.user_id == user.id
            )
        )
        or 0
    )
    rows = list(
        (
            await session.scalars(
                select(FinanceReconciliation)
                .where(FinanceReconciliation.user_id == user.id)
                .order_by(FinanceReconciliation.run_at.desc(), FinanceReconciliation.id)
                .limit(limit)
                .offset(offset)
            )
        ).all()
    )
    blocked_ids = list(
        (
            await session.scalars(
                select(FinanceReconciliation.id).where(
                    FinanceReconciliation.user_id == user.id,
                    FinanceReconciliation.status == "blocked",
                )
            )
        ).all()
    )
    blockers = [
        FinanceWarning(
            code="material_reconciliation_difference",
            severity="blocking",
            message="A reconciliation has a material unresolved difference",
            entity_type="finance_reconciliation",
            entity_id=reconciliation_id,
        )
        for reconciliation_id in blocked_ids
    ]
    return ReconciliationListResponse(
        items=[_reconciliation_response(row) for row in rows],
        page=_page(limit, offset, total),
        completeness=Completeness(
            is_complete=not blockers,
            warnings=[],
            blockers=blockers,
        ),
        empty_state=(
            EmptyState(
                code="no_reconciliations",
                title="No reconciliations yet",
                message="Run a period reconciliation after importing an account statement.",
                next_action="run_reconciliation",
            )
            if total == 0
            else None
        ),
    )


@router.post("/reconciliations/run", response_model=ReconciliationRunResponse)
async def run_reconciliation(
    body: ReconciliationRunRequest,
    idempotency_key: IdempotencyKey,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ReconciliationRunResponse:
    request_data = body.model_dump(mode="json")
    prior = await prior_idempotent_response(
        session,
        user_id=user.id,
        workflow="reconciliation.run",
        key=idempotency_key,
        request=request_data,
    )
    if prior is not None:
        return ReconciliationRunResponse.model_validate(prior)
    if body.period_end < body.period_start:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid period")
    account = await session.scalar(
        select(FinanceAccount).where(
            FinanceAccount.id == body.account_id,
            FinanceAccount.user_id == user.id,
        )
    )
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    if body.asset_id is not None:
        asset = await session.scalar(
            select(FinanceAsset).where(
                FinanceAsset.id == body.asset_id,
                FinanceAsset.user_id == user.id,
            )
        )
        if asset is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    if len(body.source_revision_ids) != len(set(body.source_revision_ids)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Duplicate revision IDs")
    revisions = list(
        (
            await session.scalars(
                select(FinanceEventRevision)
                .where(
                    FinanceEventRevision.user_id == user.id,
                    FinanceEventRevision.id.in_(body.source_revision_ids),
                )
                .with_for_update()
            )
        ).all()
    )
    if len(revisions) != len(body.source_revision_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Revision not found")
    if any(revision.source_account_id != body.account_id for revision in revisions):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Revision does not belong to the reconciliation account",
        )
    events = list(
        (
            await session.scalars(
                select(FinanceEvent)
                .where(
                    FinanceEvent.user_id == user.id,
                    FinanceEvent.id.in_([revision.event_id for revision in revisions]),
                )
                .with_for_update()
            )
        ).all()
    )
    events_by_id = {event.id: event for event in events}
    if any(
        revision.status != "confirmed"
        or revision.event_id not in events_by_id
        or events_by_id[revision.event_id].current_revision_id != revision.id
        for revision in revisions
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Reconciliation requires current confirmed event revisions",
        )
    if any(
        revision.tax_date < body.period_start or revision.tax_date > body.period_end
        for revision in revisions
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Revision falls outside the reconciliation period",
        )

    posting_filters = (
        FinancePosting.user_id == user.id,
        FinancePosting.account_id == body.account_id,
        FinancePosting.event_revision_id.in_(body.source_revision_ids),
    )
    posting_rows = list(
        (await session.scalars(select(FinancePosting).where(*posting_filters))).all()
    )
    expected_revision_ids = set(body.source_revision_ids)
    if {posting.event_revision_id for posting in posting_rows} != expected_revision_ids:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Every source revision must have an account movement posting",
        )
    if body.asset_id is not None:
        selected_postings = [
            posting for posting in posting_rows if posting.asset_id == body.asset_id
        ]
        if {posting.event_revision_id for posting in selected_postings} != expected_revision_ids:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Every source revision must post the reconciled asset",
            )
        movements = [posting.quantity for posting in selected_postings]
    else:
        base_currency = account.base_currency.upper()
        if any(
            posting.fiat_value is None or posting.currency != base_currency
            for posting in posting_rows
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Account-currency reconciliation requires valued postings in {base_currency}"
                ),
            )
        movements = [
            posting.fiat_value for posting in posting_rows if posting.fiat_value is not None
        ]

    profile = None
    if account.tax_jurisdiction is not None and body.period_start.year == body.period_end.year:
        profile = await session.scalar(
            select(FinanceTaxProfile).where(
                FinanceTaxProfile.user_id == user.id,
                FinanceTaxProfile.tax_year == body.period_end.year,
                FinanceTaxProfile.jurisdiction == account.tax_jurisdiction,
                FinanceTaxProfile.status == "active",
            )
        )
    requested_tolerance = Decimal(body.tolerance)
    materiality = (
        requested_tolerance
        if profile is None
        else max(requested_tolerance, profile.materiality_threshold)
    )
    try:
        plan = reconcile_balances(
            account_id=body.account_id,
            asset_id=body.asset_id,
            opening_balance=body.opening_balance,
            movements=movements,
            closing_balance=body.closing_balance,
            tolerance=body.tolerance,
            materiality=materiality,
            source_revision_ids=body.source_revision_ids,
            require_source_revisions=True,
        )
    except FinanceLedgerError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    row = FinanceReconciliation(
        id=plan.reconciliation_id,
        user_id=user.id,
        account_id=body.account_id,
        asset_id=body.asset_id,
        period_start=body.period_start,
        period_end=body.period_end,
        opening_balance=plan.opening_balance,
        movement_total=plan.movement_total,
        closing_balance=plan.closing_balance,
        difference=plan.difference,
        tolerance=plan.tolerance,
        status=plan.status,
        source_revision_ids=list(plan.source_revision_ids),
        open_question_ids=[],
        explanation=("; ".join(issue.message for issue in plan.issues) or None),
    )
    session.add(row)
    audit = await append_audit_entry(
        session,
        user_id=user.id,
        actor_id=user.id,
        action=plan.audit.action,
        entity_type=plan.audit.entity_type,
        entity_id=plan.audit.entity_id,
        request=plan.audit.request,
    )
    await session.flush()
    response = ReconciliationRunResponse(
        reconciliation=_reconciliation_response(row),
        audit=_audit_response(audit),
    )
    response_body = response.model_dump(mode="json")
    store_idempotent_response(
        session,
        user_id=user.id,
        workflow="reconciliation.run",
        key=idempotency_key,
        request=request_data,
        response=response_body,
        entity_id=row.id,
        audit_entry_id=audit.id,
    )
    await session.commit()
    return response
