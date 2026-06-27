from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
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
        },
    )
    assert response.status_code == 200
    access_token = response.cookies.get("access_token")
    assert access_token is not None
    client.cookies.set("access_token", access_token)

    return client


@pytest.fixture
async def user_with_events(
    test_db_session: AsyncSession,
) -> tuple[User, Calendar, list[CalendarEvent]]:
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
            title=f"Event {i + 1}",
            description=f"Description {i + 1}",
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
        },
    )
    assert login_response.status_code == 200
    access_token = login_response.cookies.get("access_token")
    assert access_token is not None

    # Get calendars
    response = await client.get("/api/calendars", cookies={"access_token": access_token})

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
    user_with_events: tuple[User, Calendar, list[CalendarEvent]],
) -> None:
    """Test getting events in a date range."""
    user, calendar, events = user_with_events

    # Login as this user
    response = await client.post(
        "/api/auth/login",
        json={
            "email": "eventuser@example.com",
            "password": "testpassword123",
        },
    )
    assert response.status_code == 200
    access_token = response.cookies.get("access_token")
    assert access_token is not None

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
        cookies={"access_token": access_token},
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
        },
    )

    assert response.status_code == 401


async def test_get_events_filtered_by_calendar(
    client: AsyncClient,
    test_db_session: AsyncSession,
    user_with_events: tuple[User, Calendar, list[CalendarEvent]],
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
        },
    )
    assert response.status_code == 200
    access_token = response.cookies.get("access_token")
    assert access_token is not None

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
        cookies={"access_token": access_token},
    )

    assert response.status_code == 200
    data = response.json()
    # Should only get events from the first calendar
    for event in data:
        assert event["calendar_id"] == calendar.id


async def test_event_create_update_delete(
    authenticated_client: AsyncClient, test_db_session: AsyncSession
) -> None:
    user = await test_db_session.scalar(select(User).where(User.email == "testuser@example.com"))
    assert user is not None
    calendar = Calendar(user_id=user.id, name="Work", color="#3B6FE0", is_visible=True)
    test_db_session.add(calendar)
    await test_db_session.commit()

    start = datetime.now(UTC) + timedelta(days=1)
    created = await authenticated_client.post(
        "/api/events",
        json={
            "calendar_id": calendar.id,
            "title": "Planning",
            "start_at": start.isoformat(),
            "end_at": (start + timedelta(hours=1)).isoformat(),
            "color_override": "#D9573F",
            "location": "Office",
            "link": "https://example.com/agenda",
            "reminder_minutes": 15,
            "rrule": "WEEKLY",
        },
    )
    assert created.status_code == 201
    event = created.json()
    assert event["rrule"] == "WEEKLY"

    updated = await authenticated_client.patch(
        f"/api/events/{event['id']}", json={"title": "Weekly planning"}
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Weekly planning"

    deleted = await authenticated_client.delete(f"/api/events/{event['id']}")
    assert deleted.status_code == 204


async def test_event_rejects_blank_title(
    authenticated_client: AsyncClient, test_db_session: AsyncSession
) -> None:
    user = await test_db_session.scalar(select(User).where(User.email == "testuser@example.com"))
    assert user is not None
    calendar = Calendar(user_id=user.id, name="Default", color="#8B5CF6", is_visible=True)
    test_db_session.add(calendar)
    await test_db_session.commit()
    start = datetime.now(UTC) + timedelta(days=1)

    response = await authenticated_client.post(
        "/api/events",
        json={
            "calendar_id": calendar.id,
            "title": "   ",
            "start_at": start.isoformat(),
            "end_at": (start + timedelta(hours=1)).isoformat(),
        },
    )

    assert response.status_code == 422


async def test_bulk_move_and_copy_events(
    authenticated_client: AsyncClient, test_db_session: AsyncSession
) -> None:
    user = await test_db_session.scalar(select(User).where(User.email == "testuser@example.com"))
    assert user is not None
    calendar = Calendar(user_id=user.id, name="Default", color="#8B5CF6", is_visible=True)
    test_db_session.add(calendar)
    await test_db_session.flush()
    start = datetime.now(UTC).replace(microsecond=0) + timedelta(days=1)
    originals = [
        CalendarEvent(
            calendar_id=calendar.id,
            title=f"Event {index}",
            start_at=start + timedelta(hours=index),
            end_at=start + timedelta(hours=index + 1),
            all_day=False,
            timezone="UTC",
        )
        for index in range(2)
    ]
    test_db_session.add_all(originals)
    await test_db_session.commit()

    moved_start = start + timedelta(days=2)
    moved = await authenticated_client.patch(
        "/api/events",
        json={
            "events": [
                {
                    "id": event.id,
                    "original_start_at": (start + timedelta(hours=index)).isoformat(),
                    "start_at": (moved_start + timedelta(hours=index)).isoformat(),
                    "end_at": (moved_start + timedelta(hours=index + 1)).isoformat(),
                }
                for index, event in enumerate(originals)
            ]
        },
    )
    assert moved.status_code == 200
    assert [event["title"] for event in moved.json()] == ["Event 0", "Event 1"]

    target = moved_start + timedelta(days=7)
    copied = await authenticated_client.post(
        "/api/events/copy",
        json={"event_ids": [event.id for event in originals], "target_start": target.isoformat()},
    )
    assert copied.status_code == 201
    copies = copied.json()
    assert len(copies) == 2
    assert datetime.fromisoformat(copies[1]["start_at"]) - datetime.fromisoformat(
        copies[0]["start_at"]
    ) == timedelta(hours=1)
