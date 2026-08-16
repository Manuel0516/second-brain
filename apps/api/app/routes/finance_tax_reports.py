"""Owner-scoped Finance tax facts, treatment confirmation, and frozen reports."""

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Literal, cast
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import storage
from app.database import get_async_session
from app.dependencies import get_current_user
from app.models import (
    File,
    FinanceAuditEntry,
    FinanceEvent,
    FinanceEventRevision,
    FinanceEvidenceDocument,
    FinanceOpenQuestion,
    FinanceReconciliation,
    FinanceReportInput,
    FinanceReportItem,
    FinanceReportRun,
    FinanceResidencyFact,
    FinanceRevisionValuation,
    FinanceTaxProfile,
    FinanceTaxTreatment,
    FinanceTaxTreatmentRevision,
    FinanceValuation,
    Link,
    User,
)
from app.services.finance_core import (
    FinanceId,
    append_audit_entry,
    hash_payload,
    prior_idempotent_response,
    store_idempotent_response,
)
from app.services.finance_reports import (
    EventRevisionSelection,
    EvidenceManifestEntry,
    OpenQuestionManifestEntry,
    ReportIssue,
    ReportItem,
    ResidencyFactManifestEntry,
    create_frozen_report,
    export_report,
    select_current_event_revisions,
    surface_report_restatement_questions,
)
from app.services.finance_tax import persist_candidate_treatment

router = APIRouter(prefix="/api/finance", tags=["finance-tax-reports"])
IdempotencyKey = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=255)]
DecimalString = Annotated[str, Field(pattern=r"^-?[0-9]+(\.[0-9]+)?$")]
FinanceIdPath = Annotated[
    str,
    Path(
        pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
        json_schema_extra={"format": "uuid"},
    ),
]


class AuditResponse(BaseModel):
    audit_entry_id: FinanceId
    action: str
    entity_type: str
    entity_id: FinanceId
    prior_revision_id: FinanceId | None
    new_revision_id: FinanceId | None
    created_at: datetime


def _audit(row: FinanceAuditEntry) -> AuditResponse:
    return AuditResponse(
        audit_entry_id=row.id,
        action=row.action,
        entity_type=row.entity_type,
        entity_id=row.entity_id,
        prior_revision_id=row.prior_revision_id,
        new_revision_id=row.new_revision_id,
        created_at=row.created_at,
    )


class PageMeta(BaseModel):
    limit: int
    offset: int
    total: int
    has_more: bool


def _page(limit: int, offset: int, total: int) -> PageMeta:
    return PageMeta(limit=limit, offset=offset, total=total, has_more=offset + limit < total)


class FinanceWarning(BaseModel):
    code: str
    severity: Literal["info", "warning", "blocking"]
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


def _list_completeness(
    *,
    warnings: list[FinanceWarning] | None = None,
    blockers: list[FinanceWarning] | None = None,
) -> Completeness:
    warnings = warnings or []
    blockers = blockers or []
    return Completeness(
        is_complete=not warnings and not blockers, warnings=warnings, blockers=blockers
    )


def _empty_state(total: int, *, code: str, title: str, message: str) -> EmptyState | None:
    if total:
        return None
    return EmptyState(code=code, title=title, message=message, next_action=None)


