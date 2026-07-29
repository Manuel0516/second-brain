"""Frozen Finance report selection, lineage manifests, and deterministic exports."""

import csv
import io
import json
import re
import zipfile
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from hashlib import sha256
from typing import Literal
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    FinanceOpenQuestion,
    FinanceReportInput,
    FinanceReportRun,
)
from app.services.finance_core import append_audit_entry

ReportStatus = Literal["ready", "ready_with_warnings", "blocked"]
IssueSeverity = Literal["info", "warning", "blocking"]
ExportFormat = Literal["csv", "zip", "pdf_summary"]
ReportInputType = Literal[
    "event_revision",
    "valuation",
    "tax_treatment_revision",
    "evidence_document",
    "open_question",
    "residency_fact",
]


class ReportDomainError(ValueError):
    pass


class ReportBlockedError(ReportDomainError):
    pass


class StaleSnapshotError(ReportDomainError):
    pass


def _id(value: str, field: str) -> str:
    try:
        UUID(value)
    except (TypeError, ValueError) as exc:
        raise ReportDomainError(f"{field} must be a UUID") from exc
    return value


def _ids(values: tuple[str, ...], field: str) -> tuple[str, ...]:
    for value in values:
        _id(value, field)
    return tuple(sorted(set(values)))


def _decimal(value: str, field: str) -> str:
    if not isinstance(value, str):
        raise ReportDomainError(f"{field} must be a decimal string")
    try:
        number = Decimal(value)
    except InvalidOperation as exc:
        raise ReportDomainError(f"{field} must be a decimal string") from exc
    if not number.is_finite() or "e" in value.lower():
        raise ReportDomainError(f"{field} must be a finite non-exponent decimal string")
    return value


def _canonical_json(value: object) -> bytes:
    return (
        json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n"
    ).encode()


@dataclass(frozen=True, slots=True)
class EventRevisionSelection:
    event_id: str
    revision_id: str
    revision_number: int
    status: str
    effective_at: str

    def __post_init__(self) -> None:
        _id(self.event_id, "event id")
        _id(self.revision_id, "event revision id")
        if self.revision_number < 1:
            raise ReportDomainError("revision number must be positive")


def select_current_event_revisions(
    revisions: tuple[EventRevisionSelection, ...],
    expected_revision_ids: tuple[str, ...] | None = None,
) -> tuple[EventRevisionSelection, ...]:
    """Select the highest confirmed revision for each event and verify optimistic input IDs."""
    selected: dict[str, EventRevisionSelection] = {}
    for revision in revisions:
        if revision.status != "confirmed":
            continue
        prior = selected.get(revision.event_id)
        if prior is None or revision.revision_number > prior.revision_number:
            selected[revision.event_id] = revision
        elif (
            prior.revision_number == revision.revision_number
            and prior.revision_id != revision.revision_id
        ):
            raise ReportDomainError("event has conflicting confirmed revisions")
    result = tuple(sorted(selected.values(), key=lambda row: (row.effective_at, row.revision_id)))
    actual = tuple(sorted(row.revision_id for row in result))
    if expected_revision_ids is not None and actual != _ids(
        expected_revision_ids, "expected revision id"
    ):
        raise StaleSnapshotError("expected event revisions are stale")
    return result


@dataclass(frozen=True, slots=True)
class ReportIssue:
    code: str
    severity: IssueSeverity
    message: str
    entity_type: str | None = None
    entity_id: str | None = None

    def __post_init__(self) -> None:
        if self.severity not in {"info", "warning", "blocking"}:
            raise ReportDomainError("invalid report issue severity")
        if self.entity_id is not None:
            _id(self.entity_id, "issue entity id")

    def manifest(self) -> dict[str, str | None]:
        return {
            "code": self.code,
            "severity": self.severity,
            "message": self.message,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
        }


