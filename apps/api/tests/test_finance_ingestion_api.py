from decimal import Decimal
from pathlib import Path
from typing import cast

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    File,
    FinanceAccount,
    FinanceAsset,
    FinanceAuditEntry,
    FinanceEvent,
    FinanceEventComponent,
    FinanceEventRevision,
    FinancePosting,
    FinanceReconciliation,
    FinanceReviewGroup,
    FinanceReviewGroupMember,
    FinanceValuation,
    User,
)
from app.routes import files as file_routes
from app.routes import finance_ingestion
from app.security import hash_password
from app.services import finance_evidence
from app.services.finance_evidence import FinanceUploadValidationError

pytestmark = pytest.mark.anyio
FIXTURE = Path(__file__).parent / "fixtures" / "finance" / "staking_rewards.csv"
MAPPING = {
    "date_column": "timestamp",
    "quantity_column": "quantity",
    "asset_column": "asset",
    "description_column": "description",
    "external_id_column": "external_id",
    "event_type_column": "event_type",
    "timezone": "Europe/Madrid",
    "decimal_separator": ".",
}


async def _login(client: AsyncClient, user: User) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "testpassword123"},
    )
    assert response.status_code == 200
    return {"access_token": response.cookies["access_token"]}


async def _account(session: AsyncSession, user: User) -> FinanceAccount:
    row = FinanceAccount(
        user_id=user.id,
        name="Fixture exchange",
        institution="Example",
        account_type="exchange",
        country_code="SE",
        base_currency="EUR",
        provider="example",
    )
    session.add(row)
    await session.commit()
    return row


def _memory_storage(monkeypatch: pytest.MonkeyPatch) -> dict[tuple[str, str], tuple[bytes, str]]:
    objects: dict[tuple[str, str], tuple[bytes, str]] = {}

    def upload(user_id: str, file_id: str, data: bytes, media_type: str) -> str:
        objects[(user_id, file_id)] = (data, media_type)
        return f"{user_id}/{file_id}"

    def download(user_id: str, file_id: str) -> tuple[bytes, str]:
        return objects[(user_id, file_id)]

    monkeypatch.setattr(finance_ingestion, "upload", upload)
    monkeypatch.setattr(finance_ingestion, "download", download)
    return objects


async def _upload_fixture(
    client: AsyncClient,
    cookies: dict[str, str],
    *,
    data: bytes,
    filename: str,
    key: str,
) -> dict[str, object]:
    response = await client.post(
        "/api/finance/evidence",
        headers={"Idempotency-Key": key},
        cookies=cookies,
        data={"source_kind": "manual_upload"},
        files={"file": (filename, data, "text/csv")},
    )
    assert response.status_code == 201, response.text
    return cast(dict[str, object], response.json())


@pytest.mark.parametrize(
    "path",
    [
        "/api/finance/source-connections",
        "/api/finance/evidence",
        "/api/finance/imports",
    ],
)
async def test_ingestion_lists_require_authentication(client: AsyncClient, path: str) -> None:
    assert (await client.get(path)).status_code == 401


