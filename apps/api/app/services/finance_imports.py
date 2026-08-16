"""Deterministic Finance import parsing, fingerprinting and raw-record planning."""

from __future__ import annotations

import csv
import io
import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Literal, cast
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FinanceEvidenceDocument, FinanceImport, FinanceRawRecord, Link
from app.services.finance_core import canonical_json, hash_payload
from app.services.finance_evidence import (
    ArchiveMember,
    acquire_finance_advisory_lock,
    compute_sha256,
    image_dimensions,
    inspect_archive,
)
from app.services.finance_pdf_statements import parse_pdf_statement

ParserId = Literal[
    "csv",
    "json",
    "pdf_statement",
    "pdf_metadata",
    "image_metadata",
    "archive_manifest",
]
ImportMode = Literal["normal", "reprocess"]
MAX_IMPORT_RECORDS = 100_000

CANONICAL_EVENT_TYPES = {
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
}

_MAPPING_FIELDS = {
    "date_column",
    "time_column",
    "amount_column",
    "quantity_column",
    "asset_column",
    "description_column",
    "external_id_column",
    "event_type_column",
    "timezone",
    "date_format",
    "decimal_separator",
}


class FinanceImportError(ValueError):
    pass


@dataclass(frozen=True)
class SourceRow:
    source_index: str
    original_payload: dict[str, object]


@dataclass(frozen=True)
class ParsedRecord:
    source_index: str
    original_payload: dict[str, object]
    extracted_payload: dict[str, object] | None
    source_timestamp: datetime | None
    source_timezone: str | None
    provider_external_id: str | None
    row_fingerprint: str
    semantic_fingerprint: str | None
    rejection_code: str | None
    rejection_reason: str | None


@dataclass(frozen=True)
class ParsedSource:
    columns: tuple[str, ...]
    rows: tuple[SourceRow, ...]
    warnings: tuple[dict[str, object], ...] = ()
    unparsed_line_count: int = 0


@dataclass(frozen=True)
class RawCommitPlan:
    records: tuple[FinanceRawRecord, ...]
    accepted_records: tuple[FinanceRawRecord, ...]
    duplicate_record_count: int
    rejected_record_count: int
    already_committed: bool


def file_fingerprint(data: bytes) -> str:
    return compute_sha256(data)


def row_fingerprint(payload: dict[str, object]) -> str:
    return hash_payload(payload)


def provider_fingerprint(provider: str, external_id: str) -> str:
    return hash_payload(
        {
            "provider": _normalized_text(provider).lower(),
            "external_id": _normalized_text(external_id),
        }
    )


def _scoped_provider_identity(account_id: str, provider: str, external_id: str) -> str:
    provider_name = _normalized_text(provider).lower()
    normalized_external_id = _normalized_text(external_id)
    identity = f"{account_id}:{provider_name}:{normalized_external_id}"
    if len(identity) <= 255:
        return identity
    # ponytail: retain the readable account/provider scope while bounding an untrusted ID to the
    # existing column width; the original external ID remains in extracted_payload.
    return f"{account_id}:{provider_name}:sha256:{compute_sha256(normalized_external_id.encode())}"


def import_fingerprint(
    *,
    content_sha256: str,
    account_id: str,
    parser_id: ParserId,
    parser_version: str,
    import_mode: ImportMode,
    mapping: dict[str, object],
) -> str:
    return hash_payload(
        {
            "content_sha256": content_sha256,
            "account_id": account_id,
            "parser_id": parser_id,
            "parser_version": parser_version,
            "import_mode": import_mode,
            "mapping": normalize_mapping(mapping),
        }
    )


def semantic_fingerprint(
    extracted: dict[str, object], *, account_id: str | None = None
) -> str | None:
    semantic_fields = {
        key: extracted.get(key)
        for key in (
            "effective_at",
            "amount",
            "quantity",
            "asset",
            "event_type",
            "description",
        )
        if extracted.get(key) not in (None, "")
    }
    if account_id is not None:
        semantic_fields["account_id"] = account_id
    return hash_payload(semantic_fields) if semantic_fields else None


def normalize_mapping(mapping: dict[str, object]) -> dict[str, object]:
    unknown = set(mapping) - _MAPPING_FIELDS
    if unknown:
        raise FinanceImportError(f"Unsupported mapping fields: {', '.join(sorted(unknown))}")
    normalized: dict[str, object] = {}
    for key in sorted(mapping):
        value = mapping[key]
        if value is None:
            continue
        if not isinstance(value, str):
            raise FinanceImportError(f"Mapping field {key} must be a string")
        stripped = value.strip()
        if stripped:
            normalized[key] = stripped
    separator = normalized.get("decimal_separator", ".")
    if separator not in {".", ","}:
        raise FinanceImportError("decimal_separator must be '.' or ','")
    return normalized


