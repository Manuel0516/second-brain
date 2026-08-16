import io

import pytest
from httpx import AsyncClient
from reportlab.pdfgen import canvas  # type: ignore[import-untyped]
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FinanceAccount, User
from app.routes import finance_ingestion

pytestmark = pytest.mark.anyio


async def _login(client: AsyncClient, user: User) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "testpassword123"},
    )
    assert response.status_code == 200
    return {"access_token": response.cookies["access_token"]}


def _statement_pdf() -> bytes:
    output = io.BytesIO()
    document = canvas.Canvas(output, invariant=True)
    document.setFont("Courier", 10)
    lines = [
        "Fixture bank statement",
        "2026-01-01 Salary 100.00 EUR",
        "2026-01-02 Coffee -3.50 EUR",
        "03/01/2026 Savings interest 1,25 EUR",
        "2026-01-04 Rent -40.00 EUR",
        "2026-01-05 Reward 0.125 EUR",
        "2026-01-06 Groceries -12.75 EUR",
    ]
    y = 790
    for line in lines:
        document.drawString(50, y, line)
        y -= 18
    document.save()
    return output.getvalue()


def _memory_storage(monkeypatch: pytest.MonkeyPatch) -> None:
    objects: dict[tuple[str, str], tuple[bytes, str]] = {}

    def upload(user_id: str, file_id: str, data: bytes, media_type: str) -> str:
        objects[(user_id, file_id)] = (data, media_type)
        return f"{user_id}/{file_id}"

    def download(user_id: str, file_id: str) -> tuple[bytes, str]:
        return objects[(user_id, file_id)]

    monkeypatch.setattr(finance_ingestion, "upload", upload)
    monkeypatch.setattr(finance_ingestion, "download", download)


async def test_pdf_statement_preview_correction_commit_and_replay(
    client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _memory_storage(monkeypatch)
    cookies = await _login(client, test_user)
    account = FinanceAccount(
        user_id=test_user.id,
        name="PDF bank",
        institution="Fixture",
        account_type="bank",
        country_code="ES",
        base_currency="EUR",
        tax_jurisdiction="ES",
        provider="manual",
    )
    test_db_session.add(account)
    await test_db_session.commit()
    pdf = _statement_pdf()
    upload = await client.post(
        "/api/finance/evidence",
        files={"file": ("statement.pdf", pdf, "application/pdf")},
        data={"source_kind": "statement", "captured_at": "2026-01-07T10:00:00+00:00"},
        headers={"Idempotency-Key": "pdf-evidence"},
        cookies=cookies,
    )
    assert upload.status_code == 201, upload.text

    preview = await client.post(
        "/api/finance/imports/preview",
        json={
            "evidence_document_id": upload.json()["id"],
            "account_id": account.id,
            "parser_id": "pdf_statement",
            "parser_version": "generic-v1",
            "import_mode": "normal",
            "mapping": {},
        },
        headers={"Idempotency-Key": "pdf-preview"},
        cookies=cookies,
    )
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["source_format"] == "pdf"
    assert body["unparsed_line_count"] >= 1
    assert len(body["rows"]) == 6
    assert {row["confidence"] for row in body["rows"]} == {"high", "medium"}
    first_index = body["rows"][0]["source_index"]
    excluded_index = body["rows"][-1]["source_index"]
    warning_codes = [item["code"] for item in body["warnings"]]

    commit_payload = {
        "mapping": body["mapping"],
        "confirm_warnings": warning_codes,
        "row_overrides": [
            {
                "source_index": first_index,
                "amount": "101.25",
                "description": "Corrected salary",
            }
        ],
        "excluded_source_indexes": [excluded_index],
    }
    committed = await client.post(
        f"/api/finance/imports/{body['import_id']}/commit",
        json=commit_payload,
        headers={"Idempotency-Key": "pdf-commit"},
        cookies=cookies,
    )
    assert committed.status_code == 200, committed.text
    assert committed.json()["raw_record_count"] == 5
    assert committed.json()["created_event_count"] == 5

    replay = await client.post(
        f"/api/finance/imports/{body['import_id']}/commit",
        json=commit_payload,
        headers={"Idempotency-Key": "pdf-commit-replay"},
        cookies=cookies,
    )
    assert replay.status_code == 200, replay.text
    assert replay.json()["event_revision_ids"] == committed.json()["event_revision_ids"]
