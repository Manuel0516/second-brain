import csv
import io
import json
import zipfile
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import cast
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import storage
from app.models import (
    FinanceAccount,
    FinanceAsset,
    FinanceEvent,
    FinanceEventRevision,
    FinanceOpenQuestion,
    FinanceReportInput,
    FinanceReportRun,
    FinanceRevisionValuation,
    FinanceTaxProfile,
    FinanceTaxTreatment,
    FinanceTaxTreatmentRevision,
    FinanceValuation,
    User,
)
from app.services.finance_reports import (
    EventRevisionSelection,
    FrozenReport,
    ReportBlockedError,
    ReportIssue,
    ReportItem,
    StaleSnapshotError,
    create_frozen_report,
    export_report,
    select_current_event_revisions,
    surface_report_restatement_questions,
)

EVENT_ID = "11111111-1111-4111-8111-111111111111"
REVISION_ID = "22222222-2222-4222-8222-222222222222"
VALUATION_ID = "33333333-3333-4333-8333-333333333333"
TREATMENT_ID = "44444444-4444-4444-8444-444444444444"
EVIDENCE_ID = "55555555-5555-4555-8555-555555555555"


async def _login(client: AsyncClient, user: User) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login", json={"email": user.email, "password": "testpassword123"}
    )
    assert response.status_code == 200
    return {"access_token": response.cookies["access_token"]}


def _revision(revision_id: str = REVISION_ID, number: int = 1) -> EventRevisionSelection:
    return EventRevisionSelection(
        event_id=EVENT_ID,
        revision_id=revision_id,
        revision_number=number,
        status="confirmed",
        effective_at="2026-01-01T12:00:00+00:00",
    )


def _item() -> ReportItem:
    return ReportItem(
        id="66666666-6666-4666-8666-666666666666",
        schedule="income",
        tax_date="2026-01-01",
        description="Staking reward",
        category="staking_income_inventory",
        amount="7.20000000",
        currency="EUR",
        event_revision_ids=(REVISION_ID,),
        valuation_ids=(VALUATION_ID,),
        treatment_ids=(TREATMENT_ID,),
        evidence_document_ids=(EVIDENCE_ID,),
    )


def _report(*, issues: tuple[ReportIssue, ...] = ()) -> FrozenReport:
    return create_frozen_report(
        report_id="77777777-7777-4777-8777-777777777777",
        tax_profile_id="88888888-8888-4888-8888-888888888888",
        tax_year=2026,
        jurisdiction="ES",
        reporting_currency="EUR",
        ruleset_versions={"es-income": "2026.3"},
        algorithm_version="report-v1",
        event_revisions=(_revision(),),
        valuation_ids=(VALUATION_ID,),
        confirmed_treatment_ids=(TREATMENT_ID,),
        evidence_document_ids=(EVIDENCE_ID,),
        open_question_ids=(),
        items=(_item(),),
        issues=issues,
        created_at=datetime(2026, 7, 25, 12, 0, tzinfo=UTC),
    )


def test_snapshot_selection_uses_latest_confirmed_revision_and_detects_staleness() -> None:
    old_id = "99999999-9999-4999-8999-999999999999"
    selected = select_current_event_revisions((_revision(old_id, 1), _revision(REVISION_ID, 2)))
    assert tuple(revision.revision_id for revision in selected) == (REVISION_ID,)

    with pytest.raises(StaleSnapshotError):
        select_current_event_revisions(
            (_revision(old_id, 1), _revision(REVISION_ID, 2)), expected_revision_ids=(old_id,)
        )