def _decimal_input(value: object, field: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a decimal string")
    try:
        number = Decimal(value)
    except Exception as exc:
        raise ValueError(f"{field} must be a decimal string") from exc
    if not number.is_finite() or "e" in value.lower() or number < 0:
        raise ValueError(f"{field} must be a non-negative finite decimal string")
    return value


def _reject_float_json(value: object, path: str = "value") -> object:
    if isinstance(value, float):
        raise ValueError(f"{path} must not contain binary floating point")
    if isinstance(value, dict):
        for key, item in value.items():
            _reject_float_json(item, f"{path}.{key}")
    elif isinstance(value, list):
        for item in value:
            _reject_float_json(item, f"{path}[]")
    return value


class TaxProfileCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tax_year: int = Field(ge=1900, le=2200)
    jurisdiction: Literal["SE", "ES"]
    reporting_currency: str = Field(min_length=3, max_length=3)
    materiality_threshold: DecimalString
    reconciliation_tolerance: DecimalString
    status: Literal["draft", "active", "closed"]

    @field_validator("reporting_currency")
    @classmethod
    def currency_upper(cls, value: str) -> str:
        if not value.isalpha():
            raise ValueError("reporting_currency must contain letters only")
        return value.upper()

    @field_validator("materiality_threshold", "reconciliation_tolerance", mode="before")
    @classmethod
    def decimal_strings(cls, value: object, info: object) -> str:
        field_name = getattr(info, "field_name", "decimal value")
        return _decimal_input(value, field_name)


class TaxProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: FinanceId
    tax_year: int
    jurisdiction: Literal["SE", "ES"]
    reporting_currency: str
    materiality_threshold: DecimalString
    reconciliation_tolerance: DecimalString
    status: Literal["draft", "active", "closed"]
    created_at: datetime
    updated_at: datetime

    @field_validator("materiality_threshold", "reconciliation_tolerance", mode="before")
    @classmethod
    def decimal_wire(cls, value: object) -> str:
        return format(Decimal(str(value)), "f")


class ProfileMutationResponse(BaseModel):
    profile: TaxProfileResponse
    audit: AuditResponse


class TaxProfileListResponse(BaseModel):
    items: list[TaxProfileResponse]
    page: PageMeta
    completeness: Completeness
    empty_state: EmptyState | None


@router.get("/tax-profiles", response_model=TaxProfileListResponse)
async def list_tax_profiles(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> TaxProfileListResponse:
    where = FinanceTaxProfile.user_id == user.id
    total = int(
        await session.scalar(select(func.count()).select_from(FinanceTaxProfile).where(where)) or 0
    )
    rows = list(
        (
            await session.scalars(
                select(FinanceTaxProfile)
                .where(where)
                .order_by(FinanceTaxProfile.tax_year, FinanceTaxProfile.jurisdiction)
                .limit(limit)
                .offset(offset)
            )
        ).all()
    )
    return TaxProfileListResponse(
        items=[TaxProfileResponse.model_validate(row) for row in rows],
        page=_page(limit, offset, total),
        completeness=_list_completeness(),
        empty_state=_empty_state(
            total,
            code="no_tax_profiles",
            title="No tax profiles",
            message="Create a Sweden or Spain tax-year profile to begin.",
        ),
    )


@router.post("/tax-profiles", response_model=ProfileMutationResponse, status_code=201)
async def create_tax_profile(
    body: TaxProfileCreate,
    idempotency_key: IdempotencyKey,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ProfileMutationResponse:
    request = body.model_dump(mode="json")
    prior = await prior_idempotent_response(
        session,
        user_id=user.id,
        workflow="create_tax_profile",
        key=idempotency_key,
        request=request,
    )
    if prior is not None:
        return ProfileMutationResponse.model_validate(prior)
    existing = await session.scalar(
        select(FinanceTaxProfile.id).where(
            FinanceTaxProfile.user_id == user.id,
            FinanceTaxProfile.tax_year == body.tax_year,
            FinanceTaxProfile.jurisdiction == body.jurisdiction,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Tax profile already exists")
    row = FinanceTaxProfile(
        user_id=user.id,
        tax_year=body.tax_year,
        jurisdiction=body.jurisdiction,
        reporting_currency=body.reporting_currency,
        materiality_threshold=Decimal(body.materiality_threshold),
        reconciliation_tolerance=Decimal(body.reconciliation_tolerance),
        status=body.status,
        valuation_policy={
            "policy_id": f"{body.jurisdiction.lower()}-{body.tax_year}-default-v1",
            "reporting_currency": body.reporting_currency,
        },
    )
    session.add(row)
    await session.flush()
    if row.status in {"draft", "active"}:
        year_start = date(row.tax_year, 1, 1)
        year_end = date(row.tax_year, 12, 31)
        confirmed_revision_ids = list(
            (
                await session.scalars(
                    select(FinanceEventRevision.id)
                    .join(
                        FinanceEvent,
                        FinanceEvent.current_revision_id == FinanceEventRevision.id,
                    )
                    .where(
                        FinanceEvent.user_id == user.id,
                        FinanceEventRevision.user_id == user.id,
                        FinanceEventRevision.status == "confirmed",
                        FinanceEventRevision.tax_date >= year_start,
                        FinanceEventRevision.tax_date <= year_end,
                    )
                    .order_by(FinanceEventRevision.id)
                )
            ).all()
        )
        for confirmed_revision_id in confirmed_revision_ids:
            await persist_candidate_treatment(
                session,
                user_id=user.id,
                actor_id=user.id,
                event_revision_id=confirmed_revision_id,
                tax_profile_id=row.id,
                reason="Backfill tax candidate for a newly created profile",
            )
    audit = await append_audit_entry(
        session,
        user_id=user.id,
        actor_id=user.id,
        action="tax_profile.created",
        entity_type="finance_tax_profile",
        entity_id=row.id,
        request=request,
    )
    response = ProfileMutationResponse(
        profile=TaxProfileResponse.model_validate(row), audit=_audit(audit)
    )
    store_idempotent_response(
        session,
        user_id=user.id,
        workflow="create_tax_profile",
        key=idempotency_key,
        request=request,
        response=response.model_dump(mode="json"),
        entity_id=row.id,
        audit_entry_id=audit.id,
    )
    await session.commit()
    return response


class ResidencyFactCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fact_type: str = Field(min_length=1, max_length=100)
    period_start: date | None
    period_end: date | None
    value: dict[str, object]
    evidence_document_ids: list[FinanceId]
    source: str = Field(min_length=1, max_length=100)
    notes: str | None

    @field_validator("period_end")
    @classmethod
    def period_order(cls, value: date | None, info: object) -> date | None:
        del info
        return value

    @field_validator("fact_type")
    @classmethod
    def factual_type_only(cls, value: str) -> str:
        allowed = {
            "physical_presence",
            "registered_address",
            "housing_availability",
            "work_period",
            "study_period",
            "family_tie",
            "economic_tie",
            "tax_residence_certificate",
            "jurisdiction_claim",
            "treaty_review_fact",
            "conflicting_claim",
        }
        if value not in allowed:
            raise ValueError("fact_type must record evidence, not a residence conclusion")
        return value

    @field_validator("value")
    @classmethod
    def factual_json(cls, value: dict[str, object]) -> dict[str, object]:
        return cast(dict[str, object], _reject_float_json(value))

    @field_validator("evidence_document_ids")
    @classmethod
    def evidence_ids_are_uuids(cls, values: list[str]) -> list[str]:
        try:
            normalized = [str(UUID(value)) for value in values]
        except (TypeError, ValueError) as exc:
            raise ValueError("evidence_document_ids must contain UUIDs") from exc
        if len(normalized) != len(set(normalized)):
            raise ValueError("evidence_document_ids must not contain duplicates")
        return normalized


class ResidencyFactResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: FinanceId
    tax_profile_id: FinanceId
    fact_type: str
    period_start: date | None
    period_end: date | None
    value: dict[str, object]
    evidence_document_ids: list[FinanceId]
    source: str
    status: Literal["observed", "adviser_confirmed", "disputed"]
    notes: str | None
    created_at: datetime


class ResidencyMutationResponse(BaseModel):
    fact: ResidencyFactResponse
    determination_status: Literal["requires_human_confirmation"]
    audit: AuditResponse


class ResidencyListResponse(BaseModel):
    items: list[ResidencyFactResponse]
    page: PageMeta
    completeness: Completeness
    empty_state: EmptyState | None
    determination_status: Literal["requires_human_confirmation"]


async def _owned_profile(session: AsyncSession, user_id: str, profile_id: str) -> FinanceTaxProfile:
    row = await session.scalar(
        select(FinanceTaxProfile).where(
            FinanceTaxProfile.id == profile_id, FinanceTaxProfile.user_id == user_id
        )
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Tax profile not found")
    return row


@router.get("/tax-profiles/{profile_id}/residency-facts", response_model=ResidencyListResponse)
async def list_residency_facts(
    profile_id: FinanceIdPath,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ResidencyListResponse:
    await _owned_profile(session, user.id, profile_id)
    where = (FinanceResidencyFact.user_id == user.id) & (
        FinanceResidencyFact.tax_profile_id == profile_id
    )
    total = int(
        await session.scalar(select(func.count()).select_from(FinanceResidencyFact).where(where))
        or 0
    )
    rows = list(
        (
            await session.scalars(
                select(FinanceResidencyFact)
                .where(where)
                .order_by(FinanceResidencyFact.created_at, FinanceResidencyFact.id)
                .limit(limit)
                .offset(offset)
            )
        ).all()
    )
    return ResidencyListResponse(
        items=[ResidencyFactResponse.model_validate(row) for row in rows],
        page=_page(limit, offset, total),
        completeness=_list_completeness(),
        empty_state=_empty_state(
            total,
            code="no_residency_facts",
            title="No residency facts",
            message="Record factual presence and supporting evidence for this tax year.",
        ),
        determination_status="requires_human_confirmation",
    )


@router.post(
    "/tax-profiles/{profile_id}/residency-facts",
    response_model=ResidencyMutationResponse,
    status_code=201,
)
async def create_residency_fact(
    profile_id: FinanceIdPath,
    body: ResidencyFactCreate,
    idempotency_key: IdempotencyKey,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ResidencyMutationResponse:
    await _owned_profile(session, user.id, profile_id)
    if (body.period_start is None) != (body.period_end is None) or (
        body.period_start and body.period_end and body.period_end < body.period_start
    ):
        raise HTTPException(status_code=400, detail="Residency fact period is invalid")
    request = {"tax_profile_id": profile_id, **body.model_dump(mode="json")}
    prior = await prior_idempotent_response(
        session,
        user_id=user.id,
        workflow="create_residency_fact",
        key=idempotency_key,
        request=request,
    )
    if prior is not None:
        return ResidencyMutationResponse.model_validate(prior)
    if body.evidence_document_ids:
        owned_evidence_ids = set(
            (
                await session.scalars(
                    select(FinanceEvidenceDocument.id).where(
                        FinanceEvidenceDocument.user_id == user.id,
                        FinanceEvidenceDocument.id.in_(body.evidence_document_ids),
                    )
                )
            ).all()
        )
        if owned_evidence_ids != set(body.evidence_document_ids):
            raise HTTPException(status_code=404, detail="Evidence document not found")
    row = FinanceResidencyFact(
        user_id=user.id, tax_profile_id=profile_id, status="observed", **body.model_dump()
    )
    session.add(row)
    await session.flush()
    for evidence_id in body.evidence_document_ids:
        session.add(
            Link(
                source_type="finance_residency_fact",
                source_id=row.id,
                target_type="finance_evidence",
                target_id=evidence_id,
                relation="supported_by",
            )
        )
    audit = await append_audit_entry(
        session,
        user_id=user.id,
        actor_id=user.id,
        action="residency_fact.recorded",
        entity_type="finance_residency_fact",
        entity_id=row.id,
        request=request,
    )
    response = ResidencyMutationResponse(
        fact=ResidencyFactResponse.model_validate(row),
        determination_status="requires_human_confirmation",
        audit=_audit(audit),
    )
    store_idempotent_response(
        session,
        user_id=user.id,
        workflow="create_residency_fact",
        key=idempotency_key,
        request=request,
        response=response.model_dump(mode="json"),
        entity_id=row.id,
        audit_entry_id=audit.id,
    )
    await session.commit()
    return response


class TreatmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: FinanceId
    treatment_id: FinanceId
    revision_number: int
    event_revision_id: FinanceId
    tax_profile_id: FinanceId
    jurisdiction: Literal["SE", "ES"]
    tax_year: int
    ruleset_id: str
    ruleset_version: str
    category: str
    status: Literal["candidate", "confirmed", "rejected", "superseded"]
    inputs: dict[str, object]
    output: dict[str, object]
    rationale: str
    source_citations: list[dict[str, object]]
    missing_facts: list[str]
    confirmed_by: FinanceId | None
    confirmed_at: datetime | None
    supersedes_revision_id: FinanceId | None


class TreatmentListResponse(BaseModel):
    items: list[TreatmentResponse]
    page: PageMeta
    completeness: Completeness
    empty_state: EmptyState | None


@router.get("/tax-profiles/{profile_id}/treatments", response_model=TreatmentListResponse)
async def list_treatments(
    profile_id: FinanceIdPath,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> TreatmentListResponse:
    await _owned_profile(session, user.id, profile_id)
    where = (FinanceTaxTreatmentRevision.user_id == user.id) & (
        FinanceTaxTreatmentRevision.tax_profile_id == profile_id
    )
    total = int(
        await session.scalar(
            select(func.count()).select_from(FinanceTaxTreatmentRevision).where(where)
        )
        or 0
    )
    rows = list(
        (
            await session.scalars(
                select(FinanceTaxTreatmentRevision)
                .where(where)
                .order_by(FinanceTaxTreatmentRevision.created_at, FinanceTaxTreatmentRevision.id)
                .limit(limit)
                .offset(offset)
            )
        ).all()
    )
    return TreatmentListResponse(
        items=[TreatmentResponse.model_validate(row) for row in rows],
        page=_page(limit, offset, total),
        completeness=_list_completeness(),
        empty_state=_empty_state(
            total,
            code="no_tax_treatments",
            title="No tax treatments",
            message="Confirmed ledger events will produce jurisdiction-specific candidates.",
        ),
    )


class TreatmentConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(min_length=1)
    expected_ruleset_version: str = Field(min_length=1)


class TreatmentMutationResponse(BaseModel):
    treatment: TreatmentResponse
    audit: AuditResponse


@router.post("/tax-treatments/{revision_id}/confirm", response_model=TreatmentMutationResponse)
async def confirm_tax_treatment(
    revision_id: FinanceIdPath,
    body: TreatmentConfirmRequest,
    idempotency_key: IdempotencyKey,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> TreatmentMutationResponse:
    request = {"revision_id": revision_id, **body.model_dump(mode="json")}
    prior = await prior_idempotent_response(
        session,
        user_id=user.id,
        workflow="confirm_tax_treatment",
        key=idempotency_key,
        request=request,
    )
    if prior is not None:
        return TreatmentMutationResponse.model_validate(prior)
    candidate = await session.scalar(
        select(FinanceTaxTreatmentRevision).where(
            FinanceTaxTreatmentRevision.id == revision_id,
            FinanceTaxTreatmentRevision.user_id == user.id,
        )
    )
    if candidate is None:
        raise HTTPException(status_code=404, detail="Tax treatment not found")
    if candidate.status != "candidate":
        raise HTTPException(status_code=409, detail="Tax treatment is not a candidate")
    if candidate.ruleset_version != body.expected_ruleset_version:
        raise HTTPException(status_code=409, detail="Tax treatment ruleset version is stale")
    treatment = await session.scalar(
        select(FinanceTaxTreatment)
        .where(
            FinanceTaxTreatment.id == candidate.treatment_id,
            FinanceTaxTreatment.user_id == user.id,
        )
        .with_for_update()
    )
    if treatment is None:
        raise HTTPException(status_code=409, detail="Tax treatment identity is missing")
    if treatment.current_revision_id != candidate.id:
        raise HTTPException(status_code=409, detail="Tax treatment candidate is stale")
    row = FinanceTaxTreatmentRevision(
        user_id=user.id,
        treatment_id=candidate.treatment_id,
        revision_number=candidate.revision_number + 1,
        event_revision_id=candidate.event_revision_id,
        tax_profile_id=candidate.tax_profile_id,
        jurisdiction=candidate.jurisdiction,
        tax_year=candidate.tax_year,
        ruleset_id=candidate.ruleset_id,
        ruleset_version=candidate.ruleset_version,
        category=candidate.category,
        status="confirmed",
        inputs=candidate.inputs,
        output=candidate.output,
        rationale=body.reason.strip(),
        source_citations=candidate.source_citations,
        missing_facts=candidate.missing_facts,
        confirmed_by=user.id,
        confirmed_at=datetime.now(UTC),
        supersedes_revision_id=candidate.id,
    )
    session.add(row)
    await session.flush()
    await surface_report_restatement_questions(
        session,
        user_id=user.id,
        actor_id=user.id,
        input_type="tax_treatment_revision",
        superseded_input_ids=tuple(
            value for value in (candidate.id, candidate.supersedes_revision_id) if value
        ),
        successor_input_id=row.id,
        reason=body.reason,
    )
    treatment.current_revision_id = row.id
    audit = await append_audit_entry(
        session,
        user_id=user.id,
        actor_id=user.id,
        action="tax_treatment.confirmed",
        entity_type="finance_tax_treatment",
        entity_id=treatment.id,
        request=request,
        reason=body.reason,
        prior_revision_id=candidate.id,
        new_revision_id=row.id,
    )
    response = TreatmentMutationResponse(
        treatment=TreatmentResponse.model_validate(row), audit=_audit(audit)
    )
    store_idempotent_response(
        session,
        user_id=user.id,
        workflow="confirm_tax_treatment",
        key=idempotency_key,
        request=request,
        response=response.model_dump(mode="json"),
        entity_id=treatment.id,
        audit_entry_id=audit.id,
    )
    await session.commit()
    return response


class ReportCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tax_profile_id: FinanceId
    format: Literal["zip", "csv", "pdf_summary"]
    include_warnings: bool
    expected_event_revision_ids: list[FinanceId]
    category: str | None = Field(default=None, min_length=1, max_length=100)


class DownloadMetadata(BaseModel):
    file_id: FinanceId
    file_name: str
    media_type: str
    size: int
    sha256: str
    download_url: str


class ReportReadiness(BaseModel):
    status: Literal["ready", "ready_with_warnings", "blocked"]
    blocking_count: int
    warning_count: int
    blockers: list[FinanceWarning]
    warnings: list[FinanceWarning]


class ReportRunResponse(BaseModel):
    id: FinanceId
    tax_profile_id: FinanceId
    tax_year: int
    jurisdiction: Literal["SE", "ES"]
    reporting_currency: str
    status: Literal["ready", "ready_with_warnings", "blocked"]
    ruleset_versions: dict[str, str]
    algorithm_version: str
    event_revision_ids: list[FinanceId]
    valuation_ids: list[FinanceId]
    treatment_ids: list[FinanceId]
    evidence_document_ids: list[FinanceId]
    open_question_ids: list[FinanceId]
    readiness: ReportReadiness
    manifest_sha256: str
    created_at: datetime
    download: DownloadMetadata | None


class ReportMutationResponse(BaseModel):
    report: ReportRunResponse
    audit: AuditResponse


def _report_response(row: FinanceReportRun, file_size: int = 0) -> ReportRunResponse:
    manifest = row.manifest
    download = None
    if row.file_id and row.file_sha256:
        content_type = {
            "zip": "application/zip",
            "csv": "text/csv",
            "pdf_summary": "application/pdf",
        }[row.format]
        suffix = {"zip": "zip", "csv": "csv", "pdf_summary": "pdf"}[row.format]
        download = DownloadMetadata(
            file_id=row.file_id,
            file_name=f"finance-{row.jurisdiction}-{row.tax_year}.{suffix}",
            media_type=content_type,
            size=file_size,
            sha256=row.file_sha256,
            download_url=f"/api/files/{row.file_id}",
        )
    return ReportRunResponse(
        id=row.id,
        tax_profile_id=row.tax_profile_id,
        tax_year=row.tax_year,
        jurisdiction=row.jurisdiction,
        reporting_currency=row.reporting_currency,
        status=row.status,
        ruleset_versions=row.ruleset_versions,
        algorithm_version=row.algorithm_version,
        event_revision_ids=cast(list[str], manifest.get("event_revision_ids", [])),
        valuation_ids=cast(list[str], manifest.get("valuation_ids", [])),
        treatment_ids=cast(list[str], manifest.get("treatment_ids", [])),
        evidence_document_ids=cast(list[str], manifest.get("evidence_document_ids", [])),
        open_question_ids=cast(list[str], manifest.get("open_question_ids", [])),
        readiness=ReportReadiness(
            status=cast(Literal["ready", "ready_with_warnings", "blocked"], row.status),
            blocking_count=len(row.blockers),
            warning_count=len(row.warnings),
            blockers=[FinanceWarning.model_validate(item) for item in row.blockers],
            warnings=[FinanceWarning.model_validate(item) for item in row.warnings],
        ),
        manifest_sha256=row.manifest_sha256,
        created_at=row.created_at,
        download=download,
    )


def _report_schedule(event_type: str, category: str) -> str:
    if event_type == "withholding":
        return "foreign_withholding"
    if event_type in {"trade", "corporate_action"}:
        return "asset_transactions"
    if event_type in {"staking_reward", "funding_payment", "derivative_fill"}:
        return "digital_assets_and_derivatives"
    if event_type in {"income", "interest", "dividend"}:
        return "income"
    if event_type in {"expense", "fee"}:
        return "expenses_and_fees"
    return category or "events"


@router.post("/reports", response_model=ReportMutationResponse, status_code=201)
async def create_report(
    body: ReportCreateRequest,
    idempotency_key: IdempotencyKey,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ReportMutationResponse:
    profile = await _owned_profile(session, user.id, body.tax_profile_id)
    request = body.model_dump(mode="json")
    prior = await prior_idempotent_response(
        session, user_id=user.id, workflow="create_report", key=idempotency_key, request=request
    )
    if prior is not None:
        return ReportMutationResponse.model_validate(prior)
    start, end = date(profile.tax_year, 1, 1), date(profile.tax_year, 12, 31)
    revision_rows = list(
        (
            await session.scalars(
                select(FinanceEventRevision)
                .join(
                    FinanceEvent,
                    FinanceEvent.current_revision_id == FinanceEventRevision.id,
                )
                .where(
                    FinanceEvent.user_id == user.id,
                    FinanceEventRevision.user_id == user.id,
                    FinanceEventRevision.status == "confirmed",
                    FinanceEventRevision.tax_date >= start,
                    FinanceEventRevision.tax_date <= end,
                )
                .order_by(FinanceEventRevision.effective_at, FinanceEventRevision.id)
            )
        ).all()
    )
    selections = tuple(
        EventRevisionSelection(
            event_id=row.event_id,
            revision_id=row.id,
            revision_number=row.revision_number,
            status=row.status,
            effective_at=row.effective_at.isoformat(),
        )
        for row in revision_rows
    )
    try:
        selected = select_current_event_revisions(
            selections, tuple(body.expected_event_revision_ids)
        )
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    revision_ids = [row.revision_id for row in selected]
    treatment_rows = (
        list(
            (
                await session.scalars(
                    select(FinanceTaxTreatmentRevision)
                    .where(
                        FinanceTaxTreatmentRevision.user_id == user.id,
                        FinanceTaxTreatmentRevision.tax_profile_id == profile.id,
                        FinanceTaxTreatmentRevision.status == "confirmed",
                        FinanceTaxTreatmentRevision.event_revision_id.in_(revision_ids),
                    )
                    .join(
                        FinanceTaxTreatment,
                        FinanceTaxTreatment.current_revision_id == FinanceTaxTreatmentRevision.id,
                    )
                )
            ).all()
        )
        if revision_ids
        else []
    )
    if body.category is not None:
        treatment_rows = [row for row in treatment_rows if row.category == body.category]
        category_revision_ids = {row.event_revision_id for row in treatment_rows}
        selected = tuple(row for row in selected if row.revision_id in category_revision_ids)
        revision_ids = [row.revision_id for row in selected]
    valuation_pairs = (
        list(
            (
                await session.execute(
                    select(FinanceRevisionValuation.event_revision_id, FinanceValuation)
                    .join(
                        FinanceValuation,
                        FinanceValuation.id == FinanceRevisionValuation.valuation_id,
                    )
                    .where(
                        FinanceValuation.user_id == user.id,
                        FinanceRevisionValuation.event_revision_id.in_(revision_ids),
                        FinanceValuation.target_currency == profile.reporting_currency,
                        or_(
                            FinanceValuation.tax_year.is_(None),
                            FinanceValuation.tax_year == profile.tax_year,
                        ),
                        or_(
                            FinanceValuation.jurisdiction.is_(None),
                            FinanceValuation.jurisdiction == profile.jurisdiction,
                        ),
                    )
                    .order_by(
                        FinanceRevisionValuation.event_revision_id,
                        FinanceValuation.asset_id,
                        FinanceValuation.valued_at,
                        FinanceValuation.id,
                    )
                )
            ).all()
        )
        if revision_ids
        else []
    )
    treatment_by_event = {row.event_revision_id: row for row in treatment_rows}
    valuations_by_event: dict[str, list[FinanceValuation]] = {}
    for associated_revision_id, valuation in valuation_pairs:
        valuations_by_event.setdefault(associated_revision_id, []).append(valuation)
    links = (
        list(
            (
                await session.scalars(
                    select(Link).where(
                        Link.source_type == "finance_event_revision",
                        Link.source_id.in_(revision_ids),
                        Link.target_type == "finance_evidence",
                        Link.relation == "supported_by",
                    )
                )
            ).all()
        )
        if revision_ids
        else []
    )
    evidence_by_event: dict[str, list[str]] = {}
    linked_evidence_ids = {link.target_id for link in links}
    residency_rows = list(
        (
            await session.scalars(
                select(FinanceResidencyFact)
                .where(
                    FinanceResidencyFact.user_id == user.id,
                    FinanceResidencyFact.tax_profile_id == profile.id,
                )
                .order_by(FinanceResidencyFact.created_at, FinanceResidencyFact.id)
            )
        ).all()
    )
    linked_evidence_ids.update(
        evidence_id
        for residency_fact in residency_rows
        for evidence_id in residency_fact.evidence_document_ids
    )
    evidence_rows = (
        list(
            (
                await session.scalars(
                    select(FinanceEvidenceDocument).where(
                        FinanceEvidenceDocument.user_id == user.id,
                        FinanceEvidenceDocument.id.in_(linked_evidence_ids),
                    )
                )
            ).all()
        )
        if linked_evidence_ids
        else []
    )
    owned_evidence_ids = {row.id for row in evidence_rows}
    links = [link for link in links if link.target_id in owned_evidence_ids]
    for link in links:
        evidence_by_event.setdefault(link.source_id, []).append(link.target_id)
    issues: list[ReportIssue] = []
    blocked_reconciliations = list(
        (
            await session.scalars(
                select(FinanceReconciliation).where(
                    FinanceReconciliation.user_id == user.id,
                    FinanceReconciliation.status == "blocked",
                    FinanceReconciliation.period_end >= start,
                    FinanceReconciliation.period_start <= end,
                    FinanceReconciliation.account_id.in_(
                        sorted({row.source_account_id for row in revision_rows})
                    ),
                )
            )
        ).all()
    )
    issues.extend(
        ReportIssue(
            "reconciliation_difference",
            "blocking",
            "A material reconciliation difference remains unresolved.",
            "reconciliation",
            row.id,
        )
        for row in blocked_reconciliations
    )
    questions = list(
        (
            await session.scalars(
                select(FinanceOpenQuestion).where(
                    FinanceOpenQuestion.user_id == user.id,
                    FinanceOpenQuestion.tax_profile_id == profile.id,
                    FinanceOpenQuestion.status == "open",
                )
            )
        ).all()
    )
    issues.extend(
        ReportIssue(
            "open_question",
            "blocking" if row.severity == "blocking" else "warning",
            row.title,
            "open_question",
            row.id,
        )
        for row in questions
    )
    if not residency_rows:
        issues.append(
            ReportIssue(
                "missing_residency_facts",
                "warning",
                "No residency facts are recorded for this tax profile.",
                "tax_profile",
                profile.id,
            )
        )
    if not selected:
        issues.append(
            ReportIssue(
                "no_confirmed_events",
                "blocking",
                (
                    "No confirmed events match this report category."
                    if body.category is not None
                    else "No current confirmed events exist for this tax profile year."
                ),
                "tax_profile",
                profile.id,
            )
        )
    if not body.include_warnings and any(issue.severity != "blocking" for issue in issues):
        issues.append(
            ReportIssue(
                "warnings_not_accepted",
                "blocking",
                "Review warnings and explicitly include them before creating an export.",
                "tax_profile",
                profile.id,
            )
        )
    revision_lookup = {row.id: row for row in revision_rows}
    items: list[ReportItem] = []
    selected_valuation_rows: list[FinanceValuation] = []
    for selected_row in selected:
        event = revision_lookup[selected_row.revision_id]
        event_valuations = valuations_by_event.get(event.id, [])
        valuation_by_asset: dict[str, list[FinanceValuation]] = {}
        for valuation in event_valuations:
            valuation_by_asset.setdefault(valuation.asset_id, []).append(valuation)
        chosen_valuations: list[FinanceValuation] = []
        for _asset_id, candidates in sorted(valuation_by_asset.items()):
            if len(candidates) > 1:
                issues.append(
                    ReportIssue(
                        "ambiguous_valuation",
                        "blocking",
                        "More than one matching valuation exists for an event asset.",
                        "event_revision",
                        event.id,
                    )
                )
            chosen_valuations.append(candidates[-1])
        selected_valuation_rows.extend(chosen_valuations)
        if any(valuation.value is None for valuation in chosen_valuations):
            issues.append(
                ReportIssue(
                    "valuation_without_value",
                    "blocking",
                    "A selected valuation has no reporting-currency value.",
                    "event_revision",
                    event.id,
                )
            )
        treatment = treatment_by_event.get(event.id)
        amount = format(
            sum(
                (valuation.value for valuation in chosen_valuations if valuation.value is not None),
                start=Decimal("0"),
            ),
            "f",
        )
        item_id = str(
            uuid5(
                NAMESPACE_URL,
                f"second-brain:finance-report-item:{profile.id}:{event.id}",
            )
        )
        category = treatment.category if treatment else "unclassified"
        items.append(
            ReportItem(
                id=item_id,
                schedule=_report_schedule(event.event_type, category),
                tax_date=event.tax_date.isoformat(),
                description=event.event_type,
                category=category,
                amount=amount,
                currency=profile.reporting_currency,
                event_revision_ids=(event.id,),
                valuation_ids=tuple(valuation.id for valuation in chosen_valuations),
                treatment_ids=(treatment.id,) if treatment else (),
                evidence_document_ids=tuple(sorted(evidence_by_event.get(event.id, []))),
                requires_evidence=True,
            )
        )
    report_id = str(uuid4())
    frozen = create_frozen_report(
        report_id=report_id,
        tax_profile_id=profile.id,
        tax_year=profile.tax_year,
        jurisdiction=profile.jurisdiction,
        reporting_currency=profile.reporting_currency,
        ruleset_versions={row.ruleset_id: row.ruleset_version for row in treatment_rows},
        algorithm_version="finance-report-v1",
        event_revisions=selected,
        valuation_ids=tuple(row.id for row in selected_valuation_rows),
        confirmed_treatment_ids=tuple(row.id for row in treatment_rows),
        evidence_document_ids=tuple(sorted(owned_evidence_ids)),
        open_question_ids=tuple(row.id for row in questions),
        evidence_manifest=tuple(
            EvidenceManifestEntry(
                id=row.id,
                sha256=row.sha256,
                original_name=row.original_name,
                media_type=row.media_type,
                size=row.size,
                object_version=row.object_version,
                captured_at=row.captured_at.isoformat(),
            )
            for row in evidence_rows
        ),
        open_question_manifest=tuple(
            OpenQuestionManifestEntry(
                id=row.id,
                severity=row.severity,
                title=row.title,
                description=row.description,
                status=row.status,
            )
            for row in questions
        ),
        residency_fact_manifest=tuple(
            ResidencyFactManifestEntry(
                id=row.id,
                fact_type=row.fact_type,
                period_start=row.period_start.isoformat() if row.period_start else None,
                period_end=row.period_end.isoformat() if row.period_end else None,
                source=row.source,
                status=row.status,
                evidence_document_ids=tuple(
                    sorted(
                        evidence_id
                        for evidence_id in row.evidence_document_ids
                        if evidence_id in owned_evidence_ids
                    )
                ),
            )
            for row in residency_rows
        ),
        items=tuple(items),
        issues=tuple(issues),
        created_at=datetime.now(UTC),
    )
    manifest = frozen.manifest()
    file_row = None
    file_hash = None
    if frozen.status != "blocked":
        exported = export_report(frozen, body.format)
        file_hash = __import__("hashlib").sha256(exported).hexdigest()
        suffix, media_type = {
            "zip": ("zip", "application/zip"),
            "csv": ("csv", "text/csv"),
            "pdf_summary": ("pdf", "application/pdf"),
        }[body.format]
        file_row = File(
            user_id=user.id,
            name=f"finance-{profile.jurisdiction}-{profile.tax_year}.{suffix}",
            content_type=media_type,
            size=len(exported),
        )
        session.add(file_row)
        await session.flush()
        storage.upload(user.id, file_row.id, exported, media_type)
    row = FinanceReportRun(
        id=report_id,
        user_id=user.id,
        tax_profile_id=profile.id,
        tax_year=profile.tax_year,
        jurisdiction=profile.jurisdiction,
        reporting_currency=profile.reporting_currency,
        format=body.format,
        status=frozen.status,
        ruleset_versions=dict(frozen.ruleset_versions),
        algorithm_version=frozen.algorithm_version,
        blockers=[issue.manifest() for issue in frozen.blockers],
        warnings=[issue.manifest() for issue in frozen.warnings],
        manifest=manifest,
        manifest_sha256=frozen.manifest_sha256,
        file_id=file_row.id if file_row else None,
        file_sha256=file_hash,
        created_at=frozen.created_at,
    )
    session.add(row)
    await session.flush()
    ordinal = 0
    input_payloads: dict[tuple[str, str], object] = {}
    for event_input in revision_rows:
        if event_input.id in revision_ids:
            input_payloads[("event_revision", event_input.id)] = {
                "id": event_input.id,
                "event_id": event_input.event_id,
                "revision_number": event_input.revision_number,
                "status": event_input.status,
                "event_type": event_input.event_type,
                "effective_at": event_input.effective_at.isoformat(),
                "tax_date": event_input.tax_date.isoformat(),
                "tax_day_policy": event_input.tax_day_policy,
                "source_account_id": event_input.source_account_id,
                "semantic_fingerprint": event_input.semantic_fingerprint,
                "attributes": event_input.attributes,
            }
    for valuation_input in selected_valuation_rows:
        input_payloads[("valuation", valuation_input.id)] = {
            "id": valuation_input.id,
            "event_revision_id": valuation_input.event_revision_id,
            "asset_id": valuation_input.asset_id,
            "rate": format(valuation_input.rate, "f"),
            "value": (
                format(valuation_input.value, "f") if valuation_input.value is not None else None
            ),
            "target_currency": valuation_input.target_currency,
            "provider_reference": valuation_input.provider_reference,
            "valuation_policy": valuation_input.valuation_policy,
            "tax_year": valuation_input.tax_year,
            "jurisdiction": valuation_input.jurisdiction,
            "override_reason": valuation_input.override_reason,
        }
    for treatment_input in treatment_rows:
        input_payloads[("tax_treatment_revision", treatment_input.id)] = {
            "id": treatment_input.id,
            "treatment_id": treatment_input.treatment_id,
            "revision_number": treatment_input.revision_number,
            "ruleset_id": treatment_input.ruleset_id,
            "ruleset_version": treatment_input.ruleset_version,
            "category": treatment_input.category,
            "status": treatment_input.status,
            "inputs": treatment_input.inputs,
            "output": treatment_input.output,
            "rationale": treatment_input.rationale,
            "source_citations": treatment_input.source_citations,
            "missing_facts": treatment_input.missing_facts,
        }
    for evidence_input in evidence_rows:
        input_payloads[("evidence_document", evidence_input.id)] = {
            "id": evidence_input.id,
            "sha256": evidence_input.sha256,
            "object_version": evidence_input.object_version,
            "size": evidence_input.size,
        }
    for question_input in questions:
        input_payloads[("open_question", question_input.id)] = {
            "id": question_input.id,
            "question_type": question_input.question_type,
            "severity": question_input.severity,
            "status": question_input.status,
            "title": question_input.title,
            "description": question_input.description,
            "related_entities": question_input.related_entities,
        }
    for residency_input in residency_rows:
        input_payloads[("residency_fact", residency_input.id)] = {
            "id": residency_input.id,
            "fact_type": residency_input.fact_type,
            "period_start": (
                residency_input.period_start.isoformat() if residency_input.period_start else None
            ),
            "period_end": (
                residency_input.period_end.isoformat() if residency_input.period_end else None
            ),
            "value": residency_input.value,
            "evidence_document_ids": residency_input.evidence_document_ids,
            "source": residency_input.source,
            "status": residency_input.status,
        }
    for input_type, ids in (
        ("event_revision", [item.revision_id for item in selected]),
        ("valuation", [item.id for item in selected_valuation_rows]),
        ("tax_treatment_revision", [item.id for item in treatment_rows]),
        ("evidence_document", [item.id for item in evidence_rows]),
        ("open_question", [item.id for item in questions]),
        ("residency_fact", [item.id for item in residency_rows]),
    ):
        for input_id in sorted(set(ids)):
            session.add(
                FinanceReportInput(
                    report_run_id=row.id,
                    input_type=input_type,
                    input_id=input_id,
                    input_hash=hash_payload(input_payloads[(input_type, input_id)]),
                    ordinal=ordinal,
                )
            )
            ordinal += 1
    for report_item in items:
        session.add(
            FinanceReportItem(
                report_run_id=row.id,
                schedule=report_item.schedule,
                line_key=report_item.id,
                label=report_item.description,
                value=Decimal(report_item.amount),
                currency=report_item.currency,
                event_revision_ids=list(report_item.event_revision_ids),
                valuation_ids=list(report_item.valuation_ids),
                treatment_revision_ids=list(report_item.treatment_ids),
                evidence_document_ids=list(report_item.evidence_document_ids),
                calculation_trace={"algorithm_version": frozen.algorithm_version},
            )
        )
    audit = await append_audit_entry(
        session,
        user_id=user.id,
        actor_id=user.id,
        action="report.created",
        entity_type="finance_report_run",
        entity_id=row.id,
        request=request,
    )
    response = ReportMutationResponse(
        report=_report_response(row, file_row.size if file_row else 0), audit=_audit(audit)
    )
    store_idempotent_response(
        session,
        user_id=user.id,
        workflow="create_report",
        key=idempotency_key,
        request=request,
        response=response.model_dump(mode="json"),
        entity_id=row.id,
        audit_entry_id=audit.id,
    )
    await session.commit()
    return response


class ReportListResponse(BaseModel):
    items: list[ReportRunResponse]
    page: PageMeta
    completeness: Completeness
    empty_state: EmptyState | None


@router.get("/reports", response_model=ReportListResponse)
async def list_reports(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ReportListResponse:
    where = FinanceReportRun.user_id == user.id
    total = int(
        await session.scalar(select(func.count()).select_from(FinanceReportRun).where(where)) or 0
    )
    rows = list(
        (
            await session.scalars(
                select(FinanceReportRun)
                .where(where)
                .order_by(FinanceReportRun.created_at.desc(), FinanceReportRun.id)
                .limit(limit)
                .offset(offset)
            )
        ).all()
    )
    file_ids = [row.file_id for row in rows if row.file_id]
    file_sizes: dict[str, int] = {}
    if file_ids:
        file_size_rows = (
            await session.execute(
                select(File.id, File.size).where(
                    File.user_id == user.id,
                    File.id.in_(file_ids),
                )
            )
        ).all()
        file_sizes = {file_id: size for file_id, size in file_size_rows}
    restatement_questions = (
        list(
            (
                await session.scalars(
                    select(FinanceOpenQuestion).where(
                        FinanceOpenQuestion.user_id == user.id,
                        FinanceOpenQuestion.tax_profile_id.in_(
                            {row.tax_profile_id for row in rows}
                        ),
                        FinanceOpenQuestion.question_type == "report_restatement_needed",
                        FinanceOpenQuestion.status == "open",
                    )
                )
            ).all()
        )
        if rows
        else []
    )
    restatement_warnings: list[FinanceWarning] = []
    page_report_ids = {row.id for row in rows}
    for question in restatement_questions:
        related_report_id = next(
            (
                item.get("entity_id")
                for item in question.related_entities
                if item.get("entity_type") == "finance_report_run"
            ),
            None,
        )
        if related_report_id in page_report_ids:
            restatement_warnings.append(
                FinanceWarning(
                    code="report_restatement_needed",
                    severity="warning",
                    message=question.description,
                    entity_type="finance_report_run",
                    entity_id=related_report_id,
                )
            )
    return ReportListResponse(
        items=[
            _report_response(row, file_sizes.get(row.file_id, 0) if row.file_id else 0)
            for row in rows
        ],
        page=_page(limit, offset, total),
        completeness=_list_completeness(warnings=restatement_warnings),
        empty_state=_empty_state(
            total,
            code="no_reports",
            title="No frozen reports",
            message="Create a report after the tax-year ledger is reviewed.",
        ),
    )


async def _owned_report(session: AsyncSession, user_id: str, report_id: str) -> FinanceReportRun:
    row = await session.scalar(
        select(FinanceReportRun).where(
            FinanceReportRun.id == report_id, FinanceReportRun.user_id == user_id
        )
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return row


@router.get("/reports/{report_id}", response_model=ReportRunResponse)
async def get_report(
    report_id: FinanceIdPath,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ReportRunResponse:
    report = await _owned_report(session, user.id, report_id)
    file_size = 0
    if report.file_id:
        file_size = int(
            await session.scalar(
                select(File.size).where(File.id == report.file_id, File.user_id == user.id)
            )
            or 0
        )
    return _report_response(report, file_size)


@router.get("/reports/{report_id}/download", response_model=DownloadMetadata)
async def get_report_download(
    report_id: FinanceIdPath,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> DownloadMetadata:
    report = await _owned_report(session, user.id, report_id)
    file_size = 0
    if report.file_id:
        file_size = int(
            await session.scalar(
                select(File.size).where(File.id == report.file_id, File.user_id == user.id)
            )
            or 0
        )
    response = _report_response(report, file_size)
    if response.download is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Blocked report has no download"
        )
    return response.download
