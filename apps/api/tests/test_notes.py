from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Calendar, CalendarEvent, Link, Page, User
from app.security import hash_password

pytestmark = pytest.mark.anyio


async def _user_and_token(
    client: AsyncClient, session: AsyncSession, name: str
) -> tuple[User, str]:
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
        "/api/auth/login",
        json={"email": user.email, "password": "testpassword123"},
    )
    assert response.status_code == 200
    token = response.cookies.get("access_token")
    assert token
    return user, token


async def _event(session: AsyncSession, user: User, title: str = "Planning") -> CalendarEvent:
    calendar = Calendar(user_id=user.id, name="Personal", color="#123456")
    session.add(calendar)
    await session.flush()
    event = CalendarEvent(
        calendar_id=calendar.id,
        title=title,
        start_at=datetime.now(UTC),
        end_at=datetime.now(UTC) + timedelta(hours=1),
        connections={"notes": {"title": f"{title} notes"}},
    )
    session.add(event)
    await session.commit()
    return event


async def test_page_crud_and_ownership(client: AsyncClient, test_db_session: AsyncSession) -> None:
    _, owner_token = await _user_and_token(client, test_db_session, "notes-owner")
    _, other_token = await _user_and_token(client, test_db_session, "notes-other")

    created = await client.post(
        "/api/pages", json={"title": "Ideas", "icon": "💡"}, cookies={"access_token": owner_token}
    )
    assert created.status_code == 201
    page_id = created.json()["id"]

    patched = await client.patch(
        f"/api/pages/{page_id}",
        json={"title": "Good ideas", "position": "a9"},
        cookies={"access_token": owner_token},
    )
    assert patched.status_code == 200
    assert patched.json()["title"] == "Good ideas"
    assert (await client.get("/api/pages", cookies={"access_token": owner_token})).json()[0][
        "id"
    ] == page_id
    assert (
        await client.get(f"/api/pages/{page_id}", cookies={"access_token": other_token})
    ).status_code == 404
    assert (
        await client.patch(
            f"/api/pages/{page_id}",
            json={"title": "Stolen"},
            cookies={"access_token": other_token},
        )
    ).status_code == 404


