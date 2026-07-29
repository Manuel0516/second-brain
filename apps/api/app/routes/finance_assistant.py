"""Authenticated typed Finance AI tools and confirmation-gated proposal records."""

import json
import secrets
from dataclasses import asdict
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from hashlib import sha256
from typing import Annotated, Any, Literal, cast
from urllib.parse import urlparse
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Path
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_async_session
from app.dependencies import get_current_user
from app.models import (
    FinanceAccount,
    FinanceAsset,
    FinanceAssistantProposal,
    FinanceAuditEntry,
    FinanceEventRevision,
    FinanceEvidenceDocument,
    FinanceGuidanceSource,
    FinanceLot,
    FinanceOpenQuestion,
    FinancePosition,
    FinancePositionRevision,
    FinanceRawRecord,
    FinanceReconciliation,
    FinanceReportRun,
    FinanceReviewGroup,
    FinanceReviewPolicy,
    FinanceRevisionValuation,
    FinanceTaxProfile,
    FinanceToolAudit,
    FinanceValuation,
    Link,
    Page,
    User,
)
from app.services.finance_ai import (
    OFFICIAL_DOMAINS,
    TOOL_SPECS,
    AssistantScope,
    Citation,
    FinanceAIPolicy,
    FinanceAIPolicyError,
    FinanceGuidanceFetchError,
    OwnerAuthorization,
    fetch_official_guidance_snapshot,
    proposal_confirmation_token,
)
from app.services.finance_core import (
    FinanceId,
    append_audit_entry,
    hash_payload,
    prior_idempotent_response,
    store_idempotent_response,
)
from app.services.finance_tax import persist_candidate_treatment

router = APIRouter(prefix="/api/finance/assistant", tags=["finance-assistant"])
IdempotencyKey = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=255)]
POLICY = FinanceAIPolicy()
PROPOSAL_TOKEN_SECRET = get_settings().jwt_secret_key.encode()
FinanceIdPath = Annotated[
    str,
    Path(
        pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
        json_schema_extra={"format": "uuid"},
    ),
]

OFFICIAL_GUIDANCE_SOURCES: dict[str, tuple[dict[str, str], ...]] = {
    "SE": (
        {
            "publisher": "Skatteverket",
            "title": "Cryptocurrencies",
            "url": (
                "https://www.skatteverket.se/privat/skatter/vardepapper/andratillgangar/"
                "kryptovalutor.4.15532c7b1442f256bae11b60.html"
            ),
        },
        {
            "publisher": "Skatteverket",
            "title": "Liability for taxation",
            "url": (
                "https://www.skatteverket.se/servicelankar/otherlanguages/inenglishengelska/"
                "individualsandemployees/newinswedenandwillbeemployedhere/"
                "liabilityfortaxation.4.676f4884175c97df41930a7.html"
            ),
        },
    ),
    "ES": (
        {
            "publisher": "Agencia Tributaria",
            "title": "Fiscal residence overview",
            "url": (
                "https://sede.agenciatributaria.gob.es/Sede/no-residentes/"
                "residencia-personas-fisicas-juridicas.html"
            ),
        },
        {
            "publisher": "Agencia Tributaria",
            "title": "Modelo 720",
            "url": "https://sede.agenciatributaria.gob.es/Sede/procedimientoini/GI34.shtml",
        },
        {
            "publisher": "Agencia Tributaria",
            "title": "Modelo 721",
            "url": "https://sede.agenciatributaria.gob.es/Sede/procedimientoini/GI55.shtml",
        },
        {
            "publisher": "Agencia Tributaria",
            "title": "Gains and losses from virtual currencies",
            "url": (
                "https://sede.agenciatributaria.gob.es/Sede/Ayuda/24Presentacion/100/7_6_6_2/"
                "ganancias_perdidas_monedas_virtuales.html"
            ),
        },
    ),
}


class FinanceScopeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["finance"]
    tax_year: int | None = Field(ge=1900, le=2200)
    jurisdiction: Literal["SE", "ES"] | None


class AccountScopeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["account"]
    account_id: FinanceId


class EventRevisionsScopeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["event_revisions"]
    event_revision_ids: list[FinanceId] = Field(min_length=1, max_length=100)


class ReportScopeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["report"]
    report_id: FinanceId


ScopeRequest = Annotated[
    FinanceScopeRequest | AccountScopeRequest | EventRevisionsScopeRequest | ReportScopeRequest,
    Field(discriminator="type"),
]

FinanceAssistantToolName = Literal[
    "get_financial_snapshot",
    "list_accounts",
    "list_events",
    "get_event_lineage",
    "get_evidence_for_event",
    "get_reconciliation_status",
    "explain_balance_change",
    "get_asset_lots",
    "get_derivative_position_summary",
    "get_passive_income_breakdown",
    "get_tax_package_status",
    "calculate_scenario",
    "research_current_guidance",
    "propose_event_classification",
    "propose_review_policy",
    "create_open_question_draft",
    "prepare_export_note",
]


def _domain_scope(scope: ScopeRequest) -> AssistantScope:
    if isinstance(scope, FinanceScopeRequest):
        return AssistantScope(
            type="finance",
            tax_year=scope.tax_year,
            jurisdiction=scope.jurisdiction,
        )
    if isinstance(scope, AccountScopeRequest):
        return AssistantScope(type="account", account_id=scope.account_id)
    if isinstance(scope, EventRevisionsScopeRequest):
        return AssistantScope(
            type="event_revisions",
            event_revision_ids=tuple(scope.event_revision_ids),
        )
    return AssistantScope(type="report", report_id=scope.report_id)


class ToolCallRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scope: ScopeRequest
    arguments: dict[str, object]


class CitationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_type: Literal["event", "raw_record", "evidence", "report", "official_web"]
    source_id: FinanceId | None
    title: str
    url: str | None
    accessed_at: str | None
    locator: str | None

    @field_validator("source_id")
    @classmethod
    def source_id_uuid(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            return str(UUID(value))
        except ValueError as error:
            raise ValueError("source_id must be a UUID") from error


class AuditResponse(BaseModel):
    audit_entry_id: FinanceId
    action: str
    entity_type: str
    entity_id: FinanceId
    prior_revision_id: FinanceId | None
    new_revision_id: FinanceId | None
    created_at: datetime


class CompletenessWarningResponse(BaseModel):
    code: str
    severity: Literal["info", "warning", "blocking"]
    message: str
    entity_type: str | None
    entity_id: FinanceId | None


class CompletenessResponse(BaseModel):
    is_complete: bool
    warnings: list[CompletenessWarningResponse]
    blockers: list[CompletenessWarningResponse]


class ToolCallResponse(BaseModel):
    tool_name: FinanceAssistantToolName
    scope: ScopeRequest
    result: object
    completeness: CompletenessResponse
    citations: list[CitationResponse]
    audit: AuditResponse


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


def _tool_audit(row: FinanceToolAudit) -> AuditResponse:
    return AuditResponse(
        audit_entry_id=row.id,
        action="assistant_tool.called",
        entity_type="finance_tool_audit",
        entity_id=row.id,
        prior_revision_id=None,
        new_revision_id=None,
        created_at=row.created_at,
    )


async def _owner_authorization(session: AsyncSession, user_id: str) -> OwnerAuthorization:
    async def ids(model: object) -> frozenset[str]:
        rows = await session.scalars(select(model.id).where(model.user_id == user_id))  # type: ignore[attr-defined]
        return frozenset(rows.all())

    return OwnerAuthorization(
        owner_id=user_id,
        account_ids=await ids(FinanceAccount),
        event_revision_ids=await ids(FinanceEventRevision),
        report_ids=await ids(FinanceReportRun),
        tax_profile_ids=await ids(FinanceTaxProfile),
        review_group_ids=await ids(FinanceReviewGroup),
    )


def _decimal(value: object, field: str) -> Decimal:
    if not isinstance(value, str):
        raise HTTPException(status_code=400, detail=f"{field} must be a decimal string")
    try:
        number = Decimal(value)
    except InvalidOperation as error:
        raise HTTPException(status_code=400, detail=f"{field} must be a decimal string") from error
    if not number.is_finite():
        raise HTTPException(status_code=400, detail=f"{field} must be finite")
    return number


def _warning(
    code: str,
    message: str,
    *,
    severity: Literal["info", "warning", "blocking"] = "warning",
    entity_type: str | None = None,
    entity_id: str | None = None,
) -> dict[str, object]:
    return {
        "code": code,
        "severity": severity,
        "message": message,
        "entity_type": entity_type,
        "entity_id": entity_id,
    }


def _record_citations(
    source_type: Literal["event", "raw_record", "evidence", "report"],
    records: list[tuple[str, str]],
) -> tuple[Citation, ...]:
    return tuple(
        Citation(
            source_type=source_type,
            source_id=source_id,
            title=title,
            url=None,
            accessed_at=None,
            locator=None,
        )
        for source_id, title in list(dict(records).items())[: POLICY.max_result_items]
    )


async def _tool_result(
    session: AsyncSession,
    user_id: str,
    tool_name: str,
    scope: AssistantScope,
    arguments: dict[str, object],
) -> tuple[object, tuple[Citation, ...], dict[str, object]]:
    rows: list[Any]
    requested_limit = arguments.get("limit", 50)
    limit = requested_limit if isinstance(requested_limit, int) else 50
    if tool_name == "get_financial_snapshot":
        event_filters = [
            FinanceEventRevision.user_id == user_id,
            FinanceEventRevision.status == "confirmed",
        ]
        if scope.tax_year is not None:
            event_filters.extend(
                [
                    FinanceEventRevision.tax_date >= date(scope.tax_year, 1, 1),
                    FinanceEventRevision.tax_date <= date(scope.tax_year, 12, 31),
                ]
            )
        event_count = int(
            await session.scalar(
                select(func.count()).select_from(FinanceEventRevision).where(*event_filters)
            )
            or 0
        )
        account_count = int(
            await session.scalar(
                select(func.count())
                .select_from(FinanceAccount)
                .where(FinanceAccount.user_id == user_id)
            )
            or 0
        )
        return (
            {
                "account_count": account_count,
                "confirmed_event_count": event_count,
                "tax_year": scope.tax_year,
                "jurisdiction": scope.jurisdiction,
            },
            (),
            {
                "is_complete": True,
                "warnings": (
                    [
                        _warning(
                            "jurisdiction_applies_to_tax_views_only",
                            "Jurisdiction filters apply to tax interpretations, "
                            "not canonical facts.",
                            severity="info",
                        )
                    ]
                    if scope.jurisdiction
                    else []
                ),
                "blockers": [],
            },
        )
    if tool_name == "list_accounts":
        account_query = select(FinanceAccount).where(FinanceAccount.user_id == user_id)
        account_status = arguments.get("status")
        if account_status is not None:
            account_statuses = (
                account_status if isinstance(account_status, list) else [account_status]
            )
            account_query = account_query.where(FinanceAccount.status.in_(account_statuses))
        rows = list(
            (await session.scalars(account_query.order_by(FinanceAccount.id).limit(limit))).all()
        )
        return (
            {
                "items": [
                    {
                        "id": row.id,
                        "name": row.name,
                        "institution": row.institution,
                        "account_type": row.account_type,
                        "base_currency": row.base_currency,
                        "status": row.status,
                    }
                    for row in rows
                ]
            },
            (),
            {"is_complete": True, "warnings": [], "blockers": []},
        )
    if tool_name in {"list_events", "get_event_lineage", "get_evidence_for_event"}:
        query = select(FinanceEventRevision).where(FinanceEventRevision.user_id == user_id)
        if scope.event_revision_ids:
            if tool_name == "get_event_lineage":
                stable_event_ids = list(
                    (
                        await session.scalars(
                            select(FinanceEventRevision.event_id).where(
                                FinanceEventRevision.user_id == user_id,
                                FinanceEventRevision.id.in_(scope.event_revision_ids),
                            )
                        )
                    ).all()
                )
                query = query.where(FinanceEventRevision.event_id.in_(stable_event_ids))
            else:
                query = query.where(FinanceEventRevision.id.in_(scope.event_revision_ids))
        elif scope.account_id:
            query = query.where(FinanceEventRevision.source_account_id == scope.account_id)
        if tool_name == "list_events":
            if arguments.get("from"):
                query = query.where(
                    FinanceEventRevision.tax_date >= date.fromisoformat(str(arguments["from"]))
                )
            if arguments.get("to"):
                query = query.where(
                    FinanceEventRevision.tax_date <= date.fromisoformat(str(arguments["to"]))
                )
            if arguments.get("status"):
                status_argument = arguments["status"]
                statuses = (
                    status_argument if isinstance(status_argument, list) else [status_argument]
                )
                query = query.where(FinanceEventRevision.status.in_(statuses))
            if arguments.get("event_type"):
                query = query.where(FinanceEventRevision.event_type == arguments["event_type"])
        rows = list(
            (
                await session.scalars(
                    query.order_by(
                        FinanceEventRevision.effective_at, FinanceEventRevision.id
                    ).limit(limit)
                )
            ).all()
        )
        if tool_name == "get_evidence_for_event":
            revision_ids = list(scope.event_revision_ids) or [row.id for row in rows]
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
            evidence_ids = {link.target_id for link in links}
            owned_evidence_ids = (
                set(
                    (
                        await session.scalars(
                            select(FinanceEvidenceDocument.id).where(
                                FinanceEvidenceDocument.user_id == user_id,
                                FinanceEvidenceDocument.id.in_(evidence_ids),
                            )
                        )
                    ).all()
                )
                if evidence_ids
                else set()
            )
            return (
                {
                    "items": [
                        {"event_revision_id": row.source_id, "evidence_document_id": row.target_id}
                        for row in links
                        if row.target_id in owned_evidence_ids
                    ]
                },
                _record_citations(
                    "evidence",
                    [
                        (row.target_id, "Finance evidence document")
                        for row in links
                        if row.target_id in owned_evidence_ids
                    ],
                ),
                {"is_complete": True, "warnings": [], "blockers": []},
            )
        return (
            {
                "items": [
                    {
                        "id": row.id,
                        "event_id": row.event_id,
                        "revision_number": row.revision_number,
                        "event_type": row.event_type,
                        "status": row.status,
                        "effective_at": row.effective_at.isoformat(),
                    }
                    for row in rows
                ]
            },
            _record_citations(
                "event",
                [(row.id, f"Finance event revision {row.revision_number}") for row in rows],
            ),
            {"is_complete": True, "warnings": [], "blockers": []},
        )
    if tool_name in {"get_reconciliation_status", "explain_balance_change"}:
        start_key, end_key = (
            ("period_start", "period_end")
            if tool_name == "get_reconciliation_status"
            else ("from", "to")
        )
        rows = list(
            (
                await session.scalars(
                    select(FinanceReconciliation)
                    .where(
                        FinanceReconciliation.user_id == user_id,
                        FinanceReconciliation.account_id == scope.account_id,
                        FinanceReconciliation.period_end
                        >= date.fromisoformat(str(arguments[start_key])),
                        FinanceReconciliation.period_start
                        <= date.fromisoformat(str(arguments[end_key])),
                    )
                    .order_by(FinanceReconciliation.period_end.desc())
                    .limit(50)
                )
            ).all()
        )
        return (
            {
                "items": [
                    {
                        "id": row.id,
                        "period_start": row.period_start.isoformat(),
                        "period_end": row.period_end.isoformat(),
                        "opening_balance": format(row.opening_balance, "f"),
                        "movement_total": format(row.movement_total, "f"),
                        "closing_balance": format(row.closing_balance, "f"),
                        "difference": format(row.difference, "f"),
                        "status": row.status,
                    }
                    for row in rows
                ]
            },
            _record_citations(
                "event",
                [
                    (revision_id, "Reconciliation source event")
                    for row in rows
                    for revision_id in row.source_revision_ids
                ],
            ),
            {
                "is_complete": not any(row.status == "blocked" for row in rows),
                "warnings": [],
                "blockers": [
                    _warning(
                        "blocked_reconciliation",
                        "A reconciliation has a material unresolved difference.",
                        severity="blocking",
                        entity_type="finance_reconciliation",
                        entity_id=row.id,
                    )
                    for row in rows
                    if row.status == "blocked"
                ],
            },
        )
    if tool_name == "get_asset_lots":
        asset_exists = await session.scalar(
            select(FinanceAsset.id).where(
                FinanceAsset.id == arguments["asset_id"], FinanceAsset.user_id == user_id
            )
        )
        if asset_exists is None:
            raise HTTPException(status_code=404, detail="Asset not found")
        rows = list(
            (
                await session.scalars(
                    select(FinanceLot)
                    .where(
                        FinanceLot.user_id == user_id,
                        FinanceLot.asset_id == arguments["asset_id"],
                        FinanceLot.jurisdiction == arguments["jurisdiction"],
                        FinanceLot.tax_year == arguments["tax_year"],
                    )
                    .order_by(FinanceLot.acquired_at, FinanceLot.id)
                    .limit(POLICY.max_result_items)
                )
            ).all()
        )
        return (
            {
                "items": [
                    {
                        "id": row.id,
                        "remaining_quantity": format(row.remaining_quantity, "f"),
                        "cost_basis": format(row.cost_basis, "f"),
                        "currency": row.reporting_currency,
                        "status": row.status,
                    }
                    for row in rows
                ]
            },
            _record_citations(
                "event",
                [(row.acquisition_revision_id, "Lot acquisition event") for row in rows],
            ),
            {"is_complete": True, "warnings": [], "blockers": []},
        )
    if tool_name == "get_derivative_position_summary":
        rows = list(
            (
                await session.scalars(
                    select(FinancePositionRevision)
                    .join(
                        FinancePosition,
                        FinancePosition.current_revision_id == FinancePositionRevision.id,
                    )
                    .where(
                        FinancePosition.user_id == user_id,
                        FinancePosition.account_id == scope.account_id,
                        FinancePositionRevision.opened_at
                        <= datetime.combine(
                            date.fromisoformat(str(arguments["period_end"])), time.max, UTC
                        ),
                        (
                            FinancePositionRevision.closed_at.is_(None)
                            | (
                                FinancePositionRevision.closed_at
                                >= datetime.combine(
                                    date.fromisoformat(str(arguments["period_start"])),
                                    time.min,
                                    UTC,
                                )
                            )
                        ),
                    )
                    .order_by(FinancePositionRevision.opened_at, FinancePositionRevision.id)
                    .limit(POLICY.max_result_items)
                )
            ).all()
        )
        return (
            {
                "items": [
                    {
                        "id": row.id,
                        "position_id": row.position_id,
                        "revision_id": row.id,
                        "contract_type": row.contract_type,
                        "direction": row.direction,
                        "realized_pnl": (
                            format(row.realized_pnl, "f") if row.realized_pnl is not None else None
                        ),
                        "unrealized_pnl": (
                            format(row.unrealized_pnl, "f")
                            if row.unrealized_pnl is not None
                            else None
                        ),
                        "funding_total": format(row.funding_total, "f"),
                        "fee_total": format(row.fee_total, "f"),
                        "reporting_currency": row.reporting_currency,
                        "status": row.status,
                    }
                    for row in rows
                ]
            },
            _record_citations(
                "event",
                [
                    (revision_id, "Derivative position source event")
                    for row in rows
                    for revision_id in row.source_revision_ids
                ],
            ),
            {"is_complete": True, "warnings": [], "blockers": []},
        )
    if tool_name == "get_tax_package_status":
        report_query = select(FinanceReportRun).where(
            FinanceReportRun.user_id == user_id,
            FinanceReportRun.tax_profile_id == arguments["tax_profile_id"],
        )
        if scope.report_id:
            report_query = report_query.where(FinanceReportRun.id == scope.report_id)
        rows = list(
            (
                await session.scalars(
                    report_query.order_by(FinanceReportRun.created_at.desc()).limit(20)
                )
            ).all()
        )
        restatement_questions = list(
            (
                await session.scalars(
                    select(FinanceOpenQuestion).where(
                        FinanceOpenQuestion.user_id == user_id,
                        FinanceOpenQuestion.tax_profile_id == arguments["tax_profile_id"],
                        FinanceOpenQuestion.question_type == "report_restatement_needed",
                        FinanceOpenQuestion.status == "open",
                    )
                )
            ).all()
        )
        return (
            {
                "items": [
                    {
                        "id": row.id,
                        "status": row.status,
                        "manifest_sha256": row.manifest_sha256,
                        "created_at": row.created_at.isoformat(),
                    }
                    for row in rows
                ],
                "restatement_question_ids": [row.id for row in restatement_questions],
            },
            _record_citations(
                "report",
                [(row.id, f"Frozen {row.jurisdiction} {row.tax_year} report") for row in rows],
            ),
            {
                "is_complete": bool(rows) and not restatement_questions,
                "warnings": (
                    []
                    if rows and not restatement_questions
                    else [
                        _warning(
                            (
                                "report_restatement_needed"
                                if restatement_questions
                                else "no_frozen_report"
                            ),
                            (
                                "A successor revision affects at least one frozen report."
                                if restatement_questions
                                else "No frozen report exists for this tax profile."
                            ),
                        )
                    ]
                ),
                "blockers": [],
            },
        )
    if tool_name == "calculate_scenario":
        typed = arguments["typed_inputs"]
        if not isinstance(typed, dict):
            raise HTTPException(status_code=400, detail="typed_inputs must be an object")
        operation = arguments["calculation_type"]
        left, right = _decimal(typed.get("left"), "left"), _decimal(typed.get("right"), "right")
        operations = {"add": left + right, "subtract": left - right, "multiply": left * right}
        if operation == "divide":
            if right == 0:
                raise HTTPException(status_code=400, detail="division by zero")
            value = left / right
        elif operation in operations:
            value = operations[str(operation)]
        else:
            raise HTTPException(status_code=400, detail="unsupported deterministic calculation")
        return (
            {"calculation_type": operation, "result": format(value, "f")},
            (),
            {"is_complete": True, "warnings": [], "blockers": []},
        )
    if tool_name == "research_current_guidance":
        jurisdiction = str(arguments["jurisdiction"])
        tax_year_raw = arguments["tax_year"]
        if isinstance(tax_year_raw, bool) or not isinstance(tax_year_raw, int):
            raise HTTPException(status_code=400, detail="tax_year must be an integer")
        tax_year = tax_year_raw
        source_policy = str(arguments["source_policy"])
        allowed_urls = frozenset(
            source["url"] for sources in OFFICIAL_GUIDANCE_SOURCES.values() for source in sources
        )
        citations: list[Citation] = []
        source_rows: list[dict[str, object]] = []
        for source in OFFICIAL_GUIDANCE_SOURCES[jurisdiction]:
            try:
                snapshot = await fetch_official_guidance_snapshot(
                    source["url"],
                    jurisdiction=jurisdiction,
                    allowed_urls=allowed_urls,
                )
            except FinanceGuidanceFetchError as exc:
                raise HTTPException(
                    status_code=502,
                    detail="Official guidance could not be retrieved safely",
                ) from exc
            guidance = FinanceGuidanceSource(
                user_id=user_id,
                jurisdiction=jurisdiction,
                tax_year=tax_year,
                publisher=source["publisher"],
                title=source["title"],
                url=source["url"],
                retrieved_url=snapshot.retrieved_url,
                media_type=snapshot.media_type,
                http_status=snapshot.http_status,
                body_size=snapshot.body_size,
                body=snapshot.body,
                published_or_updated_at=None,
                accessed_at=datetime.now(UTC),
                content_hash=snapshot.content_hash,
                source_policy=source_policy,
            )
            session.add(guidance)
            await session.flush()
            citation = Citation(
                source_type="official_web",
                source_id=guidance.id,
                title=guidance.title,
                url=guidance.retrieved_url,
                accessed_at=guidance.accessed_at.isoformat(),
                locator=None,
            )
            citations.append(citation)
            source_rows.append(
                {
                    "guidance_source_id": guidance.id,
                    "publisher": guidance.publisher,
                    "title": guidance.title,
                    "url": guidance.url,
                    "accessed_at": guidance.accessed_at.isoformat(),
                    "content_hash": guidance.content_hash,
                }
            )
        return (
            {
                "question": arguments["question"],
                "jurisdiction": jurisdiction,
                "tax_year": tax_year,
                "answer_status": "official_sources_selected_for_human_review",
                "sources": source_rows,
                "legal_conclusion": None,
            },
            tuple(citations),
            {
                "is_complete": source_policy == "official_only",
                "warnings": (
                    []
                    if source_policy == "official_only"
                    else [
                        _warning(
                            "only_official_sources_are_available_in_this_runtime",
                            "This runtime selected official sources only.",
                            severity="info",
                        )
                    ]
                ),
                "blockers": [],
            },
        )
    if tool_name in {"get_passive_income_breakdown"}:
        passive_query = select(FinanceEventRevision).where(
            FinanceEventRevision.user_id == user_id,
            FinanceEventRevision.event_type.in_(["staking_reward", "interest", "dividend"]),
            FinanceEventRevision.tax_date >= date.fromisoformat(str(arguments["from"])),
            FinanceEventRevision.tax_date <= date.fromisoformat(str(arguments["to"])),
        )
        if scope.account_id:
            passive_query = passive_query.where(
                FinanceEventRevision.source_account_id == scope.account_id
            )
        if arguments.get("status"):
            status_argument = arguments["status"]
            statuses = status_argument if isinstance(status_argument, list) else [status_argument]
            passive_query = passive_query.where(FinanceEventRevision.status.in_(statuses))
        rows = list(
            (
                await session.scalars(
                    passive_query.order_by(
                        FinanceEventRevision.effective_at, FinanceEventRevision.id
                    ).limit(100)
                )
            ).all()
        )
        passive_ids = [row.id for row in rows]
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
                            FinanceValuation.user_id == user_id,
                            FinanceRevisionValuation.event_revision_id.in_(passive_ids),
                            FinanceValuation.value.is_not(None),
                        )
                        .order_by(FinanceValuation.id)
                    )
                ).all()
            )
            if passive_ids
            else []
        )
        group_by = str(arguments["group_by"])
        event_lookup = {row.id: row for row in rows}
        grouped: dict[tuple[str, str], Decimal] = {}
        counts: dict[tuple[str, str], int] = {}
        for associated_revision_id, valuation in valuation_pairs:
            event = event_lookup[associated_revision_id]
            if group_by == "asset":
                key = (valuation.asset_id, valuation.target_currency)
            elif group_by == "month":
                key = (event.tax_date.strftime("%Y-%m"), valuation.target_currency)
            elif group_by == "source":
                key = (event.source_account_id, valuation.target_currency)
            else:
                key = (event.event_type, valuation.target_currency)
            grouped[key] = grouped.get(key, Decimal("0")) + cast(Decimal, valuation.value)
            counts[key] = counts.get(key, 0) + 1
        return (
            {
                "items": [
                    {
                        "group": key[0],
                        "currency": key[1],
                        "amount": format(grouped[key], "f"),
                        "valuation_count": counts[key],
                    }
                    for key in sorted(grouped)
                ],
                "event_revision_ids": passive_ids,
                "event_count": len(rows),
            },
            _record_citations(
                "event",
                [(row.id, f"Passive-income {row.event_type} event") for row in rows],
            ),
            {
                "is_complete": len({row[0] for row in valuation_pairs}) == len(rows),
                "warnings": (
                    []
                    if len({row[0] for row in valuation_pairs}) == len(rows)
                    else [
                        _warning(
                            "some_passive_income_events_have_no_valuation",
                            "Some passive-income events have no associated valuation.",
                        )
                    ]
                ),
                "blockers": [],
            },
        )
    if tool_name.startswith("propose_") or tool_name in {
        "create_open_question_draft",
        "prepare_export_note",
    }:
        return (
            {"draft": arguments, "application_status": "requires_user_confirmation"},
            (),
            {"is_complete": True, "warnings": [], "blockers": []},
        )
    raise HTTPException(status_code=409, detail="Typed tool implementation is unavailable")


