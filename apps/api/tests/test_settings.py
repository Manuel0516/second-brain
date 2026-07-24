from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.security import hash_password

pytestmark = pytest.mark.anyio


async def _login(client: AsyncClient, session: AsyncSession) -> None:
    user = User(
        id=str(uuid4()),
        username="settingsuser",
        email="settings@example.com",
        password_hash=hash_password("testpassword123"),
        is_active=True,
    )
    session.add(user)
    await session.commit()
    response = await client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "testpassword123"},
    )
    assert response.status_code == 200


async def test_notes_list_styles_default_and_persist(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    await _login(client, test_db_session)

    response = await client.get("/api/settings")
    assert response.status_code == 200
    body = response.json()
    assert body["notes_bullet_style"] == "disc"
    assert body["notes_numbered_style"] == "decimal"

    response = await client.patch(
        "/api/settings",
        json={"notes_bullet_style": "dash", "notes_numbered_style": "upper-roman"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["notes_bullet_style"] == "dash"
    assert body["notes_numbered_style"] == "upper-roman"

    response = await client.get("/api/settings")
    assert response.json()["notes_bullet_style"] == "dash"
    assert response.json()["notes_numbered_style"] == "upper-roman"


async def test_notes_list_styles_reject_unknown_values(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    await _login(client, test_db_session)

    response = await client.patch("/api/settings", json={"notes_bullet_style": "wingdings"})
    assert response.status_code == 422
    response = await client.patch("/api/settings", json={"notes_numbered_style": "emoji"})
    assert response.status_code == 422


async def test_visual_style_defaults_to_neon(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    await _login(client, test_db_session)

    response = await client.get("/api/settings")
    assert response.status_code == 200
    assert response.json()["visual_style"] == "neon"


async def test_visual_style_patch_persists(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    await _login(client, test_db_session)

    response = await client.patch("/api/settings", json={"visual_style": "monochrome"})
    assert response.status_code == 200
    assert response.json()["visual_style"] == "monochrome"

    response = await client.get("/api/settings")
    assert response.json()["visual_style"] == "monochrome"


async def test_visual_style_rejects_unknown_value(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    await _login(client, test_db_session)

    response = await client.patch("/api/settings", json={"visual_style": "sepia"})
    assert response.status_code == 422

    response = await client.get("/api/settings")
    assert response.json()["visual_style"] == "neon"