@dataclass(frozen=True, slots=True)
class ReportItem:
    id: str
    schedule: str
    tax_date: str
    description: str
    category: str
    amount: str
    currency: str
    event_revision_ids: tuple[str, ...]
    valuation_ids: tuple[str, ...]
    treatment_ids: tuple[str, ...]
    evidence_document_ids: tuple[str, ...]
    requires_valuation: bool = True
    requires_treatment: bool = True
    requires_evidence: bool = False

    def __post_init__(self) -> None:
        _id(self.id, "report item id")
        _decimal(self.amount, "report item amount")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", self.tax_date):
            raise ReportDomainError("tax date must use YYYY-MM-DD")
        if len(self.currency) != 3 or not self.currency.isalpha():
            raise ReportDomainError("item currency must be a three-letter code")
        if not self.event_revision_ids:
            raise ReportDomainError("every report item requires event revision lineage")
        for values, field in (
            (self.event_revision_ids, "event revision id"),
            (self.valuation_ids, "valuation id"),
            (self.treatment_ids, "treatment id"),
            (self.evidence_document_ids, "evidence document id"),
        ):
            _ids(values, field)

    def manifest(self) -> dict[str, object]:
        return {
            "id": self.id,
            "schedule": self.schedule,
            "tax_date": self.tax_date,
            "description": self.description,
            "category": self.category,
            "amount": self.amount,
            "currency": self.currency.upper(),
            "lineage": {
                "event_revision_ids": list(_ids(self.event_revision_ids, "event revision id")),
                "valuation_ids": list(_ids(self.valuation_ids, "valuation id")),
                "treatment_ids": list(_ids(self.treatment_ids, "treatment id")),
                "evidence_document_ids": list(
                    _ids(self.evidence_document_ids, "evidence document id")
                ),
            },
        }


@dataclass(frozen=True, slots=True)
class EvidenceManifestEntry:
    id: str
    sha256: str
    original_name: str
    media_type: str
    size: int
    object_version: str
    captured_at: str

    def __post_init__(self) -> None:
        _id(self.id, "evidence document id")
        if not re.fullmatch(r"[0-9a-f]{64}", self.sha256):
            raise ReportDomainError("evidence SHA-256 is invalid")
        if self.size < 0:
            raise ReportDomainError("evidence size must not be negative")

    def manifest(self) -> dict[str, object]:
        return {
            "id": self.id,
            "sha256": self.sha256,
            "original_name": self.original_name,
            "media_type": self.media_type,
            "size": self.size,
            "object_version": self.object_version,
            "captured_at": self.captured_at,
        }


@dataclass(frozen=True, slots=True)
class OpenQuestionManifestEntry:
    id: str
    severity: str
    title: str
    description: str
    status: str

    def __post_init__(self) -> None:
        _id(self.id, "open question id")

    def manifest(self) -> dict[str, str]:
        return {
            "id": self.id,
            "severity": self.severity,
            "title": self.title,
            "description": self.description,
            "status": self.status,
        }


@dataclass(frozen=True, slots=True)
class ResidencyFactManifestEntry:
    id: str
    fact_type: str
    period_start: str | None
    period_end: str | None
    source: str
    status: str
    evidence_document_ids: tuple[str, ...]

    def __post_init__(self) -> None:
        _id(self.id, "residency fact id")
        _ids(self.evidence_document_ids, "evidence document id")

    def manifest(self) -> dict[str, object]:
        return {
            "id": self.id,
            "fact_type": self.fact_type,
            "period_start": self.period_start,
            "period_end": self.period_end,
            "source": self.source,
            "status": self.status,
            "evidence_document_ids": list(self.evidence_document_ids),
        }