def test_frozen_report_manifest_and_exports_are_byte_deterministic() -> None:
    report = _report()

    first_csv = export_report(report, "csv")
    second_csv = export_report(report, "csv")
    first_pdf = export_report(report, "pdf_summary")
    first_zip = export_report(report, "zip")

    assert first_csv == second_csv
    assert first_pdf == export_report(report, "pdf_summary")
    assert first_zip == export_report(report, "zip")
    assert first_pdf.startswith(b"%PDF-1.4")
    assert first_pdf.count(b"/Type /Page") >= 3

    rows = list(csv.DictReader(io.StringIO(first_csv.decode("utf-8"))))
    assert rows[0]["amount"] == "7.20000000"
    assert rows[0]["event_revision_ids"] == REVISION_ID

    with zipfile.ZipFile(io.BytesIO(first_zip)) as archive:
        assert archive.namelist() == [
            "manifest.json",
            "schedule.csv",
            "schedules/income.csv",
            "evidence-manifest.csv",
            "open-questions.csv",
            "residency-facts.csv",
            "summary.pdf",
        ]
        manifest_bytes = archive.read("manifest.json")
        assert json.loads(manifest_bytes)["manifest_sha256"] == report.manifest_sha256
        assert archive.read("schedule.csv") == first_csv
        assert archive.read("summary.pdf") == first_pdf
        assert all(info.date_time == (1980, 1, 1, 0, 0, 0) for info in archive.infolist())


def test_manifest_lineage_links_each_number_to_all_provenance_layers() -> None:
    report = _report()
    manifest = report.manifest()
    items = cast(list[dict[str, object]], manifest["items"])
    lineage = items[0]["lineage"]

    assert lineage == {
        "event_revision_ids": [REVISION_ID],
        "valuation_ids": [VALUATION_ID],
        "treatment_ids": [TREATMENT_ID],
        "evidence_document_ids": [EVIDENCE_ID],
    }
    assert manifest["event_revision_ids"] == [REVISION_ID]


def test_blockers_persist_in_snapshot_but_prevent_export() -> None:
    issue = ReportIssue(
        code="reconciliation_difference",
        severity="blocking",
        message="Closing balance does not reconcile.",
        entity_type="reconciliation",
        entity_id="99999999-9999-4999-8999-999999999999",
    )
    report = _report(issues=(issue,))

    assert report.status == "blocked"
    blockers = cast(list[dict[str, object]], report.manifest()["blockers"])
    assert blockers[0]["code"] == "reconciliation_difference"
    with pytest.raises(ReportBlockedError):
        export_report(report, "zip")


def test_missing_lineage_and_nonconfirmed_treatments_are_blocking() -> None:
    incomplete_item = ReportItem(
        id="66666666-6666-4666-8666-666666666666",
        schedule="income",
        tax_date="2026-01-01",
        description="Incomplete reward",
        category="staking_income_inventory",
        amount="7.20",
        currency="EUR",
        event_revision_ids=(REVISION_ID,),
        valuation_ids=(),
        treatment_ids=(TREATMENT_ID,),
        evidence_document_ids=(),
        requires_valuation=True,
        requires_evidence=True,
    )
    report = create_frozen_report(
        report_id="77777777-7777-4777-8777-777777777777",
        tax_profile_id="88888888-8888-4888-8888-888888888888",
        tax_year=2026,
        jurisdiction="ES",
        reporting_currency="EUR",
        ruleset_versions={"es-income": "2026.3"},
        algorithm_version="report-v1",
        event_revisions=(_revision(),),
        valuation_ids=(),
        confirmed_treatment_ids=(),
        evidence_document_ids=(),
        open_question_ids=(),
        items=(incomplete_item,),
        issues=(),
        created_at=datetime(2026, 7, 25, 12, 0, tzinfo=UTC),
    )
    assert {blocker.code for blocker in report.blockers} == {
        "missing_evidence",
        "missing_valuation",
        "unconfirmed_treatment",
    }