@router.post("/tools/{tool_name}", response_model=ToolCallResponse)
async def call_finance_tool(
    tool_name: str,
    body: ToolCallRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ToolCallResponse:
    owner_id = user.id
    authorization = await _owner_authorization(session, owner_id)
    request = None
    try:
        request = POLICY.authorize(
            tool_name, _domain_scope(body.scope), body.arguments, authorization
        )
        result, citations, completeness = await _tool_result(
            session, owner_id, tool_name, request.scope, body.arguments
        )
        prepared = POLICY.prepare_result(request, result, citations)
    except FinanceAIPolicyError as error:
        await session.rollback()
        spec = TOOL_SPECS.get(tool_name)
        rejected = FinanceToolAudit(
            user_id=owner_id,
            tool_name=tool_name[:100],
            permission_class=spec.permission if spec else "read",
            scope=body.scope.model_dump(mode="json"),
            arguments_hash=hash_payload(body.arguments),
            result_metadata={"error": "policy_rejected"},
            citations=[],
            status="rejected",
        )
        session.add(rejected)
        await session.commit()
        raise HTTPException(status_code=400, detail=str(error)) from error
    except HTTPException as error:
        await session.rollback()
        failed = FinanceToolAudit(
            user_id=owner_id,
            tool_name=tool_name,
            permission_class=request.permission if request else "read",
            scope=request.scope.wire() if request else body.scope.model_dump(mode="json"),
            arguments_hash=(request.arguments_sha256 if request else hash_payload(body.arguments)),
            result_metadata={"error": "tool_failed", "status_code": error.status_code},
            citations=[],
            status="failed",
        )
        session.add(failed)
        await session.commit()
        raise
    row = FinanceToolAudit(
        user_id=owner_id,
        tool_name=tool_name,
        permission_class=request.permission,
        scope=request.scope.wire(),
        arguments_hash=request.arguments_sha256,
        result_metadata={
            "result_sha256": prepared.result_sha256,
            "result_bytes": len(json.dumps(prepared.result, default=str).encode()),
        },
        citations=[asdict(citation) for citation in citations],
        status="complete",
    )
    session.add(row)
    await session.flush()
    await session.commit()
    return ToolCallResponse(
        tool_name=cast(FinanceAssistantToolName, tool_name),
        scope=request.scope.wire(),
        result=prepared.result,
        completeness=completeness,
        citations=[CitationResponse.model_validate(asdict(citation)) for citation in citations],
        audit=_tool_audit(row),
    )


class ProposalCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    proposal_type: Literal["event_classification", "review_policy", "open_question", "export_note"]
    scope: ScopeRequest
    before: dict[str, object]
    after: dict[str, object]
    affected_record_count: int = Field(ge=1, le=10000)
    impacted_report_ids: list[FinanceId] = Field(max_length=100)
    rationale: str = Field(min_length=1, max_length=5000)
    citations: list[CitationResponse] = Field(max_length=100)


class ProposalResponse(BaseModel):
    id: FinanceId
    proposal_type: Literal["event_classification", "review_policy", "open_question", "export_note"]
    status: Literal["pending", "confirmed", "rejected", "expired"]
    scope: ScopeRequest
    before: dict[str, object]
    after: dict[str, object]
    affected_record_count: int
    impacted_report_ids: list[FinanceId]
    rationale: str
    citations: list[CitationResponse]
    confirmation_token: str
    expires_at: datetime


class ProposalMutationResponse(BaseModel):
    proposal: ProposalResponse
    audit: AuditResponse
    resulting_revision_id: FinanceId | None


def _proposal(row: FinanceAssistantProposal, token: str | None = None) -> ProposalResponse:
    return ProposalResponse(
        id=row.id,
        proposal_type=row.proposal_type,
        status=row.status,
        scope=row.scope,
        before=row.before,
        after=row.after,
        affected_record_count=row.affected_record_count,
        impacted_report_ids=row.impacted_report_ids,
        rationale=row.rationale,
        citations=row.citations,
        confirmation_token=token or _proposal_token(row),
        expires_at=row.expires_at,
    )


def _proposal_token(row: FinanceAssistantProposal) -> str:
    expires_at = row.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    return proposal_confirmation_token(row.id, row.user_id, expires_at, PROPOSAL_TOKEN_SECRET)


def _require_keys(
    values: dict[str, object], *, required: set[str], optional: set[str] | None = None
) -> None:
    keys = set(values)
    optional = optional or set()
    missing = required - keys
    extra = keys - required - optional
    if missing or extra:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid proposal payload; missing={sorted(missing)}, extra={sorted(extra)}",
        )