@dataclass(frozen=True, slots=True)
class FrozenReport:
    id: str
    tax_profile_id: str
    tax_year: int
    jurisdiction: str
    reporting_currency: str
    status: ReportStatus
    ruleset_versions: tuple[tuple[str, str], ...]
    algorithm_version: str
    event_revisions: tuple[EventRevisionSelection, ...]
    valuation_ids: tuple[str, ...]
    treatment_ids: tuple[str, ...]
    evidence_document_ids: tuple[str, ...]
    open_question_ids: tuple[str, ...]
    items: tuple[ReportItem, ...]
    blockers: tuple[ReportIssue, ...]
    warnings: tuple[ReportIssue, ...]
    created_at: datetime
    manifest_sha256: str
    evidence_manifest: tuple[EvidenceManifestEntry, ...] = ()
    open_question_manifest: tuple[OpenQuestionManifestEntry, ...] = ()
    residency_fact_manifest: tuple[ResidencyFactManifestEntry, ...] = ()

    def _manifest_body(self) -> dict[str, object]:
        return {
            "schema_version": "finance-report-manifest-v1",
            "report_id": self.id,
            "tax_profile_id": self.tax_profile_id,
            "tax_year": self.tax_year,
            "jurisdiction": self.jurisdiction,
            "reporting_currency": self.reporting_currency,
            "status": self.status,
            "ruleset_versions": dict(self.ruleset_versions),
            "algorithm_version": self.algorithm_version,
            "event_revision_ids": [row.revision_id for row in self.event_revisions],
            "valuation_ids": list(self.valuation_ids),
            "treatment_ids": list(self.treatment_ids),
            "evidence_document_ids": list(self.evidence_document_ids),
            "open_question_ids": list(self.open_question_ids),
            "evidence_manifest": [item.manifest() for item in self.evidence_manifest],
            "open_question_manifest": [item.manifest() for item in self.open_question_manifest],
            "residency_fact_manifest": [item.manifest() for item in self.residency_fact_manifest],
            "items": [item.manifest() for item in self.items],
            "blockers": [issue.manifest() for issue in self.blockers],
            "warnings": [issue.manifest() for issue in self.warnings],
            "created_at": self.created_at.isoformat(),
        }

    def manifest(self) -> dict[str, object]:
        return {**self._manifest_body(), "manifest_sha256": self.manifest_sha256}


