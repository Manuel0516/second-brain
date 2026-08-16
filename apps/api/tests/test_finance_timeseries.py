import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FinanceAccount, User

pytestmark = pytest.mark.anyio


async def _login(client: AsyncClient, user: User) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "testpassword123"},
    )
    assert response.status_code == 200
    return {"access_token": response.cookies["access_token"]}


async def _account(session: AsyncSession, user: User) -> FinanceAccount:
    account = FinanceAccount(
        user_id=user.id,
        name="Timeseries account",
        institution="Manual",
        account_type="bank",
        country_code="ES",
        base_currency="EUR",
        tax_jurisdiction="ES",
        provider="manual",
    )
    session.add(account)
    await session.commit()
    return account


async def _event(
    client: AsyncClient,
    cookies: dict[str, str],
    account_id: str,
    *,
    key: str,
    occurred_at: str,
    event_type: str,
    amount: str,
) -> None:
    year = int(occurred_at[:4])
    response = await client.post(
        "/api/finance/events",
        json={
            "tax_year": year,
            "occurred_at": occurred_at,
            "event_type": event_type,
            "amount": amount,
            "currency": "EUR",
            "source_account_id": account_id,
            "description": key,
            "jurisdiction": "ES",
            "asset_id": None,
        },
        headers={"Idempotency-Key": key},
        cookies=cookies,
    )
    assert response.status_code == 201, response.text


async def test_timeseries_buckets_groups_and_empty_ranges(
    client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    cookies = await _login(client, test_user)
    account = await _account(test_db_session, test_user)
    await _event(
        client,
        cookies,
        account.id,
        key="income-jan-1",
        occurred_at="2026-01-10T10:00:00+01:00",
        event_type="income",
        amount="10.125",
    )
    await _event(
        client,
        cookies,
        account.id,
        key="income-jan-2",
        occurred_at="2026-01-20T10:00:00+01:00",
        event_type="income",
        amount="2.875",
    )
    await _event(
        client,
        cookies,
        account.id,
        key="income-feb",
        occurred_at="2026-02-01T10:00:00+01:00",
        event_type="income",
        amount="7.5",
    )

    response = await client.get(
        "/api/finance/timeseries?tax_year=2026&metric=income&granularity=month&group_by=account",
        cookies=cookies,
    )
    assert response.status_code == 200
    assert response.json()["series"] == [
        {
            "key": account.id,
            "label": "Timeseries account",
            "points": [
                {"t": "2026-01-01", "v": "13.00000000"},
                {"t": "2026-02-01", "v": "7.50000000"},
            ],
        }
    ]
    empty = await client.get(
        "/api/finance/timeseries?tax_year=2026&metric=income&from=2026-03-01&to=2026-03-31",
        cookies=cookies,
    )
    assert empty.status_code == 200
    assert empty.json() == {"series": []}


async def test_summary_returns_previous_year_decimal_totals(
    client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    cookies = await _login(client, test_user)
    account = await _account(test_db_session, test_user)
    await _event(
        client,
        cookies,
        account.id,
        key="previous-income",
        occurred_at="2025-06-01T10:00:00+02:00",
        event_type="income",
        amount="100.25",
    )
    await _event(
        client,
        cookies,
        account.id,
        key="previous-expense",
        occurred_at="2025-06-02T10:00:00+02:00",
        event_type="expense",
        amount="20.25",
    )

    response = await client.get(
        "/api/finance/summary?tax_year=2026&reporting_currency=EUR",
        cookies=cookies,
    )
    assert response.status_code == 200
    assert response.json()["previous_year"] == {
        "income": "100.25000000",
        "expense": "20.25000000",
        "rewards": "0",
        "transfers": "0",
        "net_worth": "80.00000000",
    }