@pytest.mark.anyio
async def test_successor_revision_flags_frozen_report_without_mutating_it(
    test_db_session: AsyncSession, test_user: User
) -> None:
    profile = FinanceTaxProfile(
        user_id=test_user.id,
        tax_year=2026,
        jurisdiction="ES",
        reporting_currency="EUR",
        materiality_threshold=Decimal("1"),
        reconciliation_tolerance=Decimal("0.01"),
        status="active",
        valuation_policy={"policy_id": "es-2026-default-v1"},
    )
    test_db_session.add(profile)
    await test_db_session.flush()
    frozen_manifest = {"event_revision_ids": [REVISION_ID], "manifest_sha256": "a" * 64}
    report = FinanceReportRun(
        user_id=test_user.id,
        tax_profile_id=profile.id,
        tax_year=2026,
        jurisdiction="ES",
        reporting_currency="EUR",
        format="zip",
        status="blocked",
        ruleset_versions={},
        algorithm_version="report-v1",
        blockers=[],
        warnings=[],
        manifest=frozen_manifest,
        manifest_sha256="a" * 64,
    )
    test_db_session.add(report)
    await test_db_session.flush()
    test_db_session.add(
        FinanceReportInput(
            report_run_id=report.id,
            input_type="event_revision",
            input_id=REVISION_ID,
            input_hash="b" * 64,
            ordinal=0,
        )
    )
    await test_db_session.flush()
    successor_id = "99999999-9999-4999-8999-999999999999"

    first = await surface_report_restatement_questions(
        test_db_session,
        user_id=test_user.id,
        actor_id=test_user.id,
        input_type="event_revision",
        superseded_input_ids=(REVISION_ID,),
        successor_input_id=successor_id,
        reason="Confirmed a successor event revision.",
    )
    retry = await surface_report_restatement_questions(
        test_db_session,
        user_id=test_user.id,
        actor_id=test_user.id,
        input_type="event_revision",
        superseded_input_ids=(REVISION_ID,),
        successor_input_id=successor_id,
        reason="Confirmed a successor event revision.",
    )

    assert first[0].id == retry[0].id
    assert first[0].question_type == "report_restatement_needed"
    assert report.manifest == frozen_manifest
    assert report.status == "blocked"
    assert await test_db_session.scalar(select(func.count()).select_from(FinanceOpenQuestion)) == 1


