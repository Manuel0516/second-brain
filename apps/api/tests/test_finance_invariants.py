import re
from datetime import UTC, datetime
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import Numeric, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import dialect as postgresql_dialect
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Base,
    File,
    FinanceEvidenceDocument,
    FinanceGuidanceSource,
    FinanceReportRun,
    FinanceTaxProfile,
    User,
)

pytestmark = pytest.mark.anyio


async def _login(client: AsyncClient, user: User) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "testpassword123"},
    )
    assert response.status_code == 200
    return {"access_token": response.cookies["access_token"]}


def test_finance_decimal_columns_use_numeric() -> None:
    expected = {
        ("finance_event_components", "quantity"): (38, 18),
        ("finance_postings", "fiat_value"): (24, 8),
        ("finance_valuations", "rate"): (38, 18),
        ("finance_review_groups", "report_value"): (24, 8),
        ("finance_lot_disposals", "gain_loss"): (24, 8),
        ("finance_report_items", "value"): (24, 8),
    }
    for (table_name, column_name), (precision, scale) in expected.items():
        column_type = Base.metadata.tables[table_name].c[column_name].type
        assert isinstance(column_type, Numeric)
        assert column_type.precision == precision
        assert column_type.scale == scale


def test_legacy_metadata_preserves_applied_postgresql_shape() -> None:
    metadata = Base.metadata
    postgresql = postgresql_dialect()  # type: ignore[no-untyped-call]
    for table_name, column_name in (
        ("calendar_events", "recurrence_byday"),
        ("calendar_events", "recurrence_exdates"),
        ("calendar_events", "connections"),
        ("user_settings", "favorite_emojis"),
        ("user_settings", "favorite_colors"),
    ):
        column_type = metadata.tables[table_name].c[column_name].type
        assert isinstance(column_type.dialect_impl(postgresql), JSONB)

    expected_indexes = {
        "users": {"ix_users_email"},
        "refresh_tokens": {"ix_refresh_tokens_user_id"},
        "calendars": {"ix_calendars_user_id"},
        "calendar_events": {
            "ix_calendar_events_calendar_id",
            "ix_calendar_events_calendar_external",
        },
        "files": {"ix_files_user_id"},
    }
    for table_name, index_names in expected_indexes.items():
        assert {index.name for index in metadata.tables[table_name].indexes} >= index_names

    users = metadata.tables["users"]
    assert any(
        isinstance(constraint, UniqueConstraint)
        and tuple(column.name for column in constraint.columns) == ("email",)
        for constraint in users.constraints
    )
    email_index = next(index for index in users.indexes if index.name == "ix_users_email")
    assert email_index.unique is False

    recurrence_fk = next(
        iter(metadata.tables["calendar_events"].c.recurrence_parent_id.foreign_keys)
    )
    assert recurrence_fk.constraint is not None
    assert recurrence_fk.constraint.name == "fk_calendar_events_recurrence_parent"
    assert recurrence_fk.ondelete == "CASCADE"