def create_frozen_report(
    *,
    report_id: str,
    tax_profile_id: str,
    tax_year: int,
    jurisdiction: str,
    reporting_currency: str,
    ruleset_versions: dict[str, str],
    algorithm_version: str,
    event_revisions: tuple[EventRevisionSelection, ...],
    valuation_ids: tuple[str, ...],
    confirmed_treatment_ids: tuple[str, ...],
    evidence_document_ids: tuple[str, ...],
    open_question_ids: tuple[str, ...],
    items: tuple[ReportItem, ...],
    issues: tuple[ReportIssue, ...],
    created_at: datetime,
    evidence_manifest: tuple[EvidenceManifestEntry, ...] = (),
    open_question_manifest: tuple[OpenQuestionManifestEntry, ...] = (),
    residency_fact_manifest: tuple[ResidencyFactManifestEntry, ...] = (),
) -> FrozenReport:
    """Freeze explicit IDs and derived schedules; later state is never consulted by exports."""
    _id(report_id, "report id")
    _id(tax_profile_id, "tax profile id")
    if jurisdiction not in {"SE", "ES"}:
        raise ReportDomainError("jurisdiction must be SE or ES")
    if created_at.tzinfo is None:
        raise ReportDomainError("report created_at must be timezone-aware")
    selected_revision_ids = {row.revision_id for row in event_revisions}
    selected_valuations = set(_ids(valuation_ids, "valuation id"))
    confirmed_treatments = set(_ids(confirmed_treatment_ids, "treatment id"))
    selected_evidence = set(_ids(evidence_document_ids, "evidence document id"))
    if evidence_manifest and {entry.id for entry in evidence_manifest} != selected_evidence:
        raise ReportDomainError("evidence manifest must cover every selected evidence document")
    selected_questions = set(_ids(open_question_ids, "open question id"))
    if (
        open_question_manifest
        and {entry.id for entry in open_question_manifest} != selected_questions
    ):
        raise ReportDomainError("open-question manifest must cover every selected question")
    if any(
        not set(entry.evidence_document_ids) <= selected_evidence
        for entry in residency_fact_manifest
    ):
        raise ReportDomainError("residency fact evidence is outside the frozen evidence manifest")
    derived_issues = list(issues)
    for item in items:
        if not set(item.event_revision_ids) <= selected_revision_ids:
            derived_issues.append(_lineage_issue("unselected_event_revision", item))
        if item.requires_valuation and not item.valuation_ids:
            derived_issues.append(_lineage_issue("missing_valuation", item))
        if not set(item.valuation_ids) <= selected_valuations:
            derived_issues.append(_lineage_issue("unselected_valuation", item))
        if item.requires_treatment and not item.treatment_ids:
            derived_issues.append(_lineage_issue("missing_treatment", item))
        if not set(item.treatment_ids) <= confirmed_treatments:
            derived_issues.append(_lineage_issue("unconfirmed_treatment", item))
        if item.requires_evidence and not item.evidence_document_ids:
            derived_issues.append(_lineage_issue("missing_evidence", item))
        if not set(item.evidence_document_ids) <= selected_evidence:
            derived_issues.append(_lineage_issue("unselected_evidence", item))
    blockers = tuple(
        sorted((i for i in derived_issues if i.severity == "blocking"), key=_issue_key)
    )
    warnings = tuple(
        sorted((i for i in derived_issues if i.severity != "blocking"), key=_issue_key)
    )
    status: ReportStatus = (
        "blocked" if blockers else ("ready_with_warnings" if warnings else "ready")
    )
    provisional = FrozenReport(
        id=report_id,
        tax_profile_id=tax_profile_id,
        tax_year=tax_year,
        jurisdiction=jurisdiction,
        reporting_currency=reporting_currency.upper(),
        status=status,
        ruleset_versions=tuple(sorted(ruleset_versions.items())),
        algorithm_version=algorithm_version,
        event_revisions=tuple(sorted(event_revisions, key=lambda row: row.revision_id)),
        valuation_ids=tuple(sorted(selected_valuations)),
        treatment_ids=tuple(sorted(confirmed_treatments)),
        evidence_document_ids=tuple(sorted(selected_evidence)),
        open_question_ids=tuple(sorted(selected_questions)),
        items=tuple(sorted(items, key=lambda row: (row.tax_date, row.id))),
        blockers=blockers,
        warnings=warnings,
        created_at=created_at,
        manifest_sha256="",
        evidence_manifest=tuple(sorted(evidence_manifest, key=lambda item: item.id)),
        open_question_manifest=tuple(sorted(open_question_manifest, key=lambda item: item.id)),
        residency_fact_manifest=tuple(sorted(residency_fact_manifest, key=lambda item: item.id)),
    )
    digest = sha256(_canonical_json(provisional._manifest_body())).hexdigest()
    return FrozenReport(
        **{
            field: getattr(provisional, field)
            for field in provisional.__slots__
            if field != "manifest_sha256"
        },
        manifest_sha256=digest,
    )


def _lineage_issue(code: str, item: ReportItem) -> ReportIssue:
    return ReportIssue(
        code=code,
        severity="blocking",
        message=f"Report item {item.id} has incomplete frozen lineage.",
        entity_type="report_item",
        entity_id=item.id,
    )


def _issue_key(issue: ReportIssue) -> tuple[str, str, str]:
    return (issue.code, issue.entity_type or "", issue.entity_id or "")


def export_report(report: FrozenReport, export_format: ExportFormat | str) -> bytes:
    if report.status == "blocked":
        raise ReportBlockedError("blocked reports have no downloadable export")
    if export_format == "csv":
        return _csv_bytes(report)
    if export_format == "pdf_summary":
        return _pdf_bytes(report)
    if export_format == "zip":
        return _zip_bytes(report)
    raise ReportDomainError("unsupported report export format")


