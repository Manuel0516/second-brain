"""Owner-scoped Finance source, evidence and import endpoints."""

from __future__ import annotations

import io
import json
import re
import zipfile
from datetime import UTC, date, datetime
from typing import Annotated, Literal, TypedDict, cast

from fastapi import (
    APIRouter,
    Depends,
    Form,
    Header,
    HTTPException,
    Path,
    Query,
    UploadFile,
    status,
)
from fastapi import (
    File as FormFile,
)
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_serializer
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse

from app.database import get_async_session
from app.dependencies import get_current_user
from app.models import (
    FinanceAccount,
    FinanceAuditEntry,
    FinanceEventRevision,
    FinanceEvidenceDocument,
    FinanceImport,
    FinanceRawRecord,
    FinanceSourceConnection,
    Link,
    User,
)
from app.security import encrypt_finance_value
from app.services.finance_core import (
    FinanceId,
    append_audit_entry,
    prior_idempotent_response,
    store_idempotent_response,
)
from app.services.finance_evidence import (
    FinanceUploadValidationError,
    acquire_finance_advisory_lock,
    compute_sha256,
    create_evidence_document,
    evidence_bundle_folder,
    evidence_response,
)
from app.services.finance_import_projection import project_import_records
from app.services.finance_imports import (
    FinanceImportError,
    ImportMode,
    ParserId,
    commit_raw_records,
    preview_import,
)
from app.storage import download, max_file_size, upload

router = APIRouter(prefix="/api/finance", tags=["finance"])
FinanceIdPath = Annotated[
    str,
    Path(
        pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
        json_schema_extra={"format": "uuid"},
    ),
]

IdempotencyKey = Annotated[
    str,
    Header(alias="Idempotency-Key", min_length=1, max_length=255),
]


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


def _audit_response(entry: FinanceAuditEntry) -> AuditMetadata:
    created_at = entry.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)
    return AuditMetadata(
        audit_entry_id=entry.id,
        action=entry.action,
        entity_type=entry.entity_type,
        entity_id=entry.entity_id,
        prior_revision_id=entry.prior_revision_id,
        new_revision_id=entry.new_revision_id,
        created_at=created_at,
    )


def _page(limit: int, offset: int, total: int) -> PageMeta:
    return PageMeta(limit=limit, offset=offset, total=total, has_more=offset + limit < total)


def _empty(code: str, title: str, message: str, next_action: str) -> EmptyState:
    return EmptyState(code=code, title=title, message=message, next_action=next_action)


class SourceConnectionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    account_id: FinanceId
    provider: str = Field(min_length=1, max_length=50)
    credential_reference: str | None = Field(min_length=1, max_length=2_000)
    permission_scope: list[str] = Field(max_length=50)


class SourceConnectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: FinanceId
    account_id: FinanceId
    provider: str
    permission_scope: list[str]
    status: Literal["disabled", "active", "error", "revoked"]
    last_synced_at: datetime | None
    error_summary: dict[str, object]
    created_at: datetime
    updated_at: datetime


class SourceConnectionMutationResponse(BaseModel):
    source_connection: SourceConnectionResponse
    audit: AuditMetadata


class SourceConnectionListResponse(BaseModel):
    items: list[SourceConnectionResponse]
    page: PageMeta
    completeness: Completeness
    empty_state: EmptyState | None