async def _validate_proposal_payload(
    session: AsyncSession,
    *,
    user_id: str,
    body: ProposalCreateRequest,
    authorization: OwnerAuthorization,
) -> None:
    after = body.after
    try:
        json.dumps({"before": body.before, "after": after}, allow_nan=False)
    except (TypeError, ValueError) as error:
        raise HTTPException(
            status_code=400, detail="Proposal payload must be finite JSON"
        ) from error

    def reject_float(value: object) -> None:
        if isinstance(value, float):
            raise HTTPException(
                status_code=400, detail="Proposal payload must not use binary floating point"
            )
        if isinstance(value, dict):
            for item in value.values():
                reject_float(item)
        elif isinstance(value, list):
            for item in value:
                reject_float(item)

    reject_float({"before": body.before, "after": after})
    if body.proposal_type == "event_classification":
        _require_keys(
            after,
            required={"event_revision_ids", "tax_profile_id", "category"},
        )
        revision_ids = after["event_revision_ids"]
        if (
            not isinstance(revision_ids, list)
            or not revision_ids
            or any(not isinstance(value, str) for value in revision_ids)
        ):
            raise HTTPException(status_code=400, detail="event_revision_ids must be a list")
        if not set(revision_ids) <= authorization.event_revision_ids:
            raise HTTPException(status_code=404, detail="Event revision not found")
        if after["tax_profile_id"] not in authorization.tax_profile_ids:
            raise HTTPException(status_code=404, detail="Tax profile not found")
        if not isinstance(after["category"], str) or not str(after["category"]).strip():
            raise HTTPException(status_code=400, detail="category is required")
        if body.affected_record_count != len(set(revision_ids)):
            raise HTTPException(status_code=400, detail="affected_record_count is inconsistent")
    elif body.proposal_type == "review_policy":
        _require_keys(
            after,
            required={"policy_key", "criteria", "decision", "source_group_id"},
        )
        if after["source_group_id"] not in authorization.review_group_ids:
            raise HTTPException(status_code=404, detail="Review group not found")
        if not isinstance(after["criteria"], dict) or not isinstance(after["decision"], dict):
            raise HTTPException(status_code=400, detail="criteria and decision must be objects")
        if not isinstance(after["policy_key"], str) or not str(after["policy_key"]).strip():
            raise HTTPException(status_code=400, detail="policy_key is required")
        if body.affected_record_count != 1:
            raise HTTPException(status_code=400, detail="review policy affects one new revision")
    elif body.proposal_type == "open_question":
        _require_keys(
            after,
            required={"title", "severity"},
            optional={"description", "question_type", "tax_profile_id", "related_entities"},
        )
        if after["severity"] not in {"info", "warning", "blocking"}:
            raise HTTPException(status_code=400, detail="Invalid open-question severity")
        profile_id = after.get("tax_profile_id")
        if profile_id is not None and profile_id not in authorization.tax_profile_ids:
            raise HTTPException(status_code=404, detail="Tax profile not found")
        if body.affected_record_count != 1:
            raise HTTPException(status_code=400, detail="open question affects one new record")
    else:
        _require_keys(after, required={"note"})
        if body.scope.type != "report" or body.scope.report_id not in authorization.report_ids:
            raise HTTPException(status_code=404, detail="Report not found")
        if not isinstance(after["note"], str) or not str(after["note"]).strip():
            raise HTTPException(status_code=400, detail="Export note is required")
        if body.affected_record_count != 1:
            raise HTTPException(status_code=400, detail="export note affects one new record")

    evidence_source_ids = [
        citation.source_id
        for citation in body.citations
        if citation.source_type == "evidence" and citation.source_id
    ]
    if evidence_source_ids:
        owned = set(
            (
                await session.scalars(
                    select(FinanceEvidenceDocument.id).where(
                        FinanceEvidenceDocument.user_id == user_id,
                        FinanceEvidenceDocument.id.in_(evidence_source_ids),
                    )
                )
            ).all()
        )
        if owned != set(evidence_source_ids):
            raise HTTPException(status_code=404, detail="Citation source not found")
    raw_record_ids = [
        citation.source_id
        for citation in body.citations
        if citation.source_type == "raw_record" and citation.source_id
    ]
    if raw_record_ids:
        owned = set(
            (
                await session.scalars(
                    select(FinanceRawRecord.id).where(
                        FinanceRawRecord.user_id == user_id,
                        FinanceRawRecord.id.in_(raw_record_ids),
                    )
                )
            ).all()
        )
        if owned != set(raw_record_ids):
            raise HTTPException(status_code=404, detail="Citation source not found")
    for citation in body.citations:
        if (
            citation.source_type == "event"
            and citation.source_id not in authorization.event_revision_ids
        ):
            raise HTTPException(status_code=404, detail="Citation source not found")
        if citation.source_type == "report" and citation.source_id not in authorization.report_ids:
            raise HTTPException(status_code=404, detail="Citation source not found")
        if citation.source_type == "official_web":
            if not citation.url or not citation.accessed_at:
                raise HTTPException(status_code=400, detail="Official citation is incomplete")
            parsed = urlparse(citation.url)
            host = (parsed.hostname or "").lower()
            allowed_domains = (*OFFICIAL_DOMAINS["SE"], *OFFICIAL_DOMAINS["ES"])
            if parsed.scheme != "https" or not any(
                host == domain or host.endswith(f".{domain}") for domain in allowed_domains
            ):
                raise HTTPException(status_code=400, detail="Official citation domain is invalid")
            try:
                datetime.fromisoformat(citation.accessed_at)
            except ValueError as error:
                raise HTTPException(
                    status_code=400, detail="Official citation access date is invalid"
                ) from error