@pytest.mark.anyio
async def test_report_api_freezes_export_and_returns_owner_scoped_download_metadata(
    client: AsyncClient,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    uploaded: dict[str, bytes] = {}

    def capture_upload(user_id: str, file_id: str, data: bytes, content_type: str) -> str:
        del content_type
        uploaded[f"{user_id}/{file_id}"] = data
        return f"{user_id}/{file_id}"

    monkeypatch.setattr(storage, "upload", capture_upload)
    cookies = await _login(client, test_user)
    profile = await client.post(
        "/api/finance/tax-profiles",
        json={
            "tax_year": 2026,
            "jurisdiction": "ES",
            "reporting_currency": "EUR",
            "materiality_threshold": "1.00",
            "reconciliation_tolerance": "0.01",
            "status": "active",
        },
        headers={"Idempotency-Key": "report-profile"},
        cookies=cookies,
    )
    assert profile.status_code == 201
    report = await client.post(
        "/api/finance/reports",
        json={
            "tax_profile_id": profile.json()["profile"]["id"],
            "format": "zip",
            "include_warnings": True,
            "expected_event_revision_ids": [],
        },
        headers={"Idempotency-Key": "empty-report"},
        cookies=cookies,
    )
    assert report.status_code == 201
    body = report.json()["report"]
    assert body["status"] == "blocked"
    assert body["readiness"]["blocking_count"] == 1
    assert body["download"] is None
    assert uploaded == {}

    repeated = await client.post(
        "/api/finance/reports",
        json={
            "tax_profile_id": profile.json()["profile"]["id"],
            "format": "zip",
            "include_warnings": True,
            "expected_event_revision_ids": [],
        },
        headers={"Idempotency-Key": "empty-report"},
        cookies=cookies,
    )
    assert repeated.json() == report.json()
    metadata = await client.get(f"/api/finance/reports/{body['id']}/download", cookies=cookies)
    assert metadata.status_code == 409


@pytest.mark.anyio
async def test_report_category_limits_the_frozen_snapshot(
    client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    cookies = await _login(client, test_user)
    profile = FinanceTaxProfile(
        user_id=test_user.id,
        tax_year=2026,
        jurisdiction="ES",
        reporting_currency="EUR",
        materiality_threshold=Decimal("1"),
        reconciliation_tolerance=Decimal("0.01"),
        status="active",
        valuation_policy={"policy_id": "es-2026-default-v1"},
    )
    account = FinanceAccount(
        user_id=test_user.id,
        name="Category account",
        institution="Manual",
        account_type="bank",
        country_code="ES",
        base_currency="EUR",
        tax_jurisdiction="ES",
        provider="manual",
    )
    asset = FinanceAsset(
        user_id=test_user.id,
        asset_type="fiat",
        symbol="EUR",
        name="Euro",
        decimals=2,
    )
    test_db_session.add_all((profile, account, asset))
    await test_db_session.flush()
    revision_ids: list[str] = []
    for index, category in enumerate(("salary_income", "staking_income"), start=1):
        event = FinanceEvent(user_id=test_user.id)
        test_db_session.add(event)
        await test_db_session.flush()
        revision = FinanceEventRevision(
            user_id=test_user.id,
            event_id=event.id,
            revision_number=1,
            event_type="income" if index == 1 else "staking_reward",
            effective_at=datetime(2026, index, 1, 10, tzinfo=UTC),
            tax_date=date(2026, index, 1),
            tax_day_policy="UTC-v1",
            source_account_id=account.id,
            semantic_fingerprint=uuid4().hex,
            status="confirmed",
            derivation_type="fixture",
            derivation_version="1",
            created_by_type="user",
            created_by_id=test_user.id,
            attributes={"jurisdiction": "ES"},
        )
        test_db_session.add(revision)
        await test_db_session.flush()
        event.current_revision_id = revision.id
        valuation = FinanceValuation(
            user_id=test_user.id,
            event_revision_id=revision.id,
            asset_id=asset.id,
            source_currency="EUR",
            target_currency="EUR",
            rate=Decimal("1"),
            value=Decimal(index * 100),
            valued_at=revision.effective_at,
            provider="fixture",
            provider_reference=f"fixture:{revision.id}",
            valuation_policy="fixture-v1",
            tax_year=2026,
            jurisdiction="ES",
        )
        treatment = FinanceTaxTreatment(
            user_id=test_user.id,
            event_revision_id=revision.id,
            tax_profile_id=profile.id,
        )
        test_db_session.add_all((valuation, treatment))
        await test_db_session.flush()
        treatment_revision = FinanceTaxTreatmentRevision(
            user_id=test_user.id,
            treatment_id=treatment.id,
            revision_number=1,
            event_revision_id=revision.id,
            tax_profile_id=profile.id,
            jurisdiction="ES",
            tax_year=2026,
            ruleset_id="fixture",
            ruleset_version="1",
            category=category,
            status="confirmed",
            inputs={},
            output={},
            rationale="Fixture classification",
            source_citations=[],
            missing_facts=[],
            confirmed_by=test_user.id,
            confirmed_at=datetime(2026, 7, 1, tzinfo=UTC),
        )
        test_db_session.add(treatment_revision)
        await test_db_session.flush()
        treatment.current_revision_id = treatment_revision.id
        test_db_session.add(
            FinanceRevisionValuation(
                event_revision_id=revision.id,
                valuation_id=valuation.id,
            )
        )
        revision_ids.append(revision.id)
    await test_db_session.commit()

    response = await client.post(
        "/api/finance/reports",
        json={
            "tax_profile_id": profile.id,
            "format": "csv",
            "include_warnings": True,
            "expected_event_revision_ids": revision_ids,
            "category": "staking_income",
        },
        headers={"Idempotency-Key": "category-report"},
        cookies=cookies,
    )
    assert response.status_code == 201, response.text
    report = await test_db_session.get(FinanceReportRun, response.json()["report"]["id"])
    assert report is not None
    assert report.manifest["event_revision_ids"] == [revision_ids[1]]
    manifest_items = cast(list[dict[str, object]], report.manifest["items"])
    assert [item["category"] for item in manifest_items] == ["staking_income"]
