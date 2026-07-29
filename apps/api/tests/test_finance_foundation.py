import csv
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import security
from app.models import FinanceAccount, FinanceAuditEntry, User
from app.routes import finance as finance_route

pytestmark = pytest.mark.anyio

FIXTURE = Path(__file__).parent / "fixtures" / "finance" / "staking_rewards.csv"


async def _login(client: AsyncClient, user: User) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "testpassword123"},
    )
    assert response.status_code == 200
    return {"access_token": response.cookies["access_token"]}


def test_staking_fixture_totals_are_frozen() -> None:
    with FIXTURE.open(newline="", encoding="utf-8") as fixture:
        rows = list(csv.DictReader(fixture))

    assert len(rows) == 24
    total_quantity = sum(Decimal(row["quantity"]) for row in rows)
    total_value = sum(Decimal(row["quantity"]) * Decimal(row["price_eur"]) for row in rows)
    assert total_quantity == Decimal("0.003000")
    assert total_value == Decimal("7.20000000")
    assert {row["event_type"] for row in rows} == {"staking_reward"}


def test_finance_sensitive_values_use_a_dedicated_validated_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    key = Fernet.generate_key().decode()
    monkeypatch.setattr(
        security,
        "get_settings",
        lambda: SimpleNamespace(finance_encryption_key=key),
    )
    encrypted = security.encrypt_finance_value("provider-account-123")
    assert "provider-account-123" not in encrypted
    assert security.decrypt_finance_value(encrypted) == "provider-account-123"

    monkeypatch.setattr(
        security,
        "get_settings",
        lambda: SimpleNamespace(finance_encryption_key="not-a-fernet-key"),
    )
    with pytest.raises(RuntimeError, match="invalid"):
        security.encrypt_finance_value("provider-account-123")
    assert security.decrypt_finance_value(encrypted) == ""


@pytest.mark.parametrize(
    "path",
    [
        "/api/finance/summary?tax_year=2026",
        "/api/finance/activity",
        "/api/finance/accounts",
        "/api/finance/assets",
    ],
)
async def test_finance_endpoints_require_authentication(client: AsyncClient, path: str) -> None:
    response = await client.get(path)
    assert response.status_code == 401


async def test_empty_summary_uses_decimal_strings_and_typed_empty_state(
    client: AsyncClient, test_user: User
) -> None:
    cookies = await _login(client, test_user)
    response = await client.get(
        "/api/finance/summary?tax_year=2026&jurisdiction=SE",
        cookies=cookies,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["tax_year"] == 2026
    assert body["jurisdiction"] == "SE"
    assert body["totals"] == {
        "income": "0",
        "expense": "0",
        "rewards": "0",
        "transfers": "0",
        "net": "0",
        "net_worth": None,
    }
    assert body["empty_state"]["code"] == "finance_not_started"


async def test_account_creation_is_idempotent_and_audited(
    client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    cookies = await _login(client, test_user)
    payload = {
        "name": "Fixture exchange",
        "institution": "Example",
        "account_type": "exchange",
        "country_code": "se",
        "base_currency": "eur",
        "tax_jurisdiction": "se",
        "provider": "manual",
        "external_reference": None,
        "opened_at": None,
    }
    headers = {"Idempotency-Key": "foundation-account"}

    first = await client.post(
        "/api/finance/accounts",
        json=payload,
        headers=headers,
        cookies=cookies,
    )
    second = await client.post(
        "/api/finance/accounts",
        json=payload,
        headers=headers,
        cookies=cookies,
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json() == first.json()
    assert first.json()["account"]["country_code"] == "SE"
    assert first.json()["account"]["base_currency"] == "EUR"

    accounts = list(
        (
            await test_db_session.scalars(
                select(FinanceAccount).where(FinanceAccount.user_id == test_user.id)
            )
        ).all()
    )
    audits = list(
        (
            await test_db_session.scalars(
                select(FinanceAuditEntry).where(FinanceAuditEntry.user_id == test_user.id)
            )
        ).all()
    )
    assert len(accounts) == 1
    assert len(audits) == 1
    assert audits[0].action == "account.created"


async def test_account_creation_maps_invalid_encryption_key_to_service_unavailable(
    client: AsyncClient,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cookies = await _login(client, test_user)

    def invalid_encryption_key(_value: str) -> str:
        raise ValueError("invalid key")

    monkeypatch.setattr(finance_route, "encrypt_finance_value", invalid_encryption_key)

    response = await client.post(
        "/api/finance/accounts",
        json={
            "name": "Fixture exchange",
            "institution": "Example",
            "account_type": "exchange",
            "country_code": "SE",
            "base_currency": "EUR",
            "tax_jurisdiction": "SE",
            "provider": "manual",
            "external_reference": "sensitive-reference",
            "opened_at": None,
        },
        headers={"Idempotency-Key": "invalid-encryption-key"},
        cookies=cookies,
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Finance encryption is not configured"


async def test_idempotency_key_rejects_changed_content(
    client: AsyncClient, test_user: User
) -> None:
    cookies = await _login(client, test_user)
    headers = {"Idempotency-Key": "conflicting-account"}
    payload = {
        "name": "First",
        "institution": "Example",
        "account_type": "bank",
        "country_code": "SE",
        "base_currency": "SEK",
        "tax_jurisdiction": "SE",
        "provider": "manual",
        "external_reference": None,
        "opened_at": None,
    }
    first = await client.post(
        "/api/finance/accounts",
        json=payload,
        headers=headers,
        cookies=cookies,
    )
    assert first.status_code == 201

    payload["name"] = "Changed"
    conflict = await client.post(
        "/api/finance/accounts",
        json=payload,
        headers=headers,
        cookies=cookies,
    )
    assert conflict.status_code == 409
    assert "different request content" in conflict.json()["detail"]


async def test_account_listing_is_owner_scoped(
    client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    other = User(
        username="other",
        email="other@example.com",
        password_hash="unused",
        is_active=True,
    )
    test_db_session.add(other)
    await test_db_session.flush()
    test_db_session.add(
        FinanceAccount(
            user_id=other.id,
            name="Hidden",
            institution="Other",
            account_type="bank",
            country_code="ES",
            base_currency="EUR",
            provider="manual",
        )
    )
    await test_db_session.commit()

    cookies = await _login(client, test_user)
    response = await client.get("/api/finance/accounts", cookies=cookies)
    assert response.status_code == 200
    assert response.json()["items"] == []
    assert response.json()["page"]["total"] == 0