def _csv_bytes(report: FrozenReport) -> bytes:
    return _items_csv_bytes(report.items)


def _items_csv_bytes(items: tuple[ReportItem, ...]) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(
        [
            "tax_date",
            "schedule",
            "description",
            "category",
            "amount",
            "currency",
            "event_revision_ids",
            "valuation_ids",
            "treatment_ids",
            "evidence_document_ids",
        ]
    )
    for item in items:
        writer.writerow(
            [
                item.tax_date,
                item.schedule,
                item.description,
                item.category,
                item.amount,
                item.currency.upper(),
                ";".join(sorted(item.event_revision_ids)),
                ";".join(sorted(item.valuation_ids)),
                ";".join(sorted(item.treatment_ids)),
                ";".join(sorted(item.evidence_document_ids)),
            ]
        )
    return output.getvalue().encode()


def _evidence_manifest_csv(report: FrozenReport) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(
        [
            "evidence_document_id",
            "sha256",
            "original_name",
            "media_type",
            "size",
            "object_version",
            "captured_at",
        ]
    )
    by_id = {entry.id: entry for entry in report.evidence_manifest}
    for evidence_id in report.evidence_document_ids:
        entry = by_id.get(evidence_id)
        writer.writerow(
            [
                evidence_id,
                entry.sha256 if entry else "",
                entry.original_name if entry else "",
                entry.media_type if entry else "",
                entry.size if entry else "",
                entry.object_version if entry else "",
                entry.captured_at if entry else "",
            ]
        )
    return output.getvalue().encode()


def _open_questions_csv(report: FrozenReport) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(["open_question_id", "severity", "title", "description", "status"])
    by_id = {entry.id: entry for entry in report.open_question_manifest}
    for question_id in report.open_question_ids:
        entry = by_id.get(question_id)
        writer.writerow(
            [
                question_id,
                entry.severity if entry else "",
                entry.title if entry else "",
                entry.description if entry else "",
                entry.status if entry else "",
            ]
        )
    return output.getvalue().encode()


def _residency_facts_csv(report: FrozenReport) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(
        [
            "residency_fact_id",
            "fact_type",
            "period_start",
            "period_end",
            "source",
            "status",
            "evidence_document_ids",
        ]
    )
    for entry in report.residency_fact_manifest:
        writer.writerow(
            [
                entry.id,
                entry.fact_type,
                entry.period_start or "",
                entry.period_end or "",
                entry.source,
                entry.status,
                ";".join(sorted(entry.evidence_document_ids)),
            ]
        )
    return output.getvalue().encode()


def _safe_schedule_name(value: str) -> str:
    slug = re.sub(r"[^a-z0-9_-]+", "-", value.strip().lower()).strip("-")
    return slug or "uncategorized"


def _pdf_bytes(report: FrozenReport) -> bytes:
    lines = [
        "Second Brain Finance report summary",
        f"Jurisdiction: {report.jurisdiction}",
        f"Tax year: {report.tax_year}",
        f"Reporting currency: {report.reporting_currency}",
        f"Status: {report.status}",
        f"Schedule items: {len(report.items)}",
        f"Manifest SHA-256: {report.manifest_sha256}",
    ]
    commands = ["BT", "/F1 10 Tf", "50 790 Td"]
    for index, line in enumerate(lines):
        if index:
            commands.append("0 -16 Td")
        safe = (
            line.encode("ascii", "replace")
            .decode()
            .replace("\\", "\\\\")
            .replace("(", "\\(")
            .replace(")", "\\)")
        )
        commands.append(f"({safe}) Tj")
    commands.append("ET")
    stream = "\n".join(commands).encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"
        ),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream",
    ]
    data = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data.extend(f"{index} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = len(data)
    data.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    data.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        data.extend(f"{offset:010d} 00000 n \n".encode())
    data.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    )
    return bytes(data)