async def test_soft_delete_and_restore_children(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    _, token = await _user_and_token(client, test_db_session, "notes-trash")
    parent = (
        await client.post("/api/pages", json={"title": "Parent"}, cookies={"access_token": token})
    ).json()
    child = (
        await client.post(
            "/api/pages",
            json={"title": "Child", "parent_page_id": parent["id"]},
            cookies={"access_token": token},
        )
    ).json()

    response = await client.delete(f"/api/pages/{parent['id']}", cookies={"access_token": token})
    assert response.status_code == 204
    assert (await client.get("/api/pages", cookies={"access_token": token})).json() == []
    assert {
        page["id"]
        for page in (await client.get("/api/pages/trash", cookies={"access_token": token})).json()
    } == {parent["id"], child["id"]}

    restored = await client.post(
        f"/api/pages/{parent['id']}/restore", cookies={"access_token": token}
    )
    assert restored.status_code == 200
    assert {
        page["id"]
        for page in (await client.get("/api/pages", cookies={"access_token": token})).json()
    } == {parent["id"], child["id"]}


async def test_event_note_bridge_is_atomic_and_idempotent(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    user, token = await _user_and_token(client, test_db_session, "notes-event")
    event = await _event(test_db_session, user)

    first = await client.post(f"/api/events/{event.id}/note", cookies={"access_token": token})
    second = await client.post(f"/api/events/{event.id}/note", cookies={"access_token": token})
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    assert first.json()["title"] == "Planning notes"

    pages = list(await test_db_session.scalars(select(Page).where(Page.user_id == user.id)))
    links = list(
        await test_db_session.scalars(
            select(Link).where(Link.source_type == "event", Link.source_id == event.id)
        )
    )
    assert len(pages) == len(links) == 1
    assert links[0].target_id == pages[0].id
    assert links[0].relation == "note"
    linked = await client.get(f"/api/events/{event.id}/links", cookies={"access_token": token})
    assert linked.json()[0]["title"] == pages[0].title
    assert linked.json()[0]["target_id"] == pages[0].id

    assert (
        await client.delete(f"/api/events/{event.id}", cookies={"access_token": token})
    ).status_code == 204
    assert await test_db_session.get(Page, pages[0].id) is not None
    assert list(await test_db_session.scalars(select(Link).where(Link.source_id == event.id))) == []


async def test_mentions_reconcile_and_backlinks(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    user, token = await _user_and_token(client, test_db_session, "notes-mentions")
    event = await _event(test_db_session, user, "Review")
    source = (
        await client.post("/api/pages", json={"title": "Source"}, cookies={"access_token": token})
    ).json()
    target = (
        await client.post("/api/pages", json={"title": "Target"}, cookies={"access_token": token})
    ).json()
    content = {
        "type": "doc",
        "content": [
            {"type": "mention", "attrs": {"type": "page", "id": target["id"]}},
            {"type": "eventMention", "attrs": {"id": event.id}},
        ],
    }
    response = await client.patch(
        f"/api/pages/{source['id']}",
        json={"content": content},
        cookies={"access_token": token},
    )
    assert response.status_code == 200
    links = list(
        await test_db_session.scalars(
            select(Link).where(Link.source_type == "page", Link.source_id == source["id"])
        )
    )
    assert {(link.target_type, link.target_id) for link in links} == {
        ("page", target["id"]),
        ("event", event.id),
    }
    backlinks = await client.get(
        f"/api/nodes/page/{target['id']}/backlinks", cookies={"access_token": token}
    )
    assert backlinks.json()[0]["source_id"] == source["id"]
    assert backlinks.json()[0]["title"] == "Source"

    cleared = await client.patch(
        f"/api/pages/{source['id']}",
        json={"content": {"type": "doc", "content": []}},
        cookies={"access_token": token},
    )
    assert cleared.status_code == 200
    assert (
        list(
            await test_db_session.scalars(
                select(Link).where(Link.source_type == "page", Link.source_id == source["id"])
            )
        )
        == []
    )


async def test_search_content_and_generic_links_are_owned(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    user, token = await _user_and_token(client, test_db_session, "notes-search")
    _, other_token = await _user_and_token(client, test_db_session, "notes-search-other")
    event = await _event(test_db_session, user, "Roadmap meeting")
    assert (
        await client.get(f"/api/events/{event.id}", cookies={"access_token": token})
    ).status_code == 200
    assert (
        await client.get(f"/api/events/{event.id}", cookies={"access_token": other_token})
    ).status_code == 404
    page = (
        await client.post("/api/pages", json={"title": "Weekly"}, cookies={"access_token": token})
    ).json()
    await client.patch(
        f"/api/pages/{page['id']}",
        json={
            "content": {
                "type": "doc",
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Nebula"}]}],
            }
        },
        cookies={"access_token": token},
    )
    results = await client.get("/api/search?q=nebula", cookies={"access_token": token})
    assert [(item["type"], item["id"]) for item in results.json()] == [("page", page["id"])]
    assert (
        await client.get("/api/search?q=nebula", cookies={"access_token": other_token})
    ).json() == []

    created = await client.post(
        "/api/links",
        json={
            "source_type": "event",
            "source_id": event.id,
            "target_type": "page",
            "target_id": page["id"],
            "relation": "documents",
        },
        cookies={"access_token": token},
    )
    assert created.status_code == 201
    link_id = created.json()["id"]
    assert (
        await client.delete(f"/api/links/{link_id}", cookies={"access_token": other_token})
    ).status_code == 404
    assert (
        await client.delete(f"/api/links/{link_id}", cookies={"access_token": token})
    ).status_code == 204


async def test_patch_content_with_unknown_block_types_is_safe(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    """New TipTap node types (location, spreadsheet) must not break mention sync."""
    _, token = await _user_and_token(client, test_db_session, "notes-blocks")
    created = await client.post(
        "/api/pages", json={"title": "Trip"}, cookies={"access_token": token}
    )
    target = await client.post(
        "/api/pages", json={"title": "Packing list"}, cookies={"access_token": token}
    )
    content = {
        "type": "doc",
        "content": [
            {
                "type": "locationBlock",
                "attrs": {"address": "Plaza Mayor, Madrid", "lat": 40.4, "lng": -3.7},
            },
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "mention",
                        "attrs": {"id": target.json()["id"], "type": "page", "label": "Packing"},
                    }
                ],
            },
        ],
    }
    patched = await client.patch(
        f"/api/pages/{created.json()['id']}",
        json={"content": content},
        cookies={"access_token": token},
    )
    assert patched.status_code == 200
    backlinks = await client.get(
        f"/api/nodes/page/{target.json()['id']}/backlinks",
        cookies={"access_token": token},
    )
    assert [link["relation"] for link in backlinks.json()] == ["mentions"]


async def test_folder_pages_and_event_note_in_folder(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    user, token = await _user_and_token(client, test_db_session, "notes-folders")
    folder = await client.post(
        "/api/pages",
        json={"title": "Work", "type": "folder"},
        cookies={"access_token": token},
    )
    assert folder.status_code == 201
    assert folder.json()["type"] == "folder"
    folder_id = folder.json()["id"]

    event = await _event(test_db_session, user, "Sprint review")
    note = await client.post(
        f"/api/events/{event.id}/note",
        json={"title": "Review notes", "parent_page_id": folder_id},
        cookies={"access_token": token},
    )
    assert note.status_code == 201
    assert note.json()["parent_page_id"] == folder_id

    # force_new creates a second, distinct note for the same event.
    second = await client.post(
        f"/api/events/{event.id}/note",
        json={"title": "More notes", "force_new": True},
        cookies={"access_token": token},
    )
    assert second.status_code == 201
    assert second.json()["id"] != note.json()["id"]
    # Without force_new the idempotent shortcut still returns the first note.
    again = await client.post(
        f"/api/events/{event.id}/note", json={}, cookies={"access_token": token}
    )
    assert again.json()["id"] == note.json()["id"]


async def test_event_note_honors_draft_folder_id(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    user, token = await _user_and_token(client, test_db_session, "notes-draftfolder")
    folder = await client.post(
        "/api/pages",
        json={"title": "Trips", "type": "folder"},
        cookies={"access_token": token},
    )
    folder_id = folder.json()["id"]
    event = await _event(test_db_session, user, "Flight")
    event.connections = {"notes": {"title": "Itinerary", "folder_id": folder_id}}
    await test_db_session.commit()

    note = await client.post(
        f"/api/events/{event.id}/note", json={}, cookies={"access_token": token}
    )
    assert note.status_code == 201
    assert note.json()["parent_page_id"] == folder_id
    assert note.json()["title"] == "Itinerary"


async def test_permanent_delete_purges_subtree_and_links(
    client: AsyncClient, test_db_session: AsyncSession
) -> None:
    _, token = await _user_and_token(client, test_db_session, "notes-purge")
    _, other = await _user_and_token(client, test_db_session, "notes-purge-other")
    parent = await client.post(
        "/api/pages", json={"title": "Parent"}, cookies={"access_token": token}
    )
    parent_id = parent.json()["id"]
    child = await client.post(
        "/api/pages",
        json={"title": "Child", "parent_page_id": parent_id},
        cookies={"access_token": token},
    )
    child_id = child.json()["id"]
    outsider = await client.post(
        "/api/pages", json={"title": "Outsider"}, cookies={"access_token": token}
    )
    await client.post(
        "/api/links",
        json={
            "source_type": "page",
            "source_id": outsider.json()["id"],
            "target_type": "page",
            "target_id": child_id,
            "relation": "mentions",
        },
        cookies={"access_token": token},
    )

    # Active pages cannot be permanently deleted.
    active = await client.delete(
        f"/api/pages/{parent_id}/permanent", cookies={"access_token": token}
    )
    assert active.status_code == 409

    assert (
        await client.delete(f"/api/pages/{parent_id}", cookies={"access_token": token})
    ).status_code == 204

    # Another user's trashed page is invisible.
    foreign = await client.delete(
        f"/api/pages/{parent_id}/permanent", cookies={"access_token": other}
    )
    assert foreign.status_code == 404

    gone = await client.delete(f"/api/pages/{parent_id}/permanent", cookies={"access_token": token})
    assert gone.status_code == 204
    assert (await test_db_session.scalar(select(Page).where(Page.id == parent_id))) is None
    assert (await test_db_session.scalar(select(Page).where(Page.id == child_id))) is None
    assert (await test_db_session.scalar(select(Link).where(Link.target_id == child_id))) is None
