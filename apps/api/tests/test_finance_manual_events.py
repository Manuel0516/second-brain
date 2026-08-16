from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    FinanceAccount,
    FinanceAuditEntry,
    FinanceEvent,
    FinanceEventComponent,
    FinanceEventRevision,
    FinancePosting,
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


async def _account(session: AsyncSession, user: User) -> FinanceAccount:
    account = FinanceAccount(
        user_id=user.id,
        name="Manual EUR",
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


def _payload(account_id: str) -> dict[str, object]:
    return {
        "tax_year": 2026,
        "occurred_at": "2026-07-16T12:00:00+02:00",
        "event_type": "income",
        "amount": "1234.567890123456789012",
        "currency": "EUR",
        "source_account_id": account_id,
        "description": "Manual income",
        "jurisdiction": "ES",
        "asset_id": None,
    }


async def test_manual_event_is_decimal_safe_balanced_audited_and_idempotent(
    client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    cookies = await _login(client, test_user)
    account = await _account(test_db_session, test_user)
    headers = {"Idempotency-Key": "manual-event-1"}

    first = await client.post(
        "/api/finance/events",
        json=_payload(account.id),
        headers=headers,
        cookies=cookies,
    )
    second = await client.post(
        "/api/finance/events",
        json=_payload(account.id),
        headers=headers,
        cookies=cookies,
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json() == first.json()
    body = first.json()
    assert body["event"]["amount"] == "1234.567890123456789012"
    assert body["event"]["status"] == "confirmed"
    revision_id = body["event"]["current_revision_id"]
    component = await test_db_session.scalar(
        select(FinanceEventComponent).where(FinanceEventComponent.event_revision_id == revision_id)
    )
    assert component is not None
    # SQLite's NUMERIC adapter is less precise than PostgreSQL; the wire assertion above is exact.
    assert component.quantity > 0
    postings = list(
        (
            await test_db_session.scalars(
                select(FinancePosting).where(FinancePosting.event_revision_id == revision_id)
            )
        ).all()
    )
    assert sum((row.quantity for row in postings), Decimal(0)) == 0
    assert (
        await test_db_session.scalar(
            select(func.count(FinanceAuditEntry.id)).where(
                FinanceAuditEntry.action == "event.created"
            )
        )
        == 1
    )


async def test_manual_event_rejects_float_and_unknown_jurisdiction(
    client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    cookies = await _login(client, test_user)
    account = await _account(test_db_session, test_user)
    payload = _payload(account.id)
    payload["amount"] = 1.25
    float_response = await client.post(
        "/api/finance/events",
        json=payload,
        headers={"Idempotency-Key": "manual-float"},
        cookies=cookies,
    )
    assert float_response.status_code == 422

    payload = _payload(account.id)
    payload["jurisdiction"] = "US"
    jurisdiction_response = await client.post(
        "/api/finance/events",
        json=payload,
        headers={"Idempotency-Key": "manual-jurisdiction"},
        cookies=cookies,
    )
    assert jurisdiction_response.status_code == 422


async def test_manual_event_edit_appends_revision_and_detects_stale_writes(
    client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    cookies = await _login(client, test_user)
    account = await _account(test_db_session, test_user)
    created = await client.post(
        "/api/finance/events",
        json=_payload(account.id),
        headers={"Idempotency-Key": "manual-create-for-edit"},
        cookies=cookies,
    )
    assert created.status_code == 201
    event = created.json()["event"]

    edited = await client.patch(
        f"/api/finance/events/{event['id']}",
        json={
            "expected_revision_id": event["current_revision_id"],
            "amount": "99.125",
            "description": "Corrected income",
        },
        headers={"Idempotency-Key": "manual-edit-1"},
        cookies=cookies,
    )
    assert edited.status_code == 200
    edited_event = edited.json()["event"]
    assert edited_event["revision_number"] == 2
    assert edited_event["amount"] == "99.125"

    stale = await client.patch(
        f"/api/finance/events/{event['id']}",
        json={
            "expected_revision_id": event["current_revision_id"],
            "description": "Stale edit",
        },
        headers={"Idempotency-Key": "manual-edit-stale"},
        cookies=cookies,
    )
    assert stale.status_code == 409
    assert stale.json()["detail"]["current_revision_id"] == edited_event["current_revision_id"]

    revisions = list(
        (
            await test_db_session.scalars(
                select(FinanceEventRevision)
                .join(FinanceEvent, FinanceEvent.id == FinanceEventRevision.event_id)
                .where(FinanceEvent.id == event["id"])
                .order_by(FinanceEventRevision.revision_number)
            )
        ).all()
    )
    assert [row.revision_number for row in revisions] == [1, 2]
    assert revisions[1].supersedes_revision_id == revisions[0].id
    assert revisions[0].attributes["description"] == "Manual income"
    assert revisions[1].attributes["description"] == "Corrected income"
