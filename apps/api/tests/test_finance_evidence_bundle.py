import io
import json
import zipfile
from hashlib import sha256
from typing import cast

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FinanceAccount, FinanceImport, User
from app.routes import finance_ingestion

pytestmark = pytest.mark.anyio


async def _login(client: AsyncClient, user: User) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "testpassword123"},
    )
    assert response.status_code == 200
    return {"access_token": response.cookies["access_token"]}


def _memory_storage(monkeypatch: pytest.MonkeyPatch) -> dict[tuple[str, str], bytes]:
    objects: dict[tuple[str, str], bytes] = {}

    def upload(user_id: str, file_id: str, data: bytes, _media_type: str) -> str:
        objects[(user_id, file_id)] = data
        return f"{user_id}/{file_id}"

    def download(user_id: str, file_id: str) -> tuple[bytes, str]:
        return objects[(user_id, file_id)], "text/csv"

    monkeypatch.setattr(finance_ingestion, "upload", upload)
    monkeypatch.setattr(finance_ingestion, "download", download)
    return objects


async def _upload(
    client: AsyncClient,
    cookies: dict[str, str],
    *,
    key: str,
    filename: str,
    source_kind: str,
    data: bytes,
) -> dict[str, object]:
    response = await client.post(
        "/api/finance/evidence",
        files={"file": (filename, data, "text/csv")},
        data={"source_kind": source_kind, "captured_at": "2026-04-01T10:00:00+00:00"},
        headers={"Idempotency-Key": key},
        cookies=cookies,
    )
    assert response.status_code == 201, response.text
    return cast(dict[str, object], response.json())


async def test_evidence_bundle_is_deterministic_grouped_and_jurisdiction_scoped(
    client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _memory_storage(monkeypatch)
    cookies = await _login(client, test_user)
    payslip_bytes = b"date,amount\n2026-01-01,100\n"
    contract_bytes = b"date,amount\n2026-02-01,200\n"
    payslip = await _upload(
        client,
        cookies,
        key="bundle-payslip",
        filename="salary.csv",
        source_kind="payslip",
        data=payslip_bytes,
    )
    contract = await _upload(
        client,
        cookies,
        key="bundle-contract",
        filename="client contract.csv",
        source_kind="contract",
        data=contract_bytes,
    )
    se_account = FinanceAccount(
        user_id=test_user.id,
        name="SE account",
        institution="Manual",
        account_type="bank",
        country_code="SE",
        base_currency="SEK",
        tax_jurisdiction="SE",
        provider="manual",
    )
    es_account = FinanceAccount(
        user_id=test_user.id,
        name="ES account",
        institution="Manual",
        account_type="bank",
        country_code="ES",
        base_currency="EUR",
        tax_jurisdiction="ES",
        provider="manual",
    )
    test_db_session.add_all((se_account, es_account))
    await test_db_session.flush()
    for index, (account, evidence, data) in enumerate(
        (
            (se_account, payslip, payslip_bytes),
            (es_account, contract, contract_bytes),
        )
    ):
        test_db_session.add(
            FinanceImport(
                user_id=test_user.id,
                account_id=account.id,
                evidence_document_id=str(evidence["id"]),
                content_sha256=sha256(data).hexdigest(),
                parser_id="csv",
                parser_version="1",
                import_mode="normal",
                import_fingerprint=f"{index + 1:064x}",
                status="previewed",
                mapping={},
                preview={},
                error_summary={},
            )
        )
    await test_db_session.commit()

    first = await client.get("/api/finance/evidence/bundle?tax_year=2026", cookies=cookies)
    second = await client.get("/api/finance/evidence/bundle?tax_year=2026", cookies=cookies)
    assert first.status_code == 200
    assert first.content == second.content
    with zipfile.ZipFile(io.BytesIO(first.content)) as archive:
        assert archive.namelist() == [
            "manifest.json",
            "01_payslips/salary.csv",
            "04_contracts/client-contract.csv",
        ]
        manifest = json.loads(archive.read("manifest.json"))
        assert [item["source_kind"] for item in manifest["documents"]] == [
            "payslip",
            "contract",
        ]
        assert all(info.date_time == (1980, 1, 1, 0, 0, 0) for info in archive.infolist())

    sweden = await client.get(
        "/api/finance/evidence/bundle?tax_year=2026&jurisdiction=SE", cookies=cookies
    )
    assert sweden.status_code == 200
    with zipfile.ZipFile(io.BytesIO(sweden.content)) as archive:
        assert archive.namelist() == ["manifest.json", "01_payslips/salary.csv"]