async def _apply_proposal(
    session: AsyncSession,
    *,
    user: User,
    proposal: FinanceAssistantProposal,
    reason: str,
) -> str:
    after = proposal.after
    if proposal.proposal_type == "event_classification":
        resulting_ids: list[str] = []
        for revision_id in sorted(set(cast(list[str], after["event_revision_ids"]))):
            _, treatment_revision, _ = await persist_candidate_treatment(
                session,
                user_id=user.id,
                actor_id=user.id,
                event_revision_id=revision_id,
                tax_profile_id=str(after["tax_profile_id"]),
                category_override=str(after["category"]),
                rationale_override=proposal.rationale,
                reason=reason,
            )
            resulting_ids.append(treatment_revision.id)
        return resulting_ids[0]
    if proposal.proposal_type == "review_policy":
        policy_key = str(after["policy_key"]).strip()
        prior_version = int(
            await session.scalar(
                select(func.max(FinanceReviewPolicy.version)).where(
                    FinanceReviewPolicy.user_id == user.id,
                    FinanceReviewPolicy.policy_key == policy_key,
                )
            )
            or 0
        )
        policy_revision = FinanceReviewPolicy(
            user_id=user.id,
            policy_key=policy_key,
            version=prior_version + 1,
            status="active",
            criteria=cast(dict[str, object], after["criteria"]),
            decision=cast(dict[str, object], after["decision"]),
            source_group_id=str(after["source_group_id"]),
        )
        session.add(policy_revision)
        await session.flush()
        return policy_revision.id
    if proposal.proposal_type == "open_question":
        related = after.get("related_entities", [])
        if not isinstance(related, list):
            raise HTTPException(status_code=400, detail="related_entities must be a list")
        open_question = FinanceOpenQuestion(
            user_id=user.id,
            tax_profile_id=cast(str | None, after.get("tax_profile_id")),
            question_type=str(after.get("question_type", "assistant_draft"))[:100],
            severity=str(after["severity"]),
            title=str(after["title"])[:255],
            description=str(after.get("description", proposal.rationale)),
            status="open",
            owner_role="user",
            related_entities=related,
        )
        session.add(open_question)
        await session.flush()
        return open_question.id
    report_id = cast(str, proposal.scope["report_id"])
    sibling_count = int(
        await session.scalar(
            select(func.count(Page.id)).where(
                Page.user_id == user.id,
                Page.parent_page_id.is_(None),
            )
        )
        or 0
    )
    export_note = Page(
        user_id=user.id,
        title="Finance report export note",
        type="page",
        position=f"a{sibling_count:08d}",
        content={
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": str(after["note"])}],
                }
            ],
        },
    )
    session.add(export_note)
    await session.flush()
    link = Link(
        source_type="finance_report",
        source_id=report_id,
        target_type="page",
        target_id=export_note.id,
        relation="documents",
    )
    session.add(link)
    await session.flush()
    await append_audit_entry(
        session,
        user_id=user.id,
        actor_id=user.id,
        action="link.created",
        entity_type="finance_link",
        entity_id=link.id,
        request={
            "source_type": link.source_type,
            "source_id": link.source_id,
            "target_type": link.target_type,
            "target_id": link.target_id,
            "relation": link.relation,
        },
        reason=reason,
    )
    return export_note.id


