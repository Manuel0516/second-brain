from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Calendar, CalendarEvent, Link, MealLog, User, WorkoutSession
from app.security import hash_password

pytestmark = pytest.mark.anyio


@pytest.fixture
async def authenticated_client(client: AsyncClient, test_db_session: AsyncSession) -> AsyncClient:
    """Create an authenticated client with a test user."""
    # Create test user
    user = User(
        id=str(uuid4()),
        username="testuser",
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
        username="eventuser",
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
        username="caluser",
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
            "icon": "☕",
            "title": "Planning",
            "start_at": start.isoformat(),
            "end_at": (start + timedelta(hours=1)).isoformat(),
            "color_override": "#D9573F",
            "location": "Office",
            "link": "https://example.com/agenda",
            "reminder_minutes": 15,
            "rrule": "WEEKLY",
            "connections": {
                "finance": {
                    "type": "expense",
                    "amount": 250,
                    "currency": "SEK",
                    "category": "Work",
                    "counterparty": "Studio",
                    "tax_relevant": True,
                },
                "fitness": {
                    "workout_type": "Strength",
                    "notes": "Upper body",
                },
            },
        },
    )
    assert created.status_code == 201
    event = created.json()
    assert event["icon"] == "☕"
    assert event["rrule"] == "WEEKLY"
    assert event["connections"]["finance"]["amount"] == 250
    assert event["connections"]["fitness"]["workout_type"] == "Strength"

    updated = await authenticated_client.patch(
        f"/api/events/{event['id']}",
        json={"title": "Weekly planning", "icon": "📌"},
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Weekly planning"
    assert updated.json()["icon"] == "📌"

    deleted = await authenticated_client.delete(f"/api/events/{event['id']}")
    assert deleted.status_code == 204


async def test_adding_food_to_existing_one_off_event_creates_planned_meal(
    authenticated_client: AsyncClient, test_db_session: AsyncSession
) -> None:
    user = await test_db_session.scalar(select(User).where(User.email == "testuser@example.com"))
    assert user is not None
    calendar = Calendar(user_id=user.id, name="Food", color="#2E9E6E", is_visible=True)
    test_db_session.add(calendar)
    await test_db_session.commit()

    start = datetime.now(UTC) + timedelta(days=1)
    created = await authenticated_client.post(
        "/api/events",
        json={
            "calendar_id": calendar.id,
            "title": "Lunch",
            "start_at": start.isoformat(),
            "end_at": (start + timedelta(hours=1)).isoformat(),
        },
    )
    assert created.status_code == 201

    updated = await authenticated_client.patch(
        f"/api/events/{created.json()['id']}",
        json={"connections": {"food": {"meal_type": "lunch", "notes": "Salad"}}},
    )
    assert updated.status_code == 200

    meal = await test_db_session.scalar(
        select(MealLog).where(MealLog.user_id == user.id, MealLog.meal_type == "lunch")
    )
    assert meal is not None
    assert meal.status == "planned"
    assert meal.scheduled_at == meal.date
    link = await test_db_session.scalar(
        select(Link).where(
            Link.source_type == "event",
            Link.source_id == created.json()["id"],
            Link.target_type == "meal_log",
            Link.target_id == meal.id,
            Link.relation == "logged_from",
        )
    )
    assert link is not None


async def test_adding_fitness_to_existing_one_off_event_creates_planned_workout(
    authenticated_client: AsyncClient, test_db_session: AsyncSession
) -> None:
    user = await test_db_session.scalar(select(User).where(User.email == "testuser@example.com"))
    assert user is not None
    calendar = Calendar(user_id=user.id, name="Fitness", color="#2E9E6E", is_visible=True)
    test_db_session.add(calendar)
    await test_db_session.commit()

    start = datetime.now(UTC) + timedelta(days=1)
    created = await authenticated_client.post(
        "/api/events",
        json={
            "calendar_id": calendar.id,
            "title": "Strength training",
            "start_at": start.isoformat(),
            "end_at": (start + timedelta(hours=1)).isoformat(),
        },
    )
    assert created.status_code == 201

    updated = await authenticated_client.patch(
        f"/api/events/{created.json()['id']}",
        json={
            "connections": {
                "fitness": {"workout_type": "Strength", "notes": "Upper body"}
            }
        },
    )
    assert updated.status_code == 200

    workout = await test_db_session.scalar(
        select(WorkoutSession).where(
            WorkoutSession.user_id == user.id,
            WorkoutSession.type == "Strength",
        )
    )
    assert workout is not None
    assert workout.status == "planned"
    assert workout.scheduled_at == workout.date
    link = await test_db_session.scalar(
        select(Link).where(
            Link.source_type == "event",
            Link.source_id == created.json()["id"],
            Link.target_type == "workout_session",
            Link.target_id == workout.id,
            Link.relation == "logged_from",
        )
    )
    assert link is not None


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


async def test_event_rejects_invalid_connection_data(
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
            "title": "Lunch",
            "start_at": start.isoformat(),
            "end_at": (start + timedelta(hours=1)).isoformat(),
            "connections": {
                "finance": {
                    "type": "expense",
                    "amount": 0,
                    "currency": "SEK",
                    "category": "Food",
                }
            },
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


def _next_monday() -> datetime:
    base = datetime.now(UTC).replace(hour=9, minute=0, second=0, microsecond=0)
    return base + timedelta(days=(0 - base.weekday()) % 7 or 7)


async def _make_calendar(client: AsyncClient, session: AsyncSession) -> Calendar:
    user = await session.scalar(select(User).where(User.email == "testuser@example.com"))
    assert user is not None
    calendar = Calendar(user_id=user.id, name="Recurring", color="#2E9E6E", is_visible=True)
    session.add(calendar)
    await session.commit()
    return calendar


async def _create_series(
    client: AsyncClient, calendar_id: str, **rule: object
) -> dict[str, object]:
    monday = _next_monday()
    response = await client.post(
        "/api/events",
        json={
            "calendar_id": calendar_id,
            "title": "Standup",
            "start_at": monday.isoformat(),
            "end_at": (monday + timedelta(hours=1)).isoformat(),
            "rrule": "WEEKLY",
            **rule,
        },
    )
    assert response.status_code == 201, response.text
    result: dict[str, object] = response.json()
    return result


async def _list_events(client: AsyncClient, window_days: int = 21) -> list[dict[str, object]]:
    monday = _next_monday()
    response = await client.get(
        "/api/events",
        params={
            "from_date": (monday - timedelta(days=1)).isoformat(),
            "to_date": (monday + timedelta(days=window_days)).isoformat(),
        },
    )
    assert response.status_code == 200
    return sorted(response.json(), key=lambda e: e["start_at"])


async def test_weekly_byday_and_count_expansion(
    authenticated_client: AsyncClient, test_db_session: AsyncSession
) -> None:
    calendar = await _make_calendar(authenticated_client, test_db_session)
    await _create_series(
        authenticated_client,
        calendar.id,
        recurrence_byday=["MO", "WE"],
        recurrence_count=4,
    )
    events = await _list_events(authenticated_client)
    weekdays = [datetime.fromisoformat(str(e["start_at"])).weekday() for e in events]
    # Mon, Wed, Mon, Wed across two weeks — count caps it at four.
    assert weekdays == [0, 2, 0, 2]


async def test_delete_single_occurrence_keeps_series(
    authenticated_client: AsyncClient, test_db_session: AsyncSession
) -> None:
    calendar = await _make_calendar(authenticated_client, test_db_session)
    series = await _create_series(authenticated_client, calendar.id, recurrence_count=4)
    second = (_next_monday() + timedelta(days=7)).isoformat()
    deleted = await authenticated_client.delete(
        f"/api/events/{series['id']}", params={"scope": "this", "occurrence_start": second}
    )
    assert deleted.status_code == 204
    starts = [str(e["start_at"]) for e in await _list_events(authenticated_client, 28)]
    assert datetime.fromisoformat(second) not in [datetime.fromisoformat(s) for s in starts]
    assert len(starts) == 3


async def test_edit_single_occurrence_creates_override(
    authenticated_client: AsyncClient, test_db_session: AsyncSession
) -> None:
    calendar = await _make_calendar(authenticated_client, test_db_session)
    series = await _create_series(authenticated_client, calendar.id, recurrence_count=4)
    second_start = _next_monday() + timedelta(days=7)
    moved = await authenticated_client.patch(
        f"/api/events/{series['id']}",
        json={
            "scope": "this",
            "occurrence_start": second_start.isoformat(),
            "title": "Moved standup",
            "start_at": (second_start + timedelta(hours=3)).isoformat(),
            "end_at": (second_start + timedelta(hours=4)).isoformat(),
        },
    )
    assert moved.status_code == 200
    assert moved.json()["rrule"] is None
    events = await _list_events(authenticated_client, 28)
    titles = [e["title"] for e in events]
    # Override replaces the original occurrence: still four items, one renamed.
    assert titles.count("Moved standup") == 1
    assert len(events) == 4


async def test_following_delete_truncates_series(
    authenticated_client: AsyncClient, test_db_session: AsyncSession
) -> None:
    calendar = await _make_calendar(authenticated_client, test_db_session)
    series = await _create_series(authenticated_client, calendar.id, recurrence_count=5)
    third = (_next_monday() + timedelta(days=14)).isoformat()
    deleted = await authenticated_client.delete(
        f"/api/events/{series['id']}", params={"scope": "following", "occurrence_start": third}
    )
    assert deleted.status_code == 204
    events = await _list_events(authenticated_client, 60)
    assert len(events) == 2  # weeks 0 and 1 remain, week 2 onward removed


async def test_event_links_scoped_to_occurrence_date(
    authenticated_client: AsyncClient, test_db_session: AsyncSession
) -> None:
    calendar = await _make_calendar(authenticated_client, test_db_session)
    series = await _create_series(
        authenticated_client,
        calendar.id,
        rrule="DAILY",
        recurrence_count=3,
        connections={"food": {"meal_type": "breakfast"}},
    )
    event_id = series["id"]

    # Every occurrence's meal is linked to the same event id.
    unscoped = await authenticated_client.get(f"/api/events/{event_id}/links")
    assert unscoped.status_code == 200
    assert sum(x["target_type"] == "meal_log" for x in unscoped.json()) == 3

    # `on` narrows the Linked panel to just that day's meal.
    day = _next_monday().date().isoformat()
    scoped = await authenticated_client.get(f"/api/events/{event_id}/links", params={"on": day})
    assert scoped.status_code == 200
    meals = [x for x in scoped.json() if x["target_type"] == "meal_log"]
    assert len(meals) == 1
    assert day in meals[0]["title"]

    # Logging later records the action time in `logged_at`, but the meal must
    # remain attached to the calendar occurrence represented by `date`.
    logged = await authenticated_client.patch(
        f"/api/food/logs/{meals[0]['target_id']}",
        json={"status": "logged"},
    )
    assert logged.status_code == 200
    assert logged.json()["logged_at"] is not None

    scoped_after_logging = await authenticated_client.get(
        f"/api/events/{event_id}/links", params={"on": day}
    )
    logged_meals = [x for x in scoped_after_logging.json() if x["target_type"] == "meal_log"]
    assert len(logged_meals) == 1
    assert logged_meals[0]["target_id"] == meals[0]["target_id"]
    assert day in logged_meals[0]["title"]
