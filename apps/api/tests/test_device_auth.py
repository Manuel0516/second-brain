"""Device authorization flow (Telegram bot login without a shared password)."""

from datetime import UTC, datetime, timedelta
from typing import Any, cast

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DeviceGrant, User
from app.routes.device import DEVICE_TTL_MINUTES

pytestmark = pytest.mark.anyio


async def login(client: AsyncClient) -> None:
    response = await client.post(
        "/api/auth/login", json={"email": "test@example.com", "password": "testpassword123"}
    )
    assert response.status_code == 200


async def create_device(client: AsyncClient) -> dict[str, Any]:
    response = await client.post("/api/auth/device")
    assert response.status_code == 201
    return cast(dict[str, Any], response.json())


async def test_device_create_returns_code_and_url(client: AsyncClient) -> None:
    payload = await create_device(client)
    assert len(payload["user_code"]) == 8
    assert payload["verification_url"].startswith("/device?code=")
    assert payload["device_code"]
    assert payload["expires_at"]


async def test_device_status_pending_then_approve_without_auth_is_rejected(
    client: AsyncClient,
) -> None:
    payload = await create_device(client)
    status_response = await client.get(
        "/api/auth/device/status", params={"device_code": payload["device_code"]}
    )
    assert status_response.status_code == 200
    assert status_response.json()["status"] == "pending"

    # Approving without a logged-in user must 401.
    approve = await client.post(
        "/api/auth/device/approve", json={"user_code": payload["user_code"]}
    )
    assert approve.status_code == 401


async def test_full_device_flow_mints_bearer_token(client: AsyncClient, test_user: User) -> None:
    await login(client)
    payload = await create_device(client)

    approve = await client.post(
        "/api/auth/device/approve", json={"user_code": payload["user_code"]}
    )
    assert approve.status_code == 200

    # First status poll delivers the one-time token.
    status_response = await client.get(
        "/api/auth/device/status", params={"device_code": payload["device_code"]}
    )
    assert status_response.status_code == 200
    body = status_response.json()
    assert body["status"] == "approved"
    assert body["token"]

    # Second poll must not re-deliver the token.
    again = await client.get(
        "/api/auth/device/status", params={"device_code": payload["device_code"]}
    )
    assert again.json()["status"] == "approved"
    assert again.json()["token"] is None

    # The bearer token authenticates API calls as the approving user.
    response = await client.get(
        "/api/ai/settings", headers={"Authorization": f"Bearer {body['token']}"}
    )
    assert response.status_code == 200


async def test_approve_unknown_code_is_404(client: AsyncClient, test_user: User) -> None:
    await login(client)
    response = await client.post("/api/auth/device/approve", json={"user_code": "ZZZZZZZZ"})
    assert response.status_code == 404


async def test_device_status_unknown_code_is_404(client: AsyncClient) -> None:
    response = await client.get(
        "/api/auth/device/status", params={"device_code": "definitely-not-a-code"}
    )
    assert response.status_code == 404


async def test_device_approve_twice_is_conflict(client: AsyncClient, test_user: User) -> None:
    await login(client)
    payload = await create_device(client)
    first = await client.post("/api/auth/device/approve", json={"user_code": payload["user_code"]})
    assert first.status_code == 200
    second = await client.post("/api/auth/device/approve", json={"user_code": payload["user_code"]})
    assert second.status_code == 409


async def test_expired_grant_reports_expired(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    payload = await create_device(client)
    # Force the grant into the past directly in the DB.
    result = await test_db_session.execute(
        select(DeviceGrant).where(DeviceGrant.user_code == payload["user_code"])
    )
    grant = result.scalar_one()
    grant.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    await test_db_session.commit()

    status_response = await client.get(
        "/api/auth/device/status", params={"device_code": payload["device_code"]}
    )
    assert status_response.json()["status"] == "expired"
    # TTL constant sanity: it must stay in a reasonable range.
    assert DEVICE_TTL_MINUTES == 10