def _normalized_text(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value)).strip()
    return re.sub(r"\s+", " ", text)


def _json_scalar(value: object) -> object:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return canonical_json(value)


def _parse_csv(data: bytes) -> ParsedSource:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise FinanceImportError("CSV source must be UTF-8") from exc
    try:
        reader = csv.DictReader(io.StringIO(text), strict=True)
        if reader.fieldnames is None:
            raise FinanceImportError("CSV source needs a header row")
        source_columns = tuple(reader.fieldnames)
        columns = tuple(value.strip() for value in source_columns)
        if any(not column for column in columns) or len(set(columns)) != len(columns):
            raise FinanceImportError("CSV headers must be non-empty and unique")
        rows: list[SourceRow] = []
        for line_number, raw in enumerate(reader, start=2):
            if len(rows) >= MAX_IMPORT_RECORDS:
                raise FinanceImportError("Finance source contains too many records")
            if None in raw:
                rows.append(
                    SourceRow(
                        source_index=str(line_number),
                        original_payload={
                            **{str(key): value for key, value in raw.items() if key is not None},
                            "_extra_values": cast(list[str], raw[None]),
                        },
                    )
                )
                continue
            rows.append(
                SourceRow(
                    source_index=str(line_number),
                    original_payload={
                        column: raw.get(source_column)
                        for source_column, column in zip(source_columns, columns, strict=True)
                    },
                )
            )
    except csv.Error as exc:
        raise FinanceImportError("CSV source is malformed") from exc
    return ParsedSource(columns=columns, rows=tuple(rows))


def _parse_json(data: bytes) -> ParsedSource:
    try:
        decoded = json.loads(data.decode("utf-8-sig"), parse_float=str, parse_int=str)
    except (UnicodeDecodeError, json.JSONDecodeError, RecursionError) as exc:
        raise FinanceImportError("JSON source is malformed") from exc
    if isinstance(decoded, dict) and isinstance(decoded.get("records"), list):
        decoded = decoded["records"]
    if not isinstance(decoded, list):
        raise FinanceImportError("JSON source must be an array or an object with a records array")
    if len(decoded) > MAX_IMPORT_RECORDS:
        raise FinanceImportError("Finance source contains too many records")
    rows: list[SourceRow] = []
    ordered_columns: dict[str, None] = {}
    for index, item in enumerate(decoded):
        if not isinstance(item, dict) or not all(isinstance(key, str) for key in item):
            payload: dict[str, object] = {"_value": _json_scalar(item)}
        else:
            payload = {key: _json_scalar(value) for key, value in item.items()}
        ordered_columns.update({key: None for key in payload})
        rows.append(SourceRow(source_index=str(index), original_payload=payload))
    return ParsedSource(columns=tuple(ordered_columns), rows=tuple(rows))


def _parse_pdf_metadata(data: bytes) -> ParsedSource:
    header_match = re.match(rb"%PDF-([0-9]+\.[0-9]+)", data)
    if header_match is None:
        raise FinanceImportError("PDF source is malformed")
    page_count = len(re.findall(rb"/Type\s*/Page(?!s)\b", data))
    payload: dict[str, object] = {
        "document_sha256": compute_sha256(data),
        "pdf_version": header_match.group(1).decode("ascii"),
        "page_count": str(page_count),
        "size": str(len(data)),
    }
    return ParsedSource(
        columns=tuple(payload),
        rows=(SourceRow(source_index="document", original_payload=payload),),
        warnings=(_warning("metadata_only_parser", "PDF metadata does not create ledger events"),),
    )


def _parse_pdf_statement(data: bytes, extracted_text: str | None) -> ParsedSource:
    try:
        parsed = parse_pdf_statement(data, extracted_text=extracted_text)
    except ValueError as exc:
        raise FinanceImportError(str(exc)) from exc
    warnings = (
        (
            _warning(
                "pdf_unparsed_lines",
                f"{parsed.unparsed_line_count} statement lines could not be parsed",
                "warning",
            ),
        )
        if parsed.unparsed_line_count
        else ()
    )
    return ParsedSource(
        columns=("date", "description", "amount", "currency", "confidence", "source_line"),
        rows=tuple(
            SourceRow(source_index=row.source_index, original_payload=row.payload())
            for row in parsed.rows
        ),
        warnings=warnings,
        unparsed_line_count=parsed.unparsed_line_count,
    )