def _zip_bytes(report: FrozenReport) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        files: list[tuple[str, bytes]] = [
            ("manifest.json", _canonical_json(report.manifest())),
            ("schedule.csv", _csv_bytes(report)),
        ]
        schedules = sorted({item.schedule for item in report.items})
        for schedule in schedules:
            schedule_items = tuple(item for item in report.items if item.schedule == schedule)
            files.append(
                (f"schedules/{_safe_schedule_name(schedule)}.csv", _items_csv_bytes(schedule_items))
            )
        files.extend(
            [
                (
                    "evidence-manifest.csv",
                    _evidence_manifest_csv(report),
                ),
                (
                    "open-questions.csv",
                    _open_questions_csv(report),
                ),
                ("residency-facts.csv", _residency_facts_csv(report)),
                ("summary.pdf", _pdf_bytes(report)),
            ]
        )
        for name, content in files:
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, content, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    return output.getvalue()


async def surface_report_restatement_questions(
    session: AsyncSession,
    *,
    user_id: str,
    actor_id: str | None,
    input_type: ReportInputType,
    superseded_input_ids: tuple[str, ...],
    successor_input_id: str,
    reason: str,
) -> tuple[FinanceOpenQuestion, ...]:
    """Flag frozen reports affected by a successor without changing their snapshots.

    The deterministic question ID makes ledger/treatment retry paths idempotent.  Callers keep
    this in the same transaction that appends the successor revision.
    """
    if not superseded_input_ids:
        return ()
    for value in (*superseded_input_ids, successor_input_id):
        _id(value, "report lineage input id")
    report_rows = list(
        (
            await session.scalars(
                select(FinanceReportRun)
                .join(
                    FinanceReportInput,
                    FinanceReportInput.report_run_id == FinanceReportRun.id,
                )
                .where(
                    FinanceReportRun.user_id == user_id,
                    FinanceReportInput.input_type == input_type,
                    FinanceReportInput.input_id.in_(superseded_input_ids),
                )
                .order_by(FinanceReportRun.id)
                .distinct()
            )
        ).all()
    )
    questions: list[FinanceOpenQuestion] = []
    for report in report_rows:
        question_id = str(
            uuid5(
                NAMESPACE_URL,
                (
                    "second-brain:finance-report-restatement:"
                    f"{user_id}:{report.id}:{input_type}:{successor_input_id}"
                ),
            )
        )
        existing = await session.scalar(
            select(FinanceOpenQuestion).where(
                FinanceOpenQuestion.id == question_id,
                FinanceOpenQuestion.user_id == user_id,
            )
        )
        if existing is not None:
            questions.append(existing)
            continue
        question = FinanceOpenQuestion(
            id=question_id,
            user_id=user_id,
            tax_profile_id=report.tax_profile_id,
            question_type="report_restatement_needed",
            severity="warning",
            title=f"Review frozen {report.jurisdiction} {report.tax_year} report",
            description=(
                "A successor finance revision affects lineage used by this frozen report. "
                "The original report and file remain unchanged; create a new run after review."
            ),
            status="open",
            owner_role="user",
            related_entities=[
                {"entity_type": "finance_report_run", "entity_id": report.id},
                {"entity_type": input_type, "entity_id": successor_input_id},
            ],
        )
        session.add(question)
        await session.flush()
        await append_audit_entry(
            session,
            user_id=user_id,
            actor_id=actor_id,
            actor_type="user" if actor_id else "system",
            action="report.restatement_flagged",
            entity_type="finance_open_question",
            entity_id=question.id,
            request={
                "report_id": report.id,
                "input_type": input_type,
                "superseded_input_ids": sorted(set(superseded_input_ids)),
                "successor_input_id": successor_input_id,
            },
            reason=reason,
        )
        questions.append(question)
    return tuple(questions)
