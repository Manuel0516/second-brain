from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Calendar, CalendarEvent, Page, User
from app.security import hash_password

pytestmark = pytest.mark.anyio


async def login(client: AsyncClient, session: AsyncSession, name: str) -> tuple[User, str]:
    user = User(
        id=str(uuid4()),
        username=name,
        email=f"{name}@example.com",
        password_hash=hash_password("testpassword123"),
        is_active=True,
    )
    session.add(user)
    await session.commit()
    response = await client.post(
        "/api/auth/login", json={"email": user.email, "password": "testpassword123"}
    )
    assert response.status_code == 200
    token = response.cookies.get("access_token")
    assert token
    return user, token


async def test_calendar_roles_and_revocation(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    owner, owner_token = await login(client, test_db_session, "calendar-owner")
    recipient, recipient_token = await login(client, test_db_session, "calendar-recipient")
    calendar = Calendar(user_id=owner.id, name="Shared", color="#123456")
    test_db_session.add(calendar)
    await test_db_session.flush()
    event = CalendarEvent(
        calendar_id=calendar.id,
        title="Planning",
        start_at=datetime.now(UTC),
        end_at=datetime.now(UTC) + timedelta(hours=1),
    )
    test_db_session.add(event)
    await test_db_session.commit()

    share = await client.post(
        f"/api/calendars/{calendar.id}/shares",
        json={"email": recipient.email, "role": "viewer"},
        cookies={"access_token": owner_token},
    )
    assert share.status_code == 201
    listed = await client.get("/api/calendars", cookies={"access_token": recipient_token})
    assert listed.json()[0]["effective_role"] == "viewer"
    denied = await client.patch(
        f"/api/events/{event.id}", json={"title": "Nope"}, cookies={"access_token": recipient_token}
    )
    assert denied.status_code == 403

    changed = await client.patch(
        f"/api/calendars/{calendar.id}/shares/{recipient.id}",
        json={"role": "editor"},
        cookies={"access_token": owner_token},
    )
    assert changed.status_code == 200
    edited = await client.patch(
        f"/api/events/{event.id}",
        json={"title": "Allowed"},
        cookies={"access_token": recipient_token},
    )
    assert edited.status_code == 200
    revoke = await client.delete(
        f"/api/calendars/{calendar.id}/shares/{recipient.id}", cookies={"access_token": owner_token}
    )
    assert revoke.status_code == 204
    assert (
        await client.get(f"/api/events/{event.id}", cookies={"access_token": recipient_token})
    ).status_code == 404


async def test_calendar_recipient_can_override_own_view_and_leave(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    owner, owner_token = await login(client, test_db_session, "override-owner")
    recipient, recipient_token = await login(client, test_db_session, "override-recipient")
    calendar = Calendar(user_id=owner.id, name="Shared", color="#123456")
    test_db_session.add(calendar)
    await test_db_session.flush()
    window_start = datetime.now(UTC)
    event = CalendarEvent(
        calendar_id=calendar.id,
        title="Standup",
        start_at=window_start + timedelta(hours=1),
        end_at=window_start + timedelta(hours=2),
    )
    test_db_session.add(event)
    await test_db_session.commit()
    window = {
        "from_date": window_start.isoformat(),
        "to_date": (window_start + timedelta(days=1)).isoformat(),
    }

    assert (
        await client.post(
            f"/api/calendars/{calendar.id}/shares",
            json={"email": recipient.email, "role": "viewer"},
            cookies={"access_token": owner_token},
        )
    ).status_code == 201

    # A viewer may not touch the owner's calendar row directly.
    assert (
        await client.patch(
            f"/api/calendars/{calendar.id}",
            json={"color": "#abcdef"},
            cookies={"access_token": recipient_token},
        )
    ).status_code == 404

    # Visible by default before any override.
    before = await client.get(
        "/api/events", params=window, cookies={"access_token": recipient_token}
    )
    assert [e["title"] for e in before.json()] == ["Standup"]

    # But they can set their own override without affecting the owner's view.
    overridden = await client.patch(
        f"/api/calendars/{calendar.id}/my-share",
        json={"visible": False, "color": "#abcdef"},
        cookies={"access_token": recipient_token},
    )
    assert overridden.status_code == 200
    assert overridden.json()["is_visible"] is False
    assert overridden.json()["color"] == "#abcdef"

    # The override must actually hide the calendar's events for this
    # recipient, not just the sidebar's displayed is_visible flag.
    hidden = await client.get(
        "/api/events", params=window, cookies={"access_token": recipient_token}
    )
    assert hidden.json() == []
    owner_still_sees = await client.get(
        "/api/events", params=window, cookies={"access_token": owner_token}
    )
    assert [e["title"] for e in owner_still_sees.json()] == ["Standup"]

    owner_view = await client.get("/api/calendars", cookies={"access_token": owner_token})
    owned = next(c for c in owner_view.json() if c["id"] == calendar.id)
    assert owned["is_visible"] is True
    assert owned["color"] == "#123456"

    # The owner still cannot self-patch a share row that doesn't exist for them.
    assert (
        await client.patch(
            f"/api/calendars/{calendar.id}/my-share",
            json={"visible": False},
            cookies={"access_token": owner_token},
        )
    ).status_code == 404

    # The recipient can leave on their own, without owner involvement.
    denied = await client.delete(
        f"/api/calendars/{calendar.id}/shares/{owner.id}",
        cookies={"access_token": recipient_token},
    )
    assert denied.status_code == 403
    left = await client.delete(
        f"/api/calendars/{calendar.id}/shares/{recipient.id}",
        cookies={"access_token": recipient_token},
    )
    assert left.status_code == 204
    assert (
        await client.get("/api/calendars", cookies={"access_token": recipient_token})
    ).json() == []


async def test_page_roles_and_revocation(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    owner, owner_token = await login(client, test_db_session, "page-owner")
    recipient, recipient_token = await login(client, test_db_session, "page-recipient")
    page = Page(user_id=owner.id, title="Shared note", content={"type": "doc", "content": []})
    test_db_session.add(page)
    await test_db_session.commit()

    share = await client.post(
        f"/api/pages/{page.id}/shares",
        json={"email": recipient.email, "role": "viewer"},
        cookies={"access_token": owner_token},
    )
    assert share.status_code == 201
    assert (
        await client.get(f"/api/pages/{page.id}", cookies={"access_token": recipient_token})
    ).json()["effective_role"] == "viewer"
    assert (
        await client.patch(
            f"/api/pages/{page.id}",
            json={"title": "Nope"},
            cookies={"access_token": recipient_token},
        )
    ).status_code == 403

    assert (
        await client.patch(
            f"/api/pages/{page.id}/shares/{recipient.id}",
            json={"role": "editor"},
            cookies={"access_token": owner_token},
        )
    ).status_code == 200
    assert (
        await client.patch(
            f"/api/pages/{page.id}",
            json={"title": "Allowed"},
            cookies={"access_token": recipient_token},
        )
    ).status_code == 200
    assert (
        await client.delete(
            f"/api/pages/{page.id}/shares/{recipient.id}", cookies={"access_token": owner_token}
        )
    ).status_code == 204
    assert (
        await client.get(f"/api/pages/{page.id}", cookies={"access_token": recipient_token})
    ).status_code == 404