def _parse_image_metadata(data: bytes) -> ParsedSource:
    media_type: str
    dimensions = image_dimensions(data)
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        media_type = "image/png"
    elif data.startswith(b"\xff\xd8"):
        media_type = "image/jpeg"
    elif data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        media_type = "image/webp"
    else:
        raise FinanceImportError("Image source is malformed")
    payload: dict[str, object] = {
        "document_sha256": compute_sha256(data),
        "media_type": media_type,
        "size": str(len(data)),
        "width": str(dimensions[0]) if dimensions else None,
        "height": str(dimensions[1]) if dimensions else None,
    }
    return ParsedSource(
        columns=tuple(payload),
        rows=(SourceRow(source_index="image", original_payload=payload),),
        warnings=(
            _warning("metadata_only_parser", "Image metadata does not create ledger events"),
        ),
    )


def _archive_payload(member: ArchiveMember) -> dict[str, object]:
    return dict(member.as_dict())


def _parse_archive_manifest(data: bytes) -> ParsedSource:
    media_type = "application/zip" if data.startswith(b"PK") else "application/x-tar"
    members = inspect_archive(data, media_type)
    rows = tuple(
        SourceRow(source_index=str(index), original_payload=_archive_payload(member))
        for index, member in enumerate(members)
    )
    columns = ("path", "size", "compressed_size", "is_directory")
    return ParsedSource(
        columns=columns,
        rows=rows,
        warnings=(
            _warning("metadata_only_parser", "Archive manifests do not create ledger events"),
        ),
    )


def parse_source(
    data: bytes, parser_id: ParserId, *, extracted_text: str | None = None
) -> ParsedSource:
    if parser_id == "pdf_statement":
        return _parse_pdf_statement(data, extracted_text)
    parsers = {
        "csv": _parse_csv,
        "json": _parse_json,
        "pdf_metadata": _parse_pdf_metadata,
        "image_metadata": _parse_image_metadata,
        "archive_manifest": _parse_archive_manifest,
    }
    source = parsers[parser_id](data)
    if extracted_text is None or parser_id not in {"pdf_metadata", "image_metadata"}:
        return source
    payload = dict(source.rows[0].original_payload)
    payload.update(
        {
            "extracted_text_sha256": compute_sha256(extracted_text.encode()),
            "extracted_text_characters": str(len(extracted_text)),
            "text_excerpt": extracted_text[:4_000],
        }
    )
    return ParsedSource(
        columns=tuple(payload),
        rows=(SourceRow(source_index=source.rows[0].source_index, original_payload=payload),),
        warnings=source.warnings,
    )


def _evidence_extracted_text(evidence: FinanceEvidenceDocument) -> str | None:
    value = evidence.attributes.get("extracted_text")
    return value if isinstance(value, str) else None


def _mapped_value(row: SourceRow, mapping: dict[str, object], key: str) -> object | None:
    column = mapping.get(key)
    return row.original_payload.get(str(column)) if column else None


def _decimal_value(value: object, separator: str) -> str:
    normalized = _normalized_text(value).replace(" ", "")
    if separator == ",":
        normalized = normalized.replace(".", "").replace(",", ".")
    try:
        parsed = Decimal(normalized)
    except InvalidOperation as exc:
        raise FinanceImportError("Mapped decimal value is invalid") from exc
    if not parsed.is_finite():
        raise FinanceImportError("Mapped decimal value must be finite")
    return format(parsed, "f")


