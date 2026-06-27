from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Calendar, CalendarEvent, User
from app.security import hash_password

pytestmark = pytest.mark.anyio


@pytest.fixture
async def authenticated_client(client: AsyncClient, test_db_session: AsyncSession) -> AsyncClient:
    """Create an authenticated client with a test user."""
    # Create test user
    user = User(
        id=str(uuid4()),
        email="testuser@example.com",
        password_hash=hash_password("testpassword123"),
        is_active=True,
    )
    test_db_session.add(user)
    await test_db_session.commit()

    # Login
    response = await client.post(
        "/api/auth/login",
        json={
            "email": "testuser@example.com",
            "password": "testpassword123",
        }
    )
    assert response.status_code == 200

    return client


@pytest.fixture
async def user_with_events(test_db_session: AsyncSession) -> tuple[User, Calendar, list[CalendarEvent]]:
    """Create a user with calendars and events."""
    user = User(
        id=str(uuid4()),
        email="eventuser@example.com",
        password_hash=hash_password("testpassword123"),
        is_active=True,
    )
    test_db_session.add(user)
    await test_db_session.flush()

    calendar = Calendar(
        id=str(uuid4()),
        user_id=user.id,
        name="Personal",
        color="#FF6B35",
        is_visible=True,
    )
    test_db_session.add(calendar)
    await test_db_session.flush()

    now = datetime.now(UTC)
    events = []

    # Create events in June 2026
    for i in range(3):
        event = CalendarEvent(
            id=str(uuid4()),
            calendar_id=calendar.id,
            title=f"Event {i+1}",
            description=f"Description {i+1}",
            location=None,
            start_at=now + timedelta(days=i),
            end_at=now + timedelta(days=i, hours=1),
            all_day=False,
            timezone="UTC",
        )
        test_db_session.add(event)
        events.append(event)

    await test_db_session.commit()
    return user, calendar, events


async def test_get_calendars(client: AsyncClient, test_db_session: AsyncSession) -> None:
    """Test getting user's calendars."""
    # Create test user and get auth
    from uuid import uuid4

    from app.models import User
    from app.security import hash_password

    user = User(
        id=str(uuid4()),
        email="caluser@example.com",
        password_hash=hash_password("testpassword123"),
        is_active=True,
    )
    test_db_session.add(user)
    await test_db_session.flush()

    # Create some calendars
    calendar1 = Calendar(
        id=str(uuid4()),
        user_id=user.id,
        name="Personal",
        color="#FF6B35",
        is_visible=True,
    )
    calendar2 = Calendar(
        id=str(uuid4()),
        user_id=user.id,
        name="Work",
        color="#004E89",
        is_visible=True,
    )
    test_db_session.add(calendar1)
    test_db_session.add(calendar2)
    await test_db_session.commit()

    # Login
    login_response = await client.post(
        "/api/auth/login",
        json={
            "email": "caluser@example.com",
            "password": "testpassword123",
        }
    )
    assert login_response.status_code == 200
    access_token = login_response.cookies.get("access_token")

    # Get calendars
    response = await client.get(
        "/api/calendars",
        cookies={"access_token": access_token}
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 2
    names = [cal["name"] for cal in data]
    assert "Personal" in names
    assert "Work" in names


async def test_get_calendars_unauthenticated(client: AsyncClient) -> None:
    """Test getting calendars without authentication."""
    response = await client.get("/api/calendars")

    assert response.status_code == 401


async def test_get_events_in_range(
    client: AsyncClient,
    test_db_session: AsyncSession,
    user_with_events: tuple[User, Calendar, list[CalendarEvent]]
) -> None:
    """Test getting events in a date range."""
    user, calendar, events = user_with_events

    # Login as this user
    response = await client.post(
        "/api/auth/login",
        json={
            "email": "eventuser@example.com",
            "password": "testpassword123",
        }
    )
    assert response.status_code == 200
    access_token = response.cookies.get("access_token")

    # Query events with date range
    now = datetime.now(UTC)
    from_date = (now - timedelta(days=1)).isoformat()
    to_date = (now + timedelta(days=5)).isoformat()

    response = await client.get(
        "/api/events",
        params={
            "from_date": from_date,
            "to_date": to_date,
        },
        cookies={"access_token": access_token}
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 3


async def test_get_events_unauthenticated(client: AsyncClient) -> None:
    """Test getting events without authentication."""
    now = datetime.now(UTC)
    response = await client.get(
        "/api/events",
        params={
            "from_date": (now - timedelta(days=1)).isoformat(),
            "to_date": (now + timedelta(days=5)).isoformat(),
        }
    )

    assert response.status_code == 401


async def test_get_events_filtered_by_calendar(
    client: AsyncClient,
    test_db_session: AsyncSession,
    user_with_events: tuple[User, Calendar, list[CalendarEvent]]
) -> None:
    """Test getting events filtered by calendar IDs."""
    user, calendar, events = user_with_events

    # Create another calendar
    calendar2 = Calendar(
        id=str(uuid4()),
        user_id=user.id,
        name="Work",
        color="#004E89",
        is_visible=True,
    )
    test_db_session.add(calendar2)
    await test_db_session.commit()

    # Login
    response = await client.post(
        "/api/auth/login",
        json={
            "email": "eventuser@example.com",
            "password": "testpassword123",
        }
    )
    assert response.status_code == 200
    access_token = response.cookies.get("access_token")

    # Query events filtered by calendar_ids
    now = datetime.now(UTC)
    from_date = (now - timedelta(days=1)).isoformat()
    to_date = (now + timedelta(days=5)).isoformat()

    response = await client.get(
        "/api/events",
        params={
            "from_date": from_date,
            "to_date": to_date,
            "calendar_ids": [calendar.id],
        },
        cookies={"access_token": access_token}
    )

    assert response.status_code == 200
    data = response.json()
    # Should only get events from the first calendar
    for event in data:
        assert event["calendar_id"] == calendar.id