def test_finance_migration_chain_is_linear_and_append_only_guarded() -> None:
    versions = Path(__file__).parents[1] / "alembic" / "versions"
    expected = {
        "029": "028",
        "030": "029",
        "031": "030",
        "032": "031",
        "033": "032",
        "034": "033",
        "035": "034",
        "036": "035",
        "037": "036",
        "038": "037",
    }
    for revision, parent in expected.items():
        path = next(versions.glob(f"{revision}_*.py"))
        source = path.read_text(encoding="utf-8")
        assert re.search(rf'revision = "{revision}"', source)
        assert re.search(rf'down_revision = "{parent}"', source)

    guard = (versions / "034_finance_immutability.py").read_text(encoding="utf-8")
    for table in (
        "finance_evidence_documents",
        "finance_raw_records",
        "finance_event_revisions",
        "finance_postings",
        "finance_audit_entries",
        "finance_tax_treatment_revisions",
        "finance_report_runs",
        "finance_guidance_sources",
    ):
        assert f'"{table}"' in guard

    integrity = (versions / "035_finance_lineage_integrity.py").read_text(encoding="utf-8")
    for invariant in (
        "finance_revision_valuations",
        "validate_finance_owner_lineage",
        "validate_finance_current_event",
        "unbalanced asset postings",
        "validate_finance_tax_report_lineage",
        "finance assistant proposal history is immutable",
    ):
        assert invariant in integrity

    investment_integrity = (versions / "036_finance_investment_integrity.py").read_text(
        encoding="utf-8"
    )
    for invariant in (
        "finance reconciliation source lineage mismatch",
        "finance lot owner mismatch",
        "finance position current revision mismatch",
        "finance bot equity owner mismatch",
    ):
        assert invariant in investment_integrity

    tax_report_integrity = (versions / "037_finance_tax_report_integrity.py").read_text(
        encoding="utf-8"
    )
    for invariant in (
        "finance tax treatment requires current confirmed event",
        "finance report input owner or state mismatch",
        "finance report item input lineage mismatch",
        "ck_finance_tool_audit_status",
    ):
        assert invariant in tax_report_integrity

    guidance_snapshots = (versions / "038_finance_guidance_snapshots.py").read_text(
        encoding="utf-8"
    )
    for invariant in (
        "requires empty finance_guidance_sources",
        "retrieved_url",
        "http_status BETWEEN 200 AND 299",
        "body_size > 0 AND body_size = length(body)",
    ):
        assert invariant in guidance_snapshots


def test_finance_guidance_model_stores_complete_response_snapshot() -> None:
    table = Base.metadata.tables[FinanceGuidanceSource.__tablename__]
    assert table.c.retrieved_url.nullable is False
    assert table.c.media_type.nullable is True
    assert table.c.http_status.nullable is False
    assert table.c.body_size.nullable is False
    assert table.c.body.nullable is False
    assert {constraint.name for constraint in table.constraints} >= {
        "ck_finance_guidance_retrieved_url",
        "ck_finance_guidance_media_type",
        "ck_finance_guidance_http_status",
        "ck_finance_guidance_body_size",
    }


async def test_evidence_and_frozen_report_files_cannot_be_deleted(
    client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    evidence_file = File(
        user_id=test_user.id,
        name="statement.csv",
        content_type="text/csv",
        size=10,
    )
    report_file = File(
        user_id=test_user.id,
        name="report.csv",
        content_type="text/csv",
        size=20,
    )
    test_db_session.add_all([evidence_file, report_file])
    await test_db_session.flush()
    profile = FinanceTaxProfile(
        user_id=test_user.id,
        tax_year=2026,
        jurisdiction="SE",
        reporting_currency="SEK",
        materiality_threshold="1",
        reconciliation_tolerance="0.01",
        status="draft",
        valuation_policy={},
    )
    test_db_session.add(profile)
    await test_db_session.flush()
    test_db_session.add_all(
        [
            FinanceEvidenceDocument(
                user_id=test_user.id,
                file_id=evidence_file.id,
                original_name=evidence_file.name,
                media_type=evidence_file.content_type,
                size=evidence_file.size,
                sha256="a" * 64,
                object_version="v1",
                source_kind="statement",
                captured_at=datetime.now(UTC),
            ),
            FinanceReportRun(
                user_id=test_user.id,
                tax_profile_id=profile.id,
                tax_year=2026,
                jurisdiction="SE",
                reporting_currency="SEK",
                format="csv",
                status="ready",
                ruleset_versions={"se": "2026.1"},
                algorithm_version="1",
                blockers=[],
                warnings=[],
                manifest={},
                manifest_sha256="b" * 64,
                file_id=report_file.id,
                file_sha256="c" * 64,
            ),
        ]
    )
    await test_db_session.commit()

    cookies = await _login(client, test_user)
    evidence_delete = await client.delete(
        f"/api/files/{evidence_file.id}",
        cookies=cookies,
    )
    report_delete = await client.delete(
        f"/api/files/{report_file.id}",
        cookies=cookies,
    )
    assert evidence_delete.status_code == 409
    assert report_delete.status_code == 409