@router.post("/proposals", response_model=ProposalMutationResponse, status_code=201)
async def create_assistant_proposal(
    body: ProposalCreateRequest,
    idempotency_key: IdempotencyKey,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ProposalMutationResponse:
    authorization = await _owner_authorization(session, user.id)
    scope = _domain_scope(body.scope)
    try:
        POLICY._authorize_scope(scope, authorization)
    except FinanceAIPolicyError as error:
        raise HTTPException(status_code=404, detail="Proposal scope not found") from error
    if not set(body.impacted_report_ids) <= authorization.report_ids:
        raise HTTPException(status_code=404, detail="Impacted report not found")
    await _validate_proposal_payload(
        session,
        user_id=user.id,
        body=body,
        authorization=authorization,
    )
    request = body.model_dump(mode="json")
    prior = await prior_idempotent_response(
        session,
        user_id=user.id,
        workflow="create_assistant_proposal",
        key=idempotency_key,
        request=request,
    )
    if prior is not None:
        response = ProposalMutationResponse.model_validate(prior)
        prior_row = await session.scalar(
            select(FinanceAssistantProposal).where(
                FinanceAssistantProposal.id == response.proposal.id,
                FinanceAssistantProposal.user_id == user.id,
            )
        )
        if prior_row is not None:
            response.proposal.confirmation_token = _proposal_token(prior_row)
        return response
    expires_at = datetime.now(UTC) + timedelta(minutes=15)
    proposal_id = str(uuid4())
    token = proposal_confirmation_token(proposal_id, user.id, expires_at, PROPOSAL_TOKEN_SECRET)
    row = FinanceAssistantProposal(
        id=proposal_id,
        user_id=user.id,
        proposal_type=body.proposal_type,
        status="pending",
        scope=scope.wire(),
        before=body.before,
        after=body.after,
        affected_record_count=body.affected_record_count,
        impacted_report_ids=sorted(set(body.impacted_report_ids)),
        rationale=body.rationale.strip(),
        citations=[citation.model_dump(mode="json") for citation in body.citations],
        confirmation_token_hash=sha256(token.encode()).hexdigest(),
        expires_at=expires_at,
    )
    session.add(row)
    await session.flush()
    audit = await append_audit_entry(
        session,
        user_id=user.id,
        actor_id=user.id,
        actor_type="ai_assistant",
        action="assistant_proposal.created",
        entity_type="finance_assistant_proposal",
        entity_id=row.id,
        request=request,
    )
    response = ProposalMutationResponse(
        proposal=_proposal(row, token),
        audit=_audit(audit),
        resulting_revision_id=None,
    )
    stored_response = response.model_copy(deep=True)
    stored_response.proposal.confirmation_token = ""
    store_idempotent_response(
        session,
        user_id=user.id,
        workflow="create_assistant_proposal",
        key=idempotency_key,
        request=request,
        response=stored_response.model_dump(mode="json"),
        entity_id=row.id,
        audit_entry_id=audit.id,
    )
    await session.commit()
    return response


class ProposalConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirmation_token: str = Field(min_length=1)
    reason: str = Field(min_length=1, max_length=2000)


class ProposalRejectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(min_length=1, max_length=2000)


async def _resolve_proposal(
    proposal_id: str,
    body: ProposalConfirmRequest | ProposalRejectRequest,
    idempotency_key: str,
    user: User,
    session: AsyncSession,
    action: Literal["confirm", "reject"],
) -> ProposalMutationResponse:
    row = await session.scalar(
        select(FinanceAssistantProposal)
        .where(
            FinanceAssistantProposal.id == proposal_id,
            FinanceAssistantProposal.user_id == user.id,
        )
        .with_for_update()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Proposal not found")
    request = {"proposal_id": proposal_id, "action": action, **body.model_dump(mode="json")}
    prior = await prior_idempotent_response(
        session,
        user_id=user.id,
        workflow=f"{action}_assistant_proposal",
        key=idempotency_key,
        request=request,
    )
    if prior is not None:
        response = ProposalMutationResponse.model_validate(prior)
        response.proposal.confirmation_token = _proposal_token(row)
        return response
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Proposal is not pending")
    now = datetime.now(UTC)
    if row.expires_at.tzinfo is None:
        row.expires_at = row.expires_at.replace(tzinfo=UTC)
    if now > row.expires_at:
        row.status = "expired"
        row.resolved_at = now
        await append_audit_entry(
            session,
            user_id=user.id,
            actor_id=user.id,
            action="assistant_proposal.expired",
            entity_type="finance_assistant_proposal",
            entity_id=row.id,
            request=request,
            reason="Confirmation window expired",
        )
        await session.commit()
        raise HTTPException(status_code=409, detail="Proposal has expired")
    resulting_revision_id: str | None = None
    if action == "confirm":
        if not isinstance(body, ProposalConfirmRequest):
            raise HTTPException(status_code=422, detail="Confirmation token is required")
        expected_token = _proposal_token(row)
        if not secrets.compare_digest(
            body.confirmation_token, expected_token
        ) or not secrets.compare_digest(
            sha256(body.confirmation_token.encode()).hexdigest(),
            row.confirmation_token_hash,
        ):
            await append_audit_entry(
                session,
                user_id=user.id,
                actor_id=user.id,
                action="assistant_proposal.confirmation_rejected",
                entity_type="finance_assistant_proposal",
                entity_id=row.id,
                request=request,
                reason="Invalid confirmation token",
            )
            await session.commit()
            raise HTTPException(status_code=409, detail="Invalid confirmation token")
        resulting_revision_id = await _apply_proposal(
            session,
            user=user,
            proposal=row,
            reason=body.reason,
        )
        row.status = "confirmed"
    else:
        row.status = "rejected"
    row.resolved_at = now
    audit = await append_audit_entry(
        session,
        user_id=user.id,
        actor_id=user.id,
        action=f"assistant_proposal.{row.status}",
        entity_type="finance_assistant_proposal",
        entity_id=row.id,
        request=request,
        reason=body.reason,
        new_revision_id=resulting_revision_id,
    )
    response = ProposalMutationResponse(
        proposal=_proposal(row),
        audit=_audit(audit),
        resulting_revision_id=resulting_revision_id,
    )
    stored_response = response.model_copy(deep=True)
    stored_response.proposal.confirmation_token = ""
    store_idempotent_response(
        session,
        user_id=user.id,
        workflow=f"{action}_assistant_proposal",
        key=idempotency_key,
        request=request,
        response=stored_response.model_dump(mode="json"),
        entity_id=row.id,
        audit_entry_id=audit.id,
    )
    await session.commit()
    return response


@router.post("/proposals/{proposal_id}/confirm", response_model=ProposalMutationResponse)
async def confirm_assistant_proposal(
    proposal_id: FinanceIdPath,
    body: ProposalConfirmRequest,
    idempotency_key: IdempotencyKey,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ProposalMutationResponse:
    return await _resolve_proposal(proposal_id, body, idempotency_key, user, session, "confirm")


@router.post("/proposals/{proposal_id}/reject", response_model=ProposalMutationResponse)
async def reject_assistant_proposal(
    proposal_id: FinanceIdPath,
    body: ProposalRejectRequest,
    idempotency_key: IdempotencyKey,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ProposalMutationResponse:
    return await _resolve_proposal(proposal_id, body, idempotency_key, user, session, "reject")
