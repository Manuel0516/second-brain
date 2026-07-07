from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Calendar, CalendarEvent, File, Link, MealLog, User

pytestmark = pytest.mark.anyio


async def test_delete_meal_log_with_photo_and_event_link(
    client: AsyncClient, test_db_session: AsyncSession, test_user: User
) -> None:
    """Deleting a logged meal that has a photo must not violate the
    meal_logs.photo_file_id -> files.id foreign key (regression for a delete-order bug
    that only surfaced on Postgres, since the test DB didn't enforce FKs). It must also
    remove the Link connecting it to its calendar event, without deleting the event."""
    file_row = File(
        id=str(uuid4()),
        user_id=test_user.id,
        name="meal.jpg",
        content_type="image/jpeg",
        size=123,
    )
    test_db_session.add(file_row)
    await test_db_session.flush()

    log = MealLog(
        id=str(uuid4()),
        user_id=test_user.id,
        date=datetime.now(UTC),
        meal_type="lunch",
        status="logged",
        photo_file_id=file_row.id,
    )
    test_db_session.add(log)
    await test_db_session.flush()

    calendar = Calendar(user_id=test_user.id, name="Personal", color="#123456")
    test_db_session.add(calendar)
    await test_db_session.flush()
    event = CalendarEvent(
        calendar_id=calendar.id,
        title="Lunch",
        start_at=datetime.now(UTC),
        end_at=datetime.now(UTC) + timedelta(hours=1),
    )
    test_db_session.add(event)
    await test_db_session.flush()
    test_db_session.add(
        Link(
            source_type="event",
            source_id=event.id,
            target_type="meal_log",
            target_id=log.id,
            relation="logged_from",
        )
    )
    await test_db_session.commit()

    login = await client.post(
        "/api/auth/login",
        json={"email": test_user.email, "password": "testpassword123"},
    )
    token = login.cookies.get("access_token")
    assert token

    response = await client.delete(f"/api/food/logs/{log.id}", cookies={"access_token": token})
    assert response.status_code == 204

    remaining_links = await test_db_session.scalars(
        select(Link).where(Link.target_type == "meal_log", Link.target_id == log.id)
    )
    assert list(remaining_links) == []

    surviving_event = await test_db_session.get(CalendarEvent, event.id)
    assert surviving_event is not None
