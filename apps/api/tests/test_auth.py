from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Calendar, User
from app.routes import auth as auth_routes

pytestmark = pytest.mark.anyio


@pytest.fixture
async def test_user_with_calendars(test_db_session: AsyncSession, test_user: User) -> User:
    """Create test calendars for a user."""
    calendar1 = Calendar(
        id=str(uuid4()),
        user_id=test_user.id,
        name="Personal",
        color="#FF6B35",
        is_visible=True,
    )
    calendar2 = Calendar(
        id=str(uuid4()),
        user_id=test_user.id,
        name="Work",
        color="#004E89",
        is_visible=True,
    )
    test_db_session.add(calendar1)
    test_db_session.add(calendar2)
    await test_db_session.commit()
    return test_user


async def test_login_success(
    client: AsyncClient, test_user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test successful login."""
    settings = get_settings().model_copy(update={"jwt_access_token_expire_minutes": 1440})
    monkeypatch.setattr(auth_routes, "get_settings", lambda: settings)
    response = await client.post(
        "/api/auth/login",
        json={
            "email": "test@example.com",
            "password": "testpassword123",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"
    assert data["is_active"] is True
    assert "access_token" in response.cookies
    assert "refresh_token" in response.cookies
    cookie_headers = response.headers.get_list("set-cookie")
    assert any(
        header.startswith("access_token=") and "Max-Age=86400" in header
        for header in cookie_headers
    )
    assert any(
        header.startswith("refresh_token=") and "Max-Age=2592000" in header
        for header in cookie_headers
    )


async def test_login_invalid_credentials(client: AsyncClient, test_user: User) -> None:
    """Test login with invalid password."""
    response = await client.post(
        "/api/auth/login",
        json={
            "email": "test@example.com",
            "password": "wrongpassword",
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"


async def test_login_nonexistent_user(client: AsyncClient) -> None:
    """Test login with nonexistent user."""
    response = await client.post(
        "/api/auth/login",
        json={
            "email": "nonexistent@example.com",
            "password": "testpassword123",
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"


async def test_get_me_authenticated(client: AsyncClient, test_user: User) -> None:
    """Test get current user when authenticated."""
    # First login to get tokens
    login_response = await client.post(
        "/api/auth/login",
        json={
            "email": "test@example.com",
            "password": "testpassword123",
        },
    )
    assert login_response.status_code == 200

    # Extract the access token and manually set it in the next request
    access_token = login_response.cookies.get("access_token")
    assert access_token is not None

    # Make a new client with the token cookie
    response = await client.get("/api/auth/me", cookies={"access_token": access_token})

    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"
    assert data["is_active"] is True


async def test_get_me_unauthenticated(client: AsyncClient) -> None:
    """Test get current user when not authenticated."""
    response = await client.get("/api/auth/me")

    assert response.status_code == 401
    assert "Not authenticated" in response.json()["detail"]


async def test_logout(client: AsyncClient, test_user: User) -> None:
    """Test logout."""
    # First login
    login_response = await client.post(
        "/api/auth/login",
        json={
            "email": "test@example.com",
            "password": "testpassword123",
        },
    )
    assert login_response.status_code == 200

    access_token = login_response.cookies.get("access_token")
    refresh_token = login_response.cookies.get("refresh_token")
    assert access_token is not None
    assert refresh_token is not None

    # Then logout
    response = await client.post(
        "/api/auth/logout", cookies={"access_token": access_token, "refresh_token": refresh_token}
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Logged out"


async def test_refresh_token(
    client: AsyncClient, test_user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test refresh token endpoint."""
    settings = get_settings().model_copy(update={"jwt_access_token_expire_minutes": 1440})
    monkeypatch.setattr(auth_routes, "get_settings", lambda: settings)
    # First login
    login_response = await client.post(
        "/api/auth/login",
        json={
            "email": "test@example.com",
            "password": "testpassword123",
        },
    )
    assert login_response.status_code == 200

    refresh_token = login_response.cookies.get("refresh_token")
    assert refresh_token is not None

    # Then refresh
    response = await client.post("/api/auth/refresh", cookies={"refresh_token": refresh_token})
    assert response.status_code == 200
    assert "access_token" in response.cookies
    assert "refresh_token" in response.cookies
    cookie_headers = response.headers.get_list("set-cookie")
    assert any(
        header.startswith("access_token=") and "Max-Age=86400" in header
        for header in cookie_headers
    )


async def test_rate_limit(client: AsyncClient) -> None:
    """Test rate limiting on login attempts."""
    # Try to login 6 times with wrong password (limit is 5)
    for i in range(6):
        response = await client.post(
            "/api/auth/login",
            json={
                "email": "test@example.com",
                "password": "wrongpassword",
            },
        )

        if i < 5:
            assert response.status_code == 401
        else:
            # 6th attempt should be rate limited
            assert response.status_code == 429