@router.get("/source-connections", response_model=SourceConnectionListResponse)
async def list_source_connections(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> SourceConnectionListResponse:
    total = int(
        await session.scalar(
            select(func.count(FinanceSourceConnection.id)).where(
                FinanceSourceConnection.user_id == user.id
            )
        )
        or 0
    )
    rows = list(
        (
            await session.scalars(
                select(FinanceSourceConnection)
                .where(FinanceSourceConnection.user_id == user.id)
                .order_by(FinanceSourceConnection.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
        ).all()
    )
    return SourceConnectionListResponse(
        items=[SourceConnectionResponse.model_validate(row) for row in rows],
        page=_page(limit, offset, total),
        completeness=Completeness(is_complete=True, warnings=[], blockers=[]),
        empty_state=(
            _empty(
                "no_finance_sources",
                "No data sources",
                "Connect or import a Finance account to begin.",
                "create_source_connection",
            )
            if total == 0
            else None
        ),
    )


@router.post(
    "/source-connections",
    response_model=SourceConnectionMutationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_source_connection(
    body: SourceConnectionCreate,
    idempotency_key: IdempotencyKey,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> SourceConnectionMutationResponse:
    request = body.model_dump(mode="json")
    await acquire_finance_advisory_lock(
        session, "workflow", user.id, "create_source_connection", idempotency_key
    )
    prior = await prior_idempotent_response(
        session,
        user_id=user.id,
        workflow="create_source_connection",
        key=idempotency_key,
        request=request,
    )
    if prior is not None:
        return SourceConnectionMutationResponse.model_validate(prior)
    account = await session.scalar(
        select(FinanceAccount).where(
            FinanceAccount.id == body.account_id,
            FinanceAccount.user_id == user.id,
        )
    )
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    provider = body.provider.strip().lower()
    await acquire_finance_advisory_lock(session, "source-connection", user.id, account.id, provider)
    duplicate = await session.scalar(
        select(FinanceSourceConnection.id).where(
            FinanceSourceConnection.user_id == user.id,
            FinanceSourceConnection.account_id == account.id,
            FinanceSourceConnection.provider == provider,
        )
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Source connection already exists",
        )
    encrypted_reference = None
    if body.credential_reference is not None:
        try:
            encrypted_reference = encrypt_finance_value(body.credential_reference)
        except (RuntimeError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Finance encryption is not configured",
            ) from exc
    row = FinanceSourceConnection(
        user_id=user.id,
        account_id=account.id,
        provider=provider,
        credential_reference_encrypted=encrypted_reference,
        permission_scope=sorted(set(body.permission_scope)),
        status="disabled",
    )
    session.add(row)
    await session.flush()
    audit = await append_audit_entry(
        session,
        user_id=user.id,
        actor_id=user.id,
        action="source_connection.created",
        entity_type="finance_source_connection",
        entity_id=row.id,
        request=request,
    )
    response = SourceConnectionMutationResponse(
        source_connection=SourceConnectionResponse.model_validate(row),
        audit=_audit_response(audit),
    )
    store_idempotent_response(
        session,
        user_id=user.id,
        workflow="create_source_connection",
        key=idempotency_key,
        request=request,
        response=response.model_dump(mode="json"),
        entity_id=row.id,
        audit_entry_id=audit.id,
    )
    await session.commit()
    return response


class EvidenceResponse(BaseModel):
    id: FinanceId
    file_id: FinanceId
    original_name: str
    media_type: str
    size: int
    sha256: str
    source_kind: str
    captured_at: datetime
    coverage_start: date | None
    coverage_end: date | None
    parser_id: str | None
    parser_version: str | None
    extraction_status: Literal["not_requested", "pending", "complete", "failed"]
    retention_status: Literal["immutable"]
    linked_event_revision_ids: list[FinanceId]
    download_url: str


class EvidenceListResponse(BaseModel):
    items: list[EvidenceResponse]
    page: PageMeta
    completeness: Completeness
    empty_state: EmptyState | None


def _raise_upload_error(exc: FinanceUploadValidationError) -> None:
    status_code = (
        status.HTTP_503_SERVICE_UNAVAILABLE if exc.retryable else status.HTTP_400_BAD_REQUEST
    )
    raise HTTPException(status_code=status_code, detail=exc.detail()) from exc


@router.post(
    "/evidence",
    response_model=EvidenceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_evidence(
    file: Annotated[UploadFile, FormFile()],
    source_kind: Annotated[str, Form(min_length=1, max_length=50)],
    idempotency_key: IdempotencyKey,
    captured_at: Annotated[datetime | None, Form()] = None,
    coverage_start: Annotated[date | None, Form()] = None,
    coverage_end: Annotated[date | None, Form()] = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> EvidenceResponse:
    data = await file.read(max_file_size() + 1)
    request = {
        "filename": file.filename or "untitled",
        "declared_media_type": file.content_type or "",
        "sha256": compute_sha256(data),
        "source_kind": source_kind.strip(),
        "captured_at": captured_at.isoformat() if captured_at else None,
        "coverage_start": coverage_start.isoformat() if coverage_start else None,
        "coverage_end": coverage_end.isoformat() if coverage_end else None,
    }
    await acquire_finance_advisory_lock(
        session, "workflow", user.id, "upload_evidence", idempotency_key
    )
    prior = await prior_idempotent_response(
        session,
        user_id=user.id,
        workflow="upload_evidence",
        key=idempotency_key,
        request=request,
    )
    if prior is not None:
        return EvidenceResponse.model_validate(prior)
    if not source_kind.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="source_kind is required"
        )
    try:
        document, created = await create_evidence_document(
            session,
            user_id=user.id,
            filename=file.filename or "untitled",
            declared_media_type=file.content_type or "",
            data=data,
            source_kind=source_kind,
            captured_at=captured_at,
            coverage_start=coverage_start,
            coverage_end=coverage_end,
            upload_object=upload,
        )
    except FinanceUploadValidationError as exc:
        _raise_upload_error(exc)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Finance evidence storage failed",
        ) from exc
    audit = None
    if created:
        audit = await append_audit_entry(
            session,
            user_id=user.id,
            actor_id=user.id,
            action="evidence.created",
            entity_type="finance_evidence",
            entity_id=document.id,
            request=request,
        )
    response = EvidenceResponse.model_validate(await evidence_response(session, document))
    store_idempotent_response(
        session,
        user_id=user.id,
        workflow="upload_evidence",
        key=idempotency_key,
        request=request,
        response=response.model_dump(mode="json"),
        entity_id=document.id,
        audit_entry_id=audit.id if audit else None,
    )
    await session.commit()
    return response


@router.get("/evidence", response_model=EvidenceListResponse)
async def list_evidence(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> EvidenceListResponse:
    total = int(
        await session.scalar(
            select(func.count(FinanceEvidenceDocument.id)).where(
                FinanceEvidenceDocument.user_id == user.id
            )
        )
        or 0
    )
    documents = list(
        (
            await session.scalars(
                select(FinanceEvidenceDocument)
                .where(FinanceEvidenceDocument.user_id == user.id)
                .order_by(FinanceEvidenceDocument.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
        ).all()
    )
    return EvidenceListResponse(
        items=[
            EvidenceResponse.model_validate(await evidence_response(session, document))
            for document in documents
        ],
        page=_page(limit, offset, total),
        completeness=Completeness(is_complete=True, warnings=[], blockers=[]),
        empty_state=(
            _empty(
                "no_finance_evidence",
                "No evidence",
                "Upload a statement or source file to begin.",
                "upload_evidence",
            )
            if total == 0
            else None
        ),
    )


def _bundle_safe_name(value: str) -> str:
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip()).strip(".-")
    return name or "evidence"


@router.get("/evidence/bundle")
async def download_evidence_bundle(
    tax_year: int = Query(ge=1900, le=2200),
    jurisdiction: Literal["SE", "ES"] | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> StreamingResponse:
    documents = list(
        (
            await session.scalars(
                select(FinanceEvidenceDocument)
                .where(FinanceEvidenceDocument.user_id == user.id)
                .order_by(
                    FinanceEvidenceDocument.source_kind,
                    FinanceEvidenceDocument.original_name,
                    FinanceEvidenceDocument.id,
                )
            )
        ).all()
    )
    year_start = date(tax_year, 1, 1)
    year_end = date(tax_year, 12, 31)
    documents = [
        document
        for document in documents
        if (
            (document.coverage_start is not None or document.coverage_end is not None)
            and (document.coverage_start is None or document.coverage_start <= year_end)
            and (document.coverage_end is None or document.coverage_end >= year_start)
        )
        or (
            document.coverage_start is None
            and document.coverage_end is None
            and document.captured_at.date().year == tax_year
        )
    ]
    if jurisdiction is not None and documents:
        imported_ids = set(
            (
                await session.scalars(
                    select(FinanceImport.evidence_document_id)
                    .join(FinanceAccount, FinanceAccount.id == FinanceImport.account_id)
                    .where(
                        FinanceImport.user_id == user.id,
                        FinanceAccount.user_id == user.id,
                        FinanceAccount.tax_jurisdiction == jurisdiction,
                    )
                )
            ).all()
        )
        linked_ids = set(
            (
                await session.scalars(
                    select(Link.target_id)
                    .join(
                        FinanceEventRevision,
                        FinanceEventRevision.id == Link.source_id,
                    )
                    .join(
                        FinanceAccount,
                        FinanceAccount.id == FinanceEventRevision.source_account_id,
                    )
                    .where(
                        Link.source_type == "finance_event_revision",
                        Link.target_type == "finance_evidence",
                        FinanceEventRevision.user_id == user.id,
                        FinanceAccount.user_id == user.id,
                        FinanceAccount.tax_jurisdiction == jurisdiction,
                    )
                )
            ).all()
        )
        allowed_ids = imported_ids | linked_ids
        documents = [document for document in documents if document.id in allowed_ids]

    files: list[tuple[str, bytes, FinanceEvidenceDocument]] = []
    used_paths: set[str] = set()
    for document in documents:
        data = _download_evidence(user.id, document)
        folder = evidence_bundle_folder(document.source_kind)
        basename = _bundle_safe_name(document.original_name)
        path = f"{folder}/{basename}"
        if path in used_paths:
            path = f"{folder}/{document.id}-{basename}"
        used_paths.add(path)
        files.append((path, data, document))
    files.sort(key=lambda item: item[0])
    manifest = {
        "tax_year": tax_year,
        "jurisdiction": jurisdiction,
        "documents": [
            {
                "path": path,
                "evidence_document_id": document.id,
                "source_kind": document.source_kind,
                "sha256": document.sha256,
                "size": len(data),
            }
            for path, data, document in files
        ],
    }
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        bundle_files = [
            (
                "manifest.json",
                json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode(),
            ),
            *((path, data) for path, data, _ in files),
        ]
        for path, data in bundle_files:
            info = zipfile.ZipInfo(path, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    filename = f"finance-evidence-{jurisdiction or 'all'}-{tax_year}.zip"
    return StreamingResponse(
        iter((output.getvalue(),)),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class ImportMappingOutput(TypedDict, total=False):
    date_column: str
    time_column: str
    amount_column: str
    quantity_column: str
    asset_column: str
    description_column: str
    external_id_column: str
    event_type_column: str
    timezone: str
    date_format: str
    decimal_separator: Literal[".", ","]


class ImportMapping(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        # ponytail: preserve the named optional fields in response OpenAPI even
        # though the wire serializer omits fields whose value is null.
        json_schema_mode_override="validation",
    )

    date_column: str | None = Field(default=None, min_length=1, max_length=255)
    time_column: str | None = Field(default=None, min_length=1, max_length=255)
    amount_column: str | None = Field(default=None, min_length=1, max_length=255)
    quantity_column: str | None = Field(default=None, min_length=1, max_length=255)
    asset_column: str | None = Field(default=None, min_length=1, max_length=255)
    description_column: str | None = Field(default=None, min_length=1, max_length=255)
    external_id_column: str | None = Field(default=None, min_length=1, max_length=255)
    event_type_column: str | None = Field(default=None, min_length=1, max_length=255)
    timezone: str | None = Field(default=None, min_length=1, max_length=63)
    date_format: str | None = Field(default=None, min_length=1, max_length=100)
    decimal_separator: Literal[".", ","] | None = None

    @model_serializer
    def serialize(self) -> ImportMappingOutput:
        return cast(
            ImportMappingOutput,
            {
                name: value
                for name in type(self).model_fields
                if (value := getattr(self, name)) is not None
            },
        )

    def normalized(self) -> dict[str, object]:
        return dict(self.serialize())


class ImportPreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    evidence_document_id: FinanceId
    account_id: FinanceId
    parser_id: ParserId
    parser_version: str = Field(min_length=1, max_length=50)
    import_mode: ImportMode
    mapping: ImportMapping


class ImportPreviewResponse(BaseModel):
    import_id: FinanceId
    status: Literal["previewed"]
    parser_id: str
    parser_version: str
    import_fingerprint: str
    coverage_start: date | None
    coverage_end: date | None
    columns: list[str]
    sample_rows: list[dict[str, str | None]]
    expected_record_count: int
    duplicate_file: bool
    duplicate_record_count: int
    rejected_record_count: int
    rejected_rows: list[dict[str, str]]
    mapping: ImportMapping
    warnings: list[FinanceWarning]
    source_format: Literal["csv", "pdf"] = "csv"
    unparsed_line_count: int = 0
    rows: list[dict[str, object]] = Field(default_factory=list)


def _effective_import_mapping(parser_id: ParserId, mapping: dict[str, object]) -> dict[str, object]:
    if parser_id != "pdf_statement":
        return mapping
    return {
        "date_column": "date",
        "amount_column": "amount",
        "description_column": "description",
        "timezone": mapping.get("timezone", "UTC"),
        "date_format": "%Y-%m-%d",
        "decimal_separator": ".",
    }


async def _owned_import_inputs(
    session: AsyncSession,
    *,
    user_id: str,
    account_id: str,
    evidence_id: str,
) -> tuple[FinanceAccount, FinanceEvidenceDocument]:
    account = await session.scalar(
        select(FinanceAccount).where(
            FinanceAccount.id == account_id,
            FinanceAccount.user_id == user_id,
        )
    )
    evidence = await session.scalar(
        select(FinanceEvidenceDocument).where(
            FinanceEvidenceDocument.id == evidence_id,
            FinanceEvidenceDocument.user_id == user_id,
        )
    )
    if account is None or evidence is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Import source not found")
    return account, evidence


def _parser_accepts(parser_id: ParserId, media_type: str) -> bool:
    return {
        "csv": media_type == "text/csv",
        "json": media_type == "application/json",
        "pdf_statement": media_type == "application/pdf",
        "pdf_metadata": media_type == "application/pdf",
        "image_metadata": media_type in {"image/png", "image/jpeg", "image/webp"},
        "archive_manifest": media_type in {"application/zip", "application/x-tar"},
    }[parser_id]


def _download_evidence(user_id: str, evidence: FinanceEvidenceDocument) -> bytes:
    try:
        data, _ = download(user_id, evidence.file_id)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Finance evidence could not be read",
        ) from exc
    if compute_sha256(data) != evidence.sha256:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "hash_mismatch",
                "message": "Finance evidence no longer matches its immutable hash",
                "retryable": False,
            },
        )
    return data


@router.post("/imports/preview", response_model=ImportPreviewResponse)
async def create_import_preview(
    body: ImportPreviewRequest,
    idempotency_key: IdempotencyKey,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ImportPreviewResponse:
    request = body.model_dump(mode="json")
    await acquire_finance_advisory_lock(
        session, "workflow", user.id, "preview_import", idempotency_key
    )
    prior = await prior_idempotent_response(
        session,
        user_id=user.id,
        workflow="preview_import",
        key=idempotency_key,
        request=request,
    )
    if prior is not None:
        return ImportPreviewResponse.model_validate(prior)
    _, evidence = await _owned_import_inputs(
        session,
        user_id=user.id,
        account_id=body.account_id,
        evidence_id=body.evidence_document_id,
    )
    if not _parser_accepts(body.parser_id, evidence.media_type):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Parser does not support this evidence type",
        )
    data = _download_evidence(user.id, evidence)
    mapping = _effective_import_mapping(body.parser_id, body.mapping.normalized())
    try:
        row, preview, created = await preview_import(
            session,
            user_id=user.id,
            account_id=body.account_id,
            evidence=evidence,
            data=data,
            parser_id=body.parser_id,
            parser_version=body.parser_version,
            import_mode=body.import_mode,
            mapping=mapping,
        )
    except FinanceImportError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    audit = None
    if created:
        audit = await append_audit_entry(
            session,
            user_id=user.id,
            actor_id=user.id,
            action="import.previewed",
            entity_type="finance_import",
            entity_id=row.id,
            request=request,
        )
    response = ImportPreviewResponse.model_validate(preview)
    store_idempotent_response(
        session,
        user_id=user.id,
        workflow="preview_import",
        key=idempotency_key,
        request=request,
        response=response.model_dump(mode="json"),
        entity_id=row.id,
        audit_entry_id=audit.id if audit else None,
    )
    await session.commit()
    return response


class PdfRowOverride(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, populate_by_name=True)

    source_index: str = Field(min_length=1, max_length=100)
    transaction_date: date | None = Field(default=None, alias="date")
    description: str | None = Field(default=None, max_length=2_000)
    amount: Annotated[str, Field(pattern=r"^-?[0-9]+(\.[0-9]+)?$")] | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)

    @field_validator("currency")
    @classmethod
    def uppercase_currency(cls, value: str | None) -> str | None:
        return value.upper() if value is not None else None


class ImportCommitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mapping: ImportMapping
    confirm_warnings: list[str]
    row_overrides: list[PdfRowOverride] = Field(default_factory=list)
    excluded_source_indexes: list[str] = Field(default_factory=list, max_length=100_000)


ImportStatus = Literal[
    "previewed", "committed", "committed_with_rejections", "reprocessed", "failed"
]


class ImportCommitResponse(BaseModel):
    import_id: FinanceId
    status: ImportStatus
    raw_record_count: int
    created_event_count: int
    duplicate_record_count: int
    rejected_record_count: int
    raw_record_ids: list[FinanceId]
    event_revision_ids: list[FinanceId]
    review_group_ids: list[FinanceId]
    audit: AuditMetadata


@router.post("/imports/{import_id}/commit", response_model=ImportCommitResponse)
async def commit_import(
    import_id: FinanceIdPath,
    body: ImportCommitRequest,
    idempotency_key: IdempotencyKey,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ImportCommitResponse:
    request = {"import_id": import_id, **body.model_dump(mode="json")}
    await acquire_finance_advisory_lock(
        session, "workflow", user.id, "commit_import", idempotency_key
    )
    prior = await prior_idempotent_response(
        session,
        user_id=user.id,
        workflow="commit_import",
        key=idempotency_key,
        request=request,
    )
    if prior is not None:
        return ImportCommitResponse.model_validate(prior)
    import_row = await session.scalar(
        select(FinanceImport)
        .where(
            FinanceImport.id == import_id,
            FinanceImport.user_id == user.id,
        )
        .with_for_update()
    )
    if import_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Import not found")
    parser_id = cast(ParserId, import_row.parser_id)
    mapping = _effective_import_mapping(parser_id, body.mapping.normalized())
    if mapping != import_row.mapping:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Import mapping differs from the immutable preview",
        )
    if parser_id != "pdf_statement" and (body.row_overrides or body.excluded_source_indexes):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Row corrections are only supported for PDF statement imports",
        )
    warning_codes = {
        str(item["code"])
        for item in cast(list[dict[str, object]], import_row.preview.get("warnings", []))
        if item.get("severity") in {"warning", "blocking"}
    }
    if not warning_codes.issubset(set(body.confirm_warnings)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Import warnings must be confirmed before commit",
        )
    evidence = await session.scalar(
        select(FinanceEvidenceDocument).where(
            FinanceEvidenceDocument.id == import_row.evidence_document_id,
            FinanceEvidenceDocument.user_id == user.id,
        )
    )
    account = await session.scalar(
        select(FinanceAccount).where(
            FinanceAccount.id == import_row.account_id,
            FinanceAccount.user_id == user.id,
        )
    )
    if evidence is None or account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Import source not found")
    data = _download_evidence(user.id, evidence)
    try:
        plan = await commit_raw_records(
            session,
            import_row=import_row,
            data=data,
            mapping=mapping,
            provider=account.provider,
            row_overrides=tuple(
                item.model_dump(mode="json", exclude_none=True, by_alias=True)
                for item in body.row_overrides
            ),
            excluded_source_indexes=tuple(body.excluded_source_indexes),
        )
        projection = await project_import_records(
            session,
            import_row=import_row,
            account=account,
            records=plan.accepted_records,
        )
    except FinanceImportError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if projection.created_event_revision_ids:
        for asset in projection.created_assets:
            await append_audit_entry(
                session,
                user_id=user.id,
                actor_id=user.id,
                action="asset.created_from_import",
                entity_type="finance_asset",
                entity_id=asset.id,
                request={"import_id": import_row.id, "asset_id": asset.id},
            )
        revisions = list(
            (
                await session.scalars(
                    select(FinanceEventRevision).where(
                        FinanceEventRevision.user_id == user.id,
                        FinanceEventRevision.id.in_(projection.created_event_revision_ids),
                    )
                )
            ).all()
        )
        for revision in revisions:
            await append_audit_entry(
                session,
                user_id=user.id,
                actor_id=user.id,
                action="event.proposed",
                entity_type="finance_event",
                entity_id=revision.event_id,
                request={"import_id": import_row.id, "revision_id": revision.id},
                new_revision_id=revision.id,
            )
    import_audit_action = (
        "import.reprocessed" if import_row.import_mode == "reprocess" else "import.committed"
    )
    audit = await session.scalar(
        select(FinanceAuditEntry).where(
            FinanceAuditEntry.user_id == user.id,
            FinanceAuditEntry.entity_type == "finance_import",
            FinanceAuditEntry.entity_id == import_row.id,
            FinanceAuditEntry.action == import_audit_action,
        )
    )
    if audit is None:
        audit = await append_audit_entry(
            session,
            user_id=user.id,
            actor_id=user.id,
            action=import_audit_action,
            entity_type="finance_import",
            entity_id=import_row.id,
            request=request,
        )
    response = ImportCommitResponse(
        import_id=import_row.id,
        status=cast(ImportStatus, import_row.status),
        raw_record_count=len(plan.records),
        created_event_count=(
            len(projection.created_event_revision_ids)
            if import_row.import_mode == "reprocess"
            else len(projection.event_revision_ids)
        ),
        duplicate_record_count=plan.duplicate_record_count,
        rejected_record_count=plan.rejected_record_count,
        raw_record_ids=[record.id for record in plan.records],
        event_revision_ids=list(projection.event_revision_ids),
        review_group_ids=list(projection.review_group_ids),
        audit=_audit_response(audit),
    )
    store_idempotent_response(
        session,
        user_id=user.id,
        workflow="commit_import",
        key=idempotency_key,
        request=request,
        response=response.model_dump(mode="json"),
        entity_id=import_row.id,
        audit_entry_id=audit.id,
    )
    await session.commit()
    return response


class ImportSummary(BaseModel):
    id: FinanceId
    account_id: FinanceId
    evidence_document_id: FinanceId
    parser_id: str
    parser_version: str
    import_mode: ImportMode
    import_fingerprint: str
    status: ImportStatus
    coverage_start: date | None
    coverage_end: date | None
    mapping: dict[str, object]
    error_summary: dict[str, object]
    created_at: datetime
    committed_at: datetime | None


class ImportListResponse(BaseModel):
    items: list[ImportSummary]
    page: PageMeta
    completeness: Completeness
    empty_state: EmptyState | None


def _import_summary(row: FinanceImport) -> ImportSummary:
    return ImportSummary(
        id=row.id,
        account_id=row.account_id,
        evidence_document_id=row.evidence_document_id,
        parser_id=row.parser_id,
        parser_version=row.parser_version,
        import_mode=cast(ImportMode, row.import_mode),
        import_fingerprint=row.import_fingerprint,
        status=cast(ImportStatus, row.status),
        coverage_start=row.coverage_start,
        coverage_end=row.coverage_end,
        mapping=row.mapping,
        error_summary=row.error_summary,
        created_at=row.created_at,
        committed_at=row.committed_at,
    )


@router.get("/imports", response_model=ImportListResponse)
async def list_imports(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ImportListResponse:
    total = int(
        await session.scalar(
            select(func.count(FinanceImport.id)).where(FinanceImport.user_id == user.id)
        )
        or 0
    )
    rows = list(
        (
            await session.scalars(
                select(FinanceImport)
                .where(FinanceImport.user_id == user.id)
                .order_by(FinanceImport.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
        ).all()
    )
    return ImportListResponse(
        items=[_import_summary(row) for row in rows],
        page=_page(limit, offset, total),
        completeness=Completeness(is_complete=True, warnings=[], blockers=[]),
        empty_state=(
            _empty(
                "no_finance_imports",
                "No imports",
                "Preview a Finance source file to begin.",
                "preview_import",
            )
            if total == 0
            else None
        ),
    )


class RawRecordResponse(BaseModel):
    id: FinanceId
    import_id: FinanceId
    source_index: str
    provider_external_id: str | None
    record_fingerprint: str
    semantic_fingerprint: str | None
    original_payload: dict[str, object]
    extracted_payload: dict[str, object] | None
    source_timestamp: datetime | None
    source_timezone: str | None
    rejection_code: str | None
    rejection_reason: str | None
    created_at: datetime


class RawRecordListResponse(BaseModel):
    items: list[RawRecordResponse]
    page: PageMeta
    completeness: Completeness
    empty_state: EmptyState | None


@router.get("/imports/{import_id}/raw-records", response_model=RawRecordListResponse)
async def list_raw_records(
    import_id: FinanceIdPath,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> RawRecordListResponse:
    import_row = await session.scalar(
        select(FinanceImport.id).where(
            FinanceImport.id == import_id,
            FinanceImport.user_id == user.id,
        )
    )
    if import_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Import not found")
    total = int(
        await session.scalar(
            select(func.count(FinanceRawRecord.id)).where(
                FinanceRawRecord.user_id == user.id,
                FinanceRawRecord.import_id == import_id,
            )
        )
        or 0
    )
    rows = list(
        (
            await session.scalars(
                select(FinanceRawRecord)
                .where(
                    FinanceRawRecord.user_id == user.id,
                    FinanceRawRecord.import_id == import_id,
                )
                .order_by(FinanceRawRecord.created_at, FinanceRawRecord.source_index)
                .limit(limit)
                .offset(offset)
            )
        ).all()
    )
    return RawRecordListResponse(
        items=[RawRecordResponse.model_validate(row, from_attributes=True) for row in rows],
        page=_page(limit, offset, total),
        completeness=Completeness(is_complete=True, warnings=[], blockers=[]),
        empty_state=(
            _empty(
                "no_raw_records",
                "No raw records",
                "Commit the import to preserve its source rows.",
                "commit_import",
            )
            if total == 0
            else None
        ),
    )