def _timestamp_value(
    row: SourceRow, mapping: dict[str, object]
) -> tuple[datetime | None, str | None]:
    raw_date = _mapped_value(row, mapping, "date_column")
    if raw_date in (None, ""):
        return None, cast(str | None, mapping.get("timezone"))
    raw_time = _mapped_value(row, mapping, "time_column")
    text = _normalized_text(raw_date)
    if raw_time not in (None, ""):
        text = f"{text} {_normalized_text(raw_time)}"
    date_format = mapping.get("date_format")
    try:
        parsed = (
            datetime.strptime(text, str(date_format))
            if date_format
            else datetime.fromisoformat(text.replace("Z", "+00:00"))
        )
    except ValueError as exc:
        raise FinanceImportError("Mapped date/time value is invalid") from exc
    timezone_name = cast(str | None, mapping.get("timezone"))
    mapped_timezone: ZoneInfo | None = None
    if timezone_name is not None:
        try:
            mapped_timezone = ZoneInfo(timezone_name)
        except ZoneInfoNotFoundError as exc:
            raise FinanceImportError("Mapping timezone is invalid") from exc
    if parsed.tzinfo is None:
        if mapped_timezone is None:
            raise FinanceImportError("Naive timestamps need a mapping timezone")
        parsed = parsed.replace(tzinfo=mapped_timezone)
    if timezone_name is None:
        offset = parsed.utcoffset() or timedelta(0)
        if offset == timedelta(0):
            timezone_name = "UTC"
        else:
            total_minutes = int(offset.total_seconds() // 60)
            sign = "+" if total_minutes >= 0 else "-"
            hours, minutes = divmod(abs(total_minutes), 60)
            timezone_name = f"{sign}{hours:02d}:{minutes:02d}"
    return parsed.astimezone(UTC), timezone_name


def _fixed_offset(value: str) -> timezone | None:
    match = re.fullmatch(r"([+-])(\d{2}):(\d{2})", value)
    if match is None:
        return None
    hours, minutes = int(match.group(2)), int(match.group(3))
    if hours > 23 or minutes > 59:
        return None
    offset = timedelta(hours=hours, minutes=minutes)
    return timezone(offset if match.group(1) == "+" else -offset)


def _source_date(record: ParsedRecord) -> date | None:
    if record.source_timestamp is None:
        return None
    timezone_name = record.source_timezone or "UTC"
    fixed = _fixed_offset(timezone_name)
    try:
        source_timezone = fixed or ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        return record.source_timestamp.date()
    return record.source_timestamp.astimezone(source_timezone).date()


def _parse_record(
    row: SourceRow,
    mapping: dict[str, object],
    *,
    account_id: str | None,
    metadata_only: bool,
) -> ParsedRecord:
    row_hash = row_fingerprint(row.original_payload)
    if "_extra_values" in row.original_payload:
        return ParsedRecord(
            source_index=row.source_index,
            original_payload=row.original_payload,
            extracted_payload=None,
            source_timestamp=None,
            source_timezone=None,
            provider_external_id=None,
            row_fingerprint=row_hash,
            semantic_fingerprint=None,
            rejection_code="malformed_row",
            rejection_reason="Row contains more values than the CSV header",
        )
    if "_value" in row.original_payload and not metadata_only:
        return ParsedRecord(
            source_index=row.source_index,
            original_payload=row.original_payload,
            extracted_payload=None,
            source_timestamp=None,
            source_timezone=None,
            provider_external_id=None,
            row_fingerprint=row_hash,
            semantic_fingerprint=None,
            rejection_code="malformed_row",
            rejection_reason="JSON transaction records must be objects",
        )
    if metadata_only:
        return ParsedRecord(
            source_index=row.source_index,
            original_payload=row.original_payload,
            extracted_payload=dict(row.original_payload),
            source_timestamp=None,
            source_timezone=None,
            provider_external_id=None,
            row_fingerprint=row_hash,
            semantic_fingerprint=None,
            rejection_code=None,
            rejection_reason=None,
        )
    try:
        timestamp, timezone_name = _timestamp_value(row, mapping)
        extracted: dict[str, object] = {}
        if timestamp is not None:
            extracted["effective_at"] = timestamp.isoformat()
        separator = str(mapping.get("decimal_separator", "."))
        for mapping_key, target in (("amount_column", "amount"), ("quantity_column", "quantity")):
            value = _mapped_value(row, mapping, mapping_key)
            if value not in (None, ""):
                extracted[target] = _decimal_value(value, separator)
        for mapping_key, target in (
            ("asset_column", "asset"),
            ("description_column", "description"),
            ("event_type_column", "event_type"),
        ):
            value = _mapped_value(row, mapping, mapping_key)
            if value not in (None, ""):
                extracted[target] = _normalized_text(value)
        if timestamp is None:
            raise FinanceImportError("Transaction records require a mapped date/time")
        if extracted.get("amount") is None and extracted.get("quantity") is None:
            raise FinanceImportError("Transaction records require a mapped amount or quantity")
        event_type = extracted.get("event_type")
        if event_type is not None:
            normalized_event_type = str(event_type).lower()
            if normalized_event_type not in CANONICAL_EVENT_TYPES:
                raise FinanceImportError("Mapped event type is unsupported")
            extracted["event_type"] = normalized_event_type
        external_id_value = _mapped_value(row, mapping, "external_id_column")
        external_id = (
            _normalized_text(external_id_value) if external_id_value not in (None, "") else None
        )
        if external_id is not None:
            extracted["provider_external_id"] = external_id
        return ParsedRecord(
            source_index=row.source_index,
            original_payload=row.original_payload,
            extracted_payload=extracted,
            source_timestamp=timestamp,
            source_timezone=timezone_name,
            provider_external_id=external_id,
            row_fingerprint=row_hash,
            semantic_fingerprint=semantic_fingerprint(extracted, account_id=account_id),
            rejection_code=None,
            rejection_reason=None,
        )
    except FinanceImportError as exc:
        return ParsedRecord(
            source_index=row.source_index,
            original_payload=row.original_payload,
            extracted_payload=None,
            source_timestamp=None,
            source_timezone=cast(str | None, mapping.get("timezone")),
            provider_external_id=None,
            row_fingerprint=row_hash,
            semantic_fingerprint=None,
            rejection_code="mapping_error",
            rejection_reason=str(exc),
        )


def parse_records(
    source: ParsedSource,
    mapping: dict[str, object],
    *,
    account_id: str | None = None,
    parser_id: ParserId,
) -> tuple[ParsedRecord, ...]:
    normalized_mapping = normalize_mapping(mapping)
    mapped_columns = {
        str(value) for key, value in normalized_mapping.items() if key.endswith("_column")
    }
    missing_columns = mapped_columns - set(source.columns)
    if missing_columns:
        raise FinanceImportError(
            f"Mapped columns are missing: {', '.join(sorted(missing_columns))}"
        )
    metadata_only = parser_id in {"pdf_metadata", "image_metadata", "archive_manifest"}
    if not metadata_only:
        if "date_column" not in normalized_mapping:
            raise FinanceImportError("Transaction imports require date_column")
        if not {"amount_column", "quantity_column"}.intersection(normalized_mapping):
            raise FinanceImportError("Transaction imports require amount_column or quantity_column")
    return tuple(
        _parse_record(
            row,
            normalized_mapping,
            account_id=account_id,
            metadata_only=metadata_only,
        )
        for row in source.rows
    )


def _sample_value(value: object) -> str | None:
    if value is None:
        return None
    return value if isinstance(value, str) else canonical_json(value)


def _warning(code: str, message: str, severity: str = "info") -> dict[str, object]:
    return {
        "code": code,
        "severity": severity,
        "message": message,
        "entity_type": None,
        "entity_id": None,
    }


def build_import_preview(
    *,
    import_id: str,
    data: bytes,
    account_id: str,
    parser_id: ParserId,
    parser_version: str,
    import_mode: ImportMode,
    mapping: dict[str, object],
    duplicate_file: bool = False,
    duplicate_record_count: int = 0,
    extracted_text: str | None = None,
) -> dict[str, object]:
    source = parse_source(data, parser_id, extracted_text=extracted_text)
    normalized_mapping = normalize_mapping(mapping)
    records = parse_records(source, normalized_mapping, account_id=account_id, parser_id=parser_id)
    coverage_dates = [value for record in records if (value := _source_date(record)) is not None]
    rejected = [record for record in records if record.rejection_code]
    warnings = list(source.warnings)
    if duplicate_file:
        warnings.append(
            _warning("duplicate_file", "This source file was imported before", "warning")
        )
    preview: dict[str, object] = {
        "import_id": import_id,
        "status": "previewed",
        "parser_id": parser_id,
        "parser_version": parser_version,
        "import_fingerprint": import_fingerprint(
            content_sha256=compute_sha256(data),
            account_id=account_id,
            parser_id=parser_id,
            parser_version=parser_version,
            import_mode=import_mode,
            mapping=normalized_mapping,
        ),
        "coverage_start": min(coverage_dates).isoformat() if coverage_dates else None,
        "coverage_end": max(coverage_dates).isoformat() if coverage_dates else None,
        "columns": list(source.columns),
        "sample_rows": [
            {key: _sample_value(row.original_payload.get(key)) for key in source.columns}
            for row in source.rows[:10]
        ],
        "expected_record_count": len(records),
        "duplicate_file": duplicate_file,
        "duplicate_record_count": duplicate_record_count,
        "rejected_record_count": len(rejected),
        "rejected_rows": [
            {
                "source_index": record.source_index,
                "code": cast(str, record.rejection_code),
                "message": cast(str, record.rejection_reason),
            }
            for record in rejected
        ],
        "mapping": normalized_mapping,
        "warnings": warnings,
        "source_format": "pdf" if parser_id == "pdf_statement" else "csv",
        "unparsed_line_count": source.unparsed_line_count,
        "rows": (
            [{"source_index": row.source_index, **row.original_payload} for row in source.rows]
            if parser_id == "pdf_statement"
            else []
        ),
    }
    return preview


async def preview_import(
    session: AsyncSession,
    *,
    user_id: str,
    account_id: str,
    evidence: FinanceEvidenceDocument,
    data: bytes,
    parser_id: ParserId,
    parser_version: str,
    import_mode: ImportMode,
    mapping: dict[str, object],
) -> tuple[FinanceImport, dict[str, object], bool]:
    """Persist immutable preview provenance; identical previews return the prior row."""
    normalized_mapping = normalize_mapping(mapping)
    fingerprint = import_fingerprint(
        content_sha256=evidence.sha256,
        account_id=account_id,
        parser_id=parser_id,
        parser_version=parser_version,
        import_mode=import_mode,
        mapping=normalized_mapping,
    )
    await acquire_finance_advisory_lock(session, "import-preview", user_id, fingerprint)
    existing = await session.scalar(
        select(FinanceImport).where(
            FinanceImport.user_id == user_id,
            FinanceImport.import_fingerprint == fingerprint,
        )
    )
    if existing is not None:
        return existing, existing.preview, False
    duplicate_file = bool(
        await session.scalar(
            select(FinanceImport.id)
            .where(
                FinanceImport.user_id == user_id,
                FinanceImport.content_sha256 == evidence.sha256,
            )
            .limit(1)
        )
    )
    extracted_text = _evidence_extracted_text(evidence)
    parsed = parse_records(
        parse_source(data, parser_id, extracted_text=extracted_text),
        normalized_mapping,
        account_id=account_id,
        parser_id=parser_id,
    )
    row_hashes = {record.row_fingerprint for record in parsed}
    semantic_hashes = {
        record.semantic_fingerprint for record in parsed if record.semantic_fingerprint is not None
    }
    duplicate_clauses: list[Any] = []
    if row_hashes:
        duplicate_clauses.append(FinanceRawRecord.record_fingerprint.in_(row_hashes))
    if semantic_hashes:
        duplicate_clauses.append(FinanceRawRecord.semantic_fingerprint.in_(semantic_hashes))
    duplicate_record_count = (
        int(
            await session.scalar(
                select(func.count(FinanceRawRecord.id))
                .join(FinanceImport, FinanceImport.id == FinanceRawRecord.import_id)
                .where(
                    FinanceRawRecord.user_id == user_id,
                    FinanceImport.account_id == account_id,
                    or_(*duplicate_clauses),
                )
            )
            or 0
        )
        if duplicate_clauses
        else 0
    )
    import_id = str(uuid4())
    preview = build_import_preview(
        import_id=import_id,
        data=data,
        account_id=account_id,
        parser_id=parser_id,
        parser_version=parser_version,
        import_mode=import_mode,
        mapping=normalized_mapping,
        duplicate_file=duplicate_file,
        duplicate_record_count=duplicate_record_count,
        extracted_text=extracted_text,
    )
    row = FinanceImport(
        id=import_id,
        user_id=user_id,
        account_id=account_id,
        evidence_document_id=evidence.id,
        content_sha256=evidence.sha256,
        parser_id=parser_id,
        parser_version=parser_version,
        import_mode=import_mode,
        import_fingerprint=fingerprint,
        status="previewed",
        coverage_start=_optional_date(preview["coverage_start"]),
        coverage_end=_optional_date(preview["coverage_end"]),
        mapping=normalized_mapping,
        preview=preview,
    )
    session.add(row)
    await session.flush()
    return row, preview, True


def _optional_date(value: object) -> date | None:
    return date.fromisoformat(value) if isinstance(value, str) else None


async def commit_raw_records(
    session: AsyncSession,
    *,
    import_row: FinanceImport,
    data: bytes,
    mapping: dict[str, object],
    provider: str,
    row_overrides: tuple[dict[str, object], ...] = (),
    excluded_source_indexes: tuple[str, ...] = (),
) -> RawCommitPlan:
    """Build and add immutable raw records exactly once for an import.

    Event/revision/posting creation is intentionally left to the ledger service. Duplicates and
    mapping failures remain visible as raw records with rejection metadata.
    """
    await acquire_finance_advisory_lock(session, "import-commit", import_row.user_id, import_row.id)
    current = tuple(
        sorted(
            (
                await session.scalars(
                    select(FinanceRawRecord).where(
                        FinanceRawRecord.user_id == import_row.user_id,
                        FinanceRawRecord.import_id == import_row.id,
                    )
                )
            ).all(),
            key=lambda record: _source_index_sort_key(record.source_index),
        )
    )
    if current:
        rejected_count = sum(record.rejection_code is not None for record in current)
        duplicate_count = sum(
            (record.rejection_code or "").startswith("duplicate_") for record in current
        )
        return RawCommitPlan(
            records=current,
            accepted_records=tuple(record for record in current if record.rejection_code is None),
            duplicate_record_count=duplicate_count,
            rejected_record_count=rejected_count,
            already_committed=True,
        )

    parser_id = cast(ParserId, import_row.parser_id)
    evidence = await session.get(FinanceEvidenceDocument, import_row.evidence_document_id)
    source = parse_source(
        data,
        parser_id,
        extracted_text=_evidence_extracted_text(evidence) if evidence is not None else None,
    )
    if row_overrides or excluded_source_indexes:
        overrides = {str(item["source_index"]): item for item in row_overrides}
        excluded = set(excluded_source_indexes)
        source = ParsedSource(
            columns=source.columns,
            rows=tuple(
                SourceRow(
                    source_index=row.source_index,
                    original_payload={
                        **row.original_payload,
                        **{
                            key: value
                            for key, value in overrides.get(row.source_index, {}).items()
                            if key != "source_index" and value is not None
                        },
                    },
                )
                for row in source.rows
                if row.source_index not in excluded
            ),
            warnings=source.warnings,
            unparsed_line_count=source.unparsed_line_count,
        )
    parsed = parse_records(source, mapping, account_id=import_row.account_id, parser_id=parser_id)
    row_hashes = {record.row_fingerprint for record in parsed}
    semantic_hashes = {
        record.semantic_fingerprint for record in parsed if record.semantic_fingerprint is not None
    }
    provider_ids = {
        _scoped_provider_identity(
            import_row.account_id,
            provider,
            record.provider_external_id,
        )
        for record in parsed
        if record.provider_external_id is not None
    }
    clauses: list[Any] = []
    if row_hashes:
        clauses.append(FinanceRawRecord.record_fingerprint.in_(row_hashes))
    if semantic_hashes:
        clauses.append(FinanceRawRecord.semantic_fingerprint.in_(semantic_hashes))
    if provider_ids:
        clauses.append(FinanceRawRecord.provider_external_id.in_(provider_ids))
    prior = (
        list(
            (
                await session.scalars(
                    select(FinanceRawRecord)
                    .join(FinanceImport, FinanceImport.id == FinanceRawRecord.import_id)
                    .where(
                        FinanceRawRecord.user_id == import_row.user_id,
                        FinanceImport.account_id == import_row.account_id,
                        or_(*clauses),
                    )
                )
            ).all()
        )
        if clauses
        else []
    )

    def original_row_hash(record: FinanceRawRecord) -> str:
        extracted = record.extracted_payload or {}
        value = extracted.get("row_fingerprint")
        return str(value) if value is not None else record.record_fingerprint

    prior_rows = {original_row_hash(record) for record in prior}
    prior_semantics = {record.semantic_fingerprint for record in prior}
    prior_providers = {record.provider_external_id for record in prior}
    prior_by_row = {original_row_hash(record): record.id for record in prior}
    prior_by_semantic = {
        record.semantic_fingerprint: record.id
        for record in prior
        if record.semantic_fingerprint is not None
    }
    prior_by_provider = {
        record.provider_external_id: record.id
        for record in prior
        if record.provider_external_id is not None
    }

    records: list[FinanceRawRecord] = []
    duplicate_links: list[Link] = []
    seen_rows: set[str] = set()
    seen_semantics: set[str | None] = set()
    seen_providers: set[str] = set()
    seen_row_targets: dict[str, str] = {}
    seen_semantic_targets: dict[str, str] = {}
    seen_provider_targets: dict[str, str] = {}
    duplicate_count = 0
    for parsed_record in parsed:
        rejection_code = parsed_record.rejection_code
        rejection_reason = parsed_record.rejection_reason
        provider_id = (
            _scoped_provider_identity(
                import_row.account_id,
                provider,
                parsed_record.provider_external_id,
            )
            if parsed_record.provider_external_id is not None
            else None
        )
        duplicate_code: str | None = None
        duplicate_target_id: str | None = None
        if provider_id is not None and (
            provider_id in prior_providers or provider_id in seen_providers
        ):
            duplicate_code = "duplicate_provider_id"
            duplicate_target_id = prior_by_provider.get(provider_id) or seen_provider_targets.get(
                provider_id
            )
        elif (
            parsed_record.row_fingerprint in prior_rows
            or parsed_record.row_fingerprint in seen_rows
        ):
            duplicate_code = "duplicate_row"
            duplicate_target_id = prior_by_row.get(
                parsed_record.row_fingerprint
            ) or seen_row_targets.get(parsed_record.row_fingerprint)
        elif parsed_record.semantic_fingerprint is not None and (
            parsed_record.semantic_fingerprint in prior_semantics
            or parsed_record.semantic_fingerprint in seen_semantics
        ):
            duplicate_code = "duplicate_semantic"
            duplicate_target_id = prior_by_semantic.get(
                parsed_record.semantic_fingerprint
            ) or seen_semantic_targets.get(parsed_record.semantic_fingerprint)
        if rejection_code is None and duplicate_code is not None:
            duplicate_count += 1
            if import_row.import_mode != "reprocess":
                rejection_code = duplicate_code
                rejection_reason = "Record duplicates previously preserved Finance source data"

        # Keep the stable row hash for cross-import detection. Only repeated rows in the same
        # source need a position-qualified identity to satisfy the per-import uniqueness key.
        record_identity = parsed_record.row_fingerprint
        if parsed_record.row_fingerprint in seen_rows:
            record_identity = hash_payload(
                {
                    "source_index": parsed_record.source_index,
                    "row_fingerprint": parsed_record.row_fingerprint,
                }
            )
        extracted = dict(parsed_record.extracted_payload or {})
        extracted["row_fingerprint"] = parsed_record.row_fingerprint
        if duplicate_code is not None:
            extracted["duplicate_code"] = duplicate_code
            extracted["prior_raw_record_id"] = duplicate_target_id
        raw = FinanceRawRecord(
            id=str(uuid4()),
            user_id=import_row.user_id,
            import_id=import_row.id,
            source_index=parsed_record.source_index,
            provider_external_id=provider_id if duplicate_code != "duplicate_provider_id" else None,
            record_fingerprint=record_identity,
            semantic_fingerprint=parsed_record.semantic_fingerprint,
            original_payload=parsed_record.original_payload,
            extracted_payload=extracted,
            source_timestamp=parsed_record.source_timestamp,
            source_timezone=parsed_record.source_timezone,
            rejection_code=rejection_code,
            rejection_reason=rejection_reason,
        )
        records.append(raw)
        if duplicate_target_id is not None:
            duplicate_links.append(
                Link(
                    source_type="finance_raw_record",
                    source_id=raw.id,
                    target_type="finance_raw_record",
                    target_id=duplicate_target_id,
                    relation="possible_duplicate_of",
                )
            )
        seen_rows.add(parsed_record.row_fingerprint)
        seen_semantics.add(parsed_record.semantic_fingerprint)
        seen_row_targets.setdefault(parsed_record.row_fingerprint, raw.id)
        if parsed_record.semantic_fingerprint is not None:
            seen_semantic_targets.setdefault(parsed_record.semantic_fingerprint, raw.id)
        if provider_id is not None:
            seen_providers.add(provider_id)
            seen_provider_targets.setdefault(provider_id, raw.id)

    session.add_all([*records, *duplicate_links])
    import_row.mapping = normalize_mapping(mapping)
    import_row.status = (
        "committed_with_rejections"
        if any(record.rejection_code is not None for record in records)
        else ("reprocessed" if import_row.import_mode == "reprocess" else "committed")
    )
    import_row.committed_at = datetime.now(UTC)
    await session.flush()
    accepted = tuple(record for record in records if record.rejection_code is None)
    return RawCommitPlan(
        records=tuple(records),
        accepted_records=accepted,
        duplicate_record_count=duplicate_count,
        rejected_record_count=len(records) - len(accepted),
        already_committed=False,
    )


def _source_index_sort_key(value: str) -> tuple[int, int | str]:
    try:
        return 0, int(value)
    except ValueError:
        return 1, value