async def test_evidence_upload_fails_closed_when_scanner_is_unavailable(
    client: AsyncClient,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cookies = await _login(client, test_user)
    objects = _memory_storage(monkeypatch)

    def unavailable(data: bytes, filename: str) -> finance_evidence.MalwareScanResult:
        raise FinanceUploadValidationError(
            "scanner_unavailable",
            "Finance evidence malware scanning is unavailable",
            retryable=True,
        )

    monkeypatch.setattr(finance_evidence, "scan_finance_evidence", unavailable)
    response = await client.post(
        "/api/finance/evidence",
        headers={"Idempotency-Key": "scanner-unavailable"},
        cookies=cookies,
        data={"source_kind": "manual_upload"},
        files={"file": ("rows.csv", b"date,amount\n2026-01-01,1\n", "text/csv")},
    )
    assert response.status_code == 503
    assert response.json()["detail"] == {
        "code": "scanner_unavailable",
        "message": "Finance evidence malware scanning is unavailable",
        "retryable": True,
    }
    assert objects == {}


async def test_source_connections_are_owner_scoped_redacted_idempotent_and_audited(
    client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    account = await _account(test_db_session, test_user)
    cookies = await _login(client, test_user)
    payload = {
        "account_id": account.id,
        "provider": "EXAMPLE",
        "credential_reference": None,
        "permission_scope": ["balances:read", "transactions:read", "balances:read"],
    }
    headers = {"Idempotency-Key": "source-fixture"}
    first = await client.post(
        "/api/finance/source-connections",
        json=payload,
        headers=headers,
        cookies=cookies,
    )
    second = await client.post(
        "/api/finance/source-connections",
        json=payload,
        headers=headers,
        cookies=cookies,
    )
    assert first.status_code == 201
    assert second.json() == first.json()
    body = first.json()
    assert body["source_connection"]["provider"] == "example"
    assert body["source_connection"]["permission_scope"] == [
        "balances:read",
        "transactions:read",
    ]
    assert "credential_reference" not in body["source_connection"]
    assert "last_cursor" not in body["source_connection"]
    assert body["audit"]["action"] == "source_connection.created"

    listing = await client.get("/api/finance/source-connections", cookies=cookies)
    assert listing.status_code == 200
    assert listing.json()["page"]["total"] == 1
    audits = list(
        (
            await test_db_session.scalars(
                select(FinanceAuditEntry).where(FinanceAuditEntry.user_id == test_user.id)
            )
        ).all()
    )
    assert len(audits) == 1


async def test_source_connection_hides_cross_owner_account(
    client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    other = User(
        username="source-other",
        email="source-other@example.com",
        password_hash="unused",
        is_active=True,
    )
    test_db_session.add(other)
    await test_db_session.flush()
    account = await _account(test_db_session, other)
    cookies = await _login(client, test_user)
    response = await client.post(
        "/api/finance/source-connections",
        headers={"Idempotency-Key": "foreign-source"},
        cookies=cookies,
        json={
            "account_id": account.id,
            "provider": "example",
            "credential_reference": None,
            "permission_scope": [],
        },
    )
    assert response.status_code == 404


async def test_evidence_upload_is_hash_idempotent_owner_scoped_and_listed(
    client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    objects = _memory_storage(monkeypatch)
    cookies = await _login(client, test_user)
    data = b"date,amount\n2026-01-01,1\n"
    first = await _upload_fixture(
        client,
        cookies,
        data=data,
        filename="statement.csv",
        key="evidence-fixture",
    )
    second = await _upload_fixture(
        client,
        cookies,
        data=data,
        filename="statement.csv",
        key="evidence-fixture",
    )
    assert second == first
    assert first["retention_status"] == "immutable"
    assert first["download_url"] == f"/api/files/{first['file_id']}"
    assert len(objects) == 1
    listing = await client.get("/api/finance/evidence", cookies=cookies)
    assert listing.status_code == 200
    assert listing.json()["items"] == [first]

    other = User(
        username="evidence-other",
        email="evidence-other@example.com",
        password_hash=hash_password("testpassword123"),
        is_active=True,
    )
    test_db_session.add(other)
    await test_db_session.commit()
    other_cookies = await _login(client, other)
    other_listing = await client.get("/api/finance/evidence", cookies=other_cookies)
    assert other_listing.status_code == 200
    assert other_listing.json()["items"] == []
    assert other_listing.json()["page"]["total"] == 0


async def test_evidence_rejection_uses_typed_error_envelope(
    client: AsyncClient, test_user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    _memory_storage(monkeypatch)
    cookies = await _login(client, test_user)
    response = await client.post(
        "/api/finance/evidence",
        headers={"Idempotency-Key": "bad-evidence"},
        cookies=cookies,
        data={"source_kind": "manual"},
        files={"file": ("statement.pdf", b"not-a-pdf", "application/pdf")},
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "malformed_file"
    assert response.json()["detail"]["retryable"] is False


async def test_frozen_fixture_preview_commit_and_inspection_are_idempotent(
    client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _memory_storage(monkeypatch)
    account = await _account(test_db_session, test_user)
    cookies = await _login(client, test_user)
    evidence = await _upload_fixture(
        client,
        cookies,
        data=FIXTURE.read_bytes(),
        filename="staking_rewards.csv",
        key="staking-evidence",
    )
    preview_request = {
        "evidence_document_id": evidence["id"],
        "account_id": account.id,
        "parser_id": "csv",
        "parser_version": "staking-v1",
        "import_mode": "normal",
        "mapping": MAPPING,
    }
    preview = await client.post(
        "/api/finance/imports/preview",
        headers={"Idempotency-Key": "staking-preview"},
        cookies=cookies,
        json=preview_request,
    )
    repeated_preview = await client.post(
        "/api/finance/imports/preview",
        headers={"Idempotency-Key": "staking-preview"},
        cookies=cookies,
        json=preview_request,
    )
    assert preview.status_code == 200, preview.text
    assert repeated_preview.json() == preview.json()
    assert preview.json()["expected_record_count"] == 24
    assert preview.json()["rejected_record_count"] == 0
    assert preview.json()["mapping"] == MAPPING

    import_id = preview.json()["import_id"]
    commit_payload = {"mapping": MAPPING, "confirm_warnings": []}
    committed = await client.post(
        f"/api/finance/imports/{import_id}/commit",
        headers={"Idempotency-Key": "staking-commit"},
        cookies=cookies,
        json=commit_payload,
    )
    repeated_commit = await client.post(
        f"/api/finance/imports/{import_id}/commit",
        headers={"Idempotency-Key": "staking-commit"},
        cookies=cookies,
        json=commit_payload,
    )
    assert committed.status_code == 200, committed.text
    assert repeated_commit.json() == committed.json()
    assert committed.json()["raw_record_count"] == 24
    assert committed.json()["status"] == "committed"
    assert committed.json()["duplicate_record_count"] == 0
    assert committed.json()["created_event_count"] == 24
    assert len(committed.json()["event_revision_ids"]) == 24
    assert len(committed.json()["review_group_ids"]) == 1

    accounts = await client.get("/api/finance/accounts", cookies=cookies)
    assert accounts.status_code == 200
    assert accounts.json()["items"][0]["last_imported_at"] is not None

    imports = await client.get("/api/finance/imports", cookies=cookies)
    raw = await client.get(f"/api/finance/imports/{import_id}/raw-records", cookies=cookies)
    assert imports.json()["page"]["total"] == 1
    assert raw.json()["page"]["total"] == 24
    assert all(item["rejection_code"] is None for item in raw.json()["items"])

    assert await test_db_session.scalar(select(func.count(FinanceEvent.id))) == 24
    assert await test_db_session.scalar(select(func.count(FinanceEventRevision.id))) == 24
    assert await test_db_session.scalar(select(func.count(FinanceEventComponent.id))) == 24
    assert await test_db_session.scalar(select(func.count(FinanceValuation.id))) == 24
    assert await test_db_session.scalar(select(func.count(FinancePosting.id))) == 0
    assets = list((await test_db_session.scalars(select(FinanceAsset))).all())
    assert {(asset.symbol, asset.asset_type) for asset in assets} == {
        ("ETH", "crypto"),
        ("EUR", "fiat"),
    }
    group = await test_db_session.scalar(select(FinanceReviewGroup))
    assert group is not None
    assert group.native_quantity == Decimal("0.003000000000000000")
    assert group.report_value == Decimal("7.20000000")
    assert (
        await test_db_session.scalar(
            select(func.count(FinanceReviewGroupMember.event_revision_id)).where(
                FinanceReviewGroupMember.group_id == group.id
            )
        )
        == 24
    )

    confirmation = await client.post(
        f"/api/finance/review-groups/{group.id}/confirm",
        headers={"Idempotency-Key": "staking-confirm"},
        cookies=cookies,
        json={
            "expected_member_revision_ids": committed.json()["event_revision_ids"],
            "create_reusable_policy": True,
            "reason": "Verified every row against the immutable fixture evidence",
        },
    )
    assert confirmation.status_code == 200, confirmation.text
    confirmed_ids = confirmation.json()["confirmed_revision_ids"]
    assert len(confirmed_ids) == 24
    assert confirmation.json()["preview"]["posting_count"] == 48
    postings = list(
        (
            await test_db_session.scalars(
                select(FinancePosting).where(FinancePosting.event_revision_id.in_(confirmed_ids))
            )
        ).all()
    )
    assert len(postings) == 48
    assert sum((posting.quantity for posting in postings), Decimal("0")) == 0

    replayed_after_confirmation = await client.post(
        f"/api/finance/imports/{import_id}/commit",
        headers={"Idempotency-Key": "staking-commit-after-confirmation"},
        cookies=cookies,
        json=commit_payload,
    )
    assert replayed_after_confirmation.status_code == 200
    assert replayed_after_confirmation.json() == committed.json()
    assert await test_db_session.scalar(select(func.count(FinanceEvent.id))) == 24
    assert await test_db_session.scalar(select(func.count(FinanceEventRevision.id))) == 48
    evidence_listing = await client.get("/api/finance/evidence", cookies=cookies)
    evidence_item = next(
        item for item in evidence_listing.json()["items"] if item["id"] == evidence["id"]
    )
    assert set(confirmed_ids).issubset(evidence_item["linked_event_revision_ids"])

    reconciliation = await client.post(
        "/api/finance/reconciliations/run",
        headers={"Idempotency-Key": "staking-reconciliation"},
        cookies=cookies,
        json={
            "account_id": account.id,
            "asset_id": group.asset_id,
            "period_start": "2026-07-01",
            "period_end": "2026-07-01",
            "opening_balance": "1.000000",
            "closing_balance": "1.003000",
            "tolerance": "0",
            "source_revision_ids": confirmed_ids,
        },
    )
    assert reconciliation.status_code == 200, reconciliation.text
    assert reconciliation.json()["reconciliation"]["status"] == "reconciled"
    assert await test_db_session.scalar(select(func.count(FinanceReconciliation.id))) == 1

    reprocess_request = {
        **preview_request,
        "parser_version": "staking-v2",
        "import_mode": "reprocess",
    }
    reprocess_preview = await client.post(
        "/api/finance/imports/preview",
        headers={"Idempotency-Key": "staking-reprocess-preview"},
        cookies=cookies,
        json=reprocess_request,
    )
    assert reprocess_preview.status_code == 200, reprocess_preview.text
    assert reprocess_preview.json()["duplicate_file"] is True
    assert reprocess_preview.json()["duplicate_record_count"] == 24
    reprocess_commit = await client.post(
        f"/api/finance/imports/{reprocess_preview.json()['import_id']}/commit",
        headers={"Idempotency-Key": "staking-reprocess-commit"},
        cookies=cookies,
        json={"mapping": MAPPING, "confirm_warnings": ["duplicate_file"]},
    )
    assert reprocess_commit.status_code == 200, reprocess_commit.text
    assert reprocess_commit.json()["status"] == "reprocessed"
    assert reprocess_commit.json()["duplicate_record_count"] == 24
    assert reprocess_commit.json()["rejected_record_count"] == 0
    assert reprocess_commit.json()["created_event_count"] == 0
    assert set(reprocess_commit.json()["event_revision_ids"]) == set(confirmed_ids)
    assert reprocess_commit.json()["review_group_ids"] == []
    assert reprocess_commit.json()["audit"]["action"] == "import.reprocessed"
    assert await test_db_session.scalar(select(func.count(FinanceEvent.id))) == 24
    assert await test_db_session.scalar(select(func.count(FinanceEventRevision.id))) == 48


async def test_rejected_import_rows_remain_visible_through_api(
    client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _memory_storage(monkeypatch)
    account = await _account(test_db_session, test_user)
    cookies = await _login(client, test_user)
    evidence = await _upload_fixture(
        client,
        cookies,
        data=b"timestamp,amount\n2026-01-01T00:00:00Z,nope\n",
        filename="rejected.csv",
        key="rejected-evidence",
    )
    mapping = {"date_column": "timestamp", "amount_column": "amount"}
    preview = await client.post(
        "/api/finance/imports/preview",
        headers={"Idempotency-Key": "rejected-preview"},
        cookies=cookies,
        json={
            "evidence_document_id": evidence["id"],
            "account_id": account.id,
            "parser_id": "csv",
            "parser_version": "1",
            "import_mode": "normal",
            "mapping": mapping,
        },
    )
    assert preview.json()["rejected_record_count"] == 1
    import_id = preview.json()["import_id"]
    commit = await client.post(
        f"/api/finance/imports/{import_id}/commit",
        headers={"Idempotency-Key": "rejected-commit"},
        cookies=cookies,
        json={"mapping": mapping, "confirm_warnings": []},
    )
    assert commit.status_code == 200
    assert commit.json()["status"] == "committed_with_rejections"
    raw = await client.get(f"/api/finance/imports/{import_id}/raw-records", cookies=cookies)
    assert raw.json()["items"][0]["rejection_code"] == "mapping_error"
    assert raw.json()["items"][0]["original_payload"]["amount"] == "nope"


async def test_preview_rejects_non_projectable_and_misspelled_mappings(
    client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _memory_storage(monkeypatch)
    account = await _account(test_db_session, test_user)
    cookies = await _login(client, test_user)
    evidence = await _upload_fixture(
        client,
        cookies,
        data=b"timestamp,amount\n2026-01-01T00:00:00Z,1\n",
        filename="mapping.csv",
        key="mapping-evidence",
    )
    request = {
        "evidence_document_id": evidence["id"],
        "account_id": account.id,
        "parser_id": "csv",
        "parser_version": "1",
        "import_mode": "normal",
        "mapping": {},
    }
    incomplete = await client.post(
        "/api/finance/imports/preview",
        headers={"Idempotency-Key": "mapping-incomplete"},
        cookies=cookies,
        json=request,
    )
    assert incomplete.status_code == 400
    assert incomplete.json()["detail"] == "Transaction imports require date_column"

    request["mapping"] = {
        "date_colum": "timestamp",
        "amount_column": "amount",
    }
    misspelled = await client.post(
        "/api/finance/imports/preview",
        headers={"Idempotency-Key": "mapping-misspelled"},
        cookies=cookies,
        json=request,
    )
    assert misspelled.status_code == 422


async def test_import_resources_hide_cross_owner_existence(
    client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    cookies = await _login(client, test_user)
    unknown = "a5540f32-a094-4ea5-89a4-8e3f3690111b"
    assert (
        await client.get(f"/api/finance/imports/{unknown}/raw-records", cookies=cookies)
    ).status_code == 404
    response = await client.post(
        "/api/finance/imports/preview",
        headers={"Idempotency-Key": "missing-inputs"},
        cookies=cookies,
        json={
            "evidence_document_id": unknown,
            "account_id": unknown,
            "parser_id": "csv",
            "parser_version": "1",
            "import_mode": "normal",
            "mapping": {},
        },
    )
    assert response.status_code == 404


async def test_generic_file_delete_refuses_immutable_finance_evidence(
    client: AsyncClient,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    objects = _memory_storage(monkeypatch)
    removed: list[tuple[str, str]] = []
    monkeypatch.setattr(
        file_routes, "remove", lambda user_id, file_id: removed.append((user_id, file_id))
    )
    cookies = await _login(client, test_user)
    evidence = await _upload_fixture(
        client,
        cookies,
        data=b"date,amount\n2026-01-01,1\n",
        filename="immutable.csv",
        key="immutable-evidence",
    )
    response = await client.delete(f"/api/files/{evidence['file_id']}", cookies=cookies)
    assert response.status_code == 409
    assert response.json()["detail"] == "Immutable Finance evidence cannot be deleted"
    assert removed == []
    assert len(objects) == 1


async def test_guarded_delete_preserves_regular_file_behavior(
    client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    removed: list[tuple[str, str]] = []
    monkeypatch.setattr(
        file_routes, "remove", lambda user_id, file_id: removed.append((user_id, file_id))
    )
    row = File(
        user_id=test_user.id,
        name="ordinary.png",
        content_type="image/png",
        size=10,
    )
    test_db_session.add(row)
    await test_db_session.commit()
    file_id = row.id
    cookies = await _login(client, test_user)
    response = await client.delete(f"/api/files/{file_id}", cookies=cookies)
    assert response.status_code == 204
    assert removed == [(test_user.id, file_id)]
    test_db_session.expire_all()
    assert await test_db_session.get(File, file_id) is None
