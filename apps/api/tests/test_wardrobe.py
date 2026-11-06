from datetime import UTC, datetime
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Calendar, CalendarEvent, File, User, WardrobeGarment

pytestmark = pytest.mark.anyio


@pytest.fixture
async def authed(client: AsyncClient, test_user: User) -> AsyncClient:
    response = await client.post(
        "/api/auth/login", json={"email": test_user.email, "password": "testpassword123"}
    )
    assert response.status_code == 200
    return client


@pytest.mark.parametrize("path", ["garments", "outfits", "schedule", "preferences"])
async def test_wardrobe_requires_login(client: AsyncClient, path: str) -> None:
    assert (await client.get(f"/api/wardrobe/{path}")).status_code == 401
    if path != "preferences":
        assert (await client.post(f"/api/wardrobe/{path}", json={})).status_code == 401
    else:
        assert (await client.put(f"/api/wardrobe/{path}", json={})).status_code == 401


async def test_garment_catalog_edit_archive_delete(authed: AsyncClient) -> None:
    response = await authed.post(
        "/api/wardrobe/garments",
        json={"name": "  Linen shirt  ", "category": "Tops", "brand": "Brand", "color": "Blue"},
    )
    assert response.status_code == 201
    garment = response.json()
    assert garment["name"] == "Linen shirt"
    updated = await authed.put(
        f"/api/wardrobe/garments/{garment['id']}", json={**garment, "archived": True, "size": "M"}
    )
    assert updated.status_code == 200
    assert updated.json()["archived"] is True
    assert (await authed.get("/api/wardrobe/garments")).json()[0]["size"] == "M"
    assert (await authed.delete(f"/api/wardrobe/garments/{garment['id']}")).status_code == 204
    assert (await authed.get("/api/wardrobe/garments")).json() == []


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "   ", "category": "Tops"},
        {"name": "Shirt", "category": ""},
        {"name": "Shirt", "category": "Tops", "photo_file_id": "bad-id"},
    ],
)
async def test_invalid_garments_are_rejected(authed: AsyncClient, payload: dict[str, str]) -> None:
    assert (await authed.post("/api/wardrobe/garments", json=payload)).status_code == 422


async def test_photos_must_be_owned_images(
    authed: AsyncClient, test_db_session: AsyncSession, test_user: User
) -> None:
    other = User(username="other", email="other@example.com", password_hash=test_user.password_hash)
    test_db_session.add(other)
    await test_db_session.flush()
    files = [
        File(user_id=test_user.id, name="document.pdf", content_type="application/pdf", size=10),
        File(user_id=other.id, name="private.jpg", content_type="image/jpeg", size=10),
        File(user_id=test_user.id, name="shirt.jpg", content_type="image/jpeg", size=10),
    ]
    test_db_session.add_all(files)
    await test_db_session.commit()
    for photo in files[:2]:
        assert (
            await authed.post(
                "/api/wardrobe/garments",
                json={"name": "Shirt", "category": "Tops", "photo_file_id": photo.id},
            )
        ).status_code == 400
    response = await authed.post(
        "/api/wardrobe/garments",
        json={"name": "Shirt", "category": "Tops", "photo_file_id": files[2].id},
    )
    assert response.status_code == 201
    assert response.json()["photo_file_id"] == files[2].id


async def test_outfit_membership_and_deletion_protect_garments(authed: AsyncClient) -> None:
    garment = (
        await authed.post("/api/wardrobe/garments", json={"name": "Shirt", "category": "Tops"})
    ).json()
    response = await authed.post(
        "/api/wardrobe/outfits", json={"name": "Work", "garment_ids": [garment["id"]]}
    )
    assert response.status_code == 201
    outfit = response.json()
    assert (await authed.get("/api/wardrobe/outfits")).json() == [outfit]
    assert (await authed.delete(f"/api/wardrobe/garments/{garment['id']}")).status_code == 409
    assert (
        await authed.post(
            "/api/wardrobe/outfits",
            json={"name": "Duplicate", "garment_ids": [garment["id"], garment["id"]]},
        )
    ).status_code == 422
    assert (
        await authed.post("/api/wardrobe/outfits", json={"name": "Empty", "garment_ids": []})
    ).status_code == 422
    changed = await authed.put(
        f"/api/wardrobe/outfits/{outfit['id']}",
        json={"name": "Evening", "notes": "Dinner", "garment_ids": [garment["id"]]},
    )
    assert changed.status_code == 200
    assert changed.json()["name"] == "Evening"
    assert (await authed.delete(f"/api/wardrobe/outfits/{outfit['id']}")).status_code == 204
    assert (await authed.delete(f"/api/wardrobe/garments/{garment['id']}")).status_code == 204


async def test_other_users_data_cannot_be_read_or_changed(
    authed: AsyncClient, test_db_session: AsyncSession, test_user: User
) -> None:
    other = User(username="other", email="other@example.com", password_hash=test_user.password_hash)
    test_db_session.add(other)
    await test_db_session.flush()
    garment = WardrobeGarment(user_id=other.id, name="Private", category="Tops")
    test_db_session.add(garment)
    await test_db_session.commit()
    assert (await authed.get("/api/wardrobe/garments")).json() == []
    assert (
        await authed.put(
            f"/api/wardrobe/garments/{garment.id}", json={"name": "Changed", "category": "Tops"}
        )
    ).status_code == 404
    assert (await authed.delete(f"/api/wardrobe/garments/{garment.id}")).status_code == 404
    assert (
        await authed.post(
            "/api/wardrobe/outfits", json={"name": "Invalid", "garment_ids": [garment.id]}
        )
    ).status_code == 400


async def test_schedule_creates_linked_all_day_event_across_dst(
    authed: AsyncClient, test_db_session: AsyncSession, test_user: User
) -> None:
    calendar = Calendar(user_id=test_user.id, name="Personal", color="#22d3ee")
    test_db_session.add(calendar)
    await test_db_session.commit()
    garment = (
        await authed.post("/api/wardrobe/garments", json={"name": "Shirt", "category": "Tops"})
    ).json()
    outfit = (
        await authed.post(
            "/api/wardrobe/outfits", json={"name": "Sunday", "garment_ids": [garment["id"]]}
        )
    ).json()
    response = await authed.post(
        "/api/wardrobe/schedule",
        json={
            "outfit_id": outfit["id"],
            "calendar_id": calendar.id,
            "date": "2026-10-25",
            "timezone": "Europe/Stockholm",
        },
    )
    assert response.status_code == 201
    plan = response.json()
    assert plan["start_at"] == "2026-10-24T22:00:00Z"
    event = await test_db_session.get(CalendarEvent, plan["event_id"])
    assert event is not None
    assert event.all_day
    assert event.end_at.replace(tzinfo=UTC) == datetime(2026, 10, 25, 23, tzinfo=UTC)
    assert event.link is None
    assert event.connections["wardrobe"] == {"outfit_id": outfit["id"]}
    assert (await authed.get("/api/wardrobe/schedule")).json()[0]["event_id"] == event.id
    links = (await authed.get(f"/api/events/{event.id}/links")).json()
    assert any(
        link["target_type"] == "wardrobe_outfit" and link["title"] == "Sunday" for link in links
    )
    assert (await authed.delete(f"/api/wardrobe/schedule/{event.id}")).status_code == 204
    assert (await authed.get("/api/wardrobe/schedule")).json() == []
    assert len((await authed.get("/api/wardrobe/outfits")).json()) == 1


async def test_schedule_rejects_missing_outfits_remote_calendars_and_invalid_timezone(
    authed: AsyncClient, test_db_session: AsyncSession, test_user: User
) -> None:
    calendar = Calendar(user_id=test_user.id, name="Read-only", color="#22d3ee", source="ics")
    test_db_session.add(calendar)
    await test_db_session.commit()
    garment = (
        await authed.post("/api/wardrobe/garments", json={"name": "Shirt", "category": "Tops"})
    ).json()
    outfit = (
        await authed.post(
            "/api/wardrobe/outfits", json={"name": "Work", "garment_ids": [garment["id"]]}
        )
    ).json()
    payload = {"outfit_id": outfit["id"], "calendar_id": calendar.id, "date": "2026-11-06"}
    assert (await authed.post("/api/wardrobe/schedule", json=payload)).status_code == 400
    assert (
        await authed.post("/api/wardrobe/schedule", json={**payload, "outfit_id": str(uuid4())})
    ).status_code == 404
    assert (
        await authed.post("/api/wardrobe/schedule", json={**payload, "timezone": "invalid"})
    ).status_code == 422


async def test_deleting_outfit_preserves_event_without_dead_link(
    authed: AsyncClient, test_db_session: AsyncSession, test_user: User
) -> None:
    calendar = Calendar(user_id=test_user.id, name="Personal", color="#22d3ee")
    test_db_session.add(calendar)
    await test_db_session.commit()
    garment = (
        await authed.post("/api/wardrobe/garments", json={"name": "Shirt", "category": "Tops"})
    ).json()
    outfit = (
        await authed.post(
            "/api/wardrobe/outfits", json={"name": "Evening", "garment_ids": [garment["id"]]}
        )
    ).json()
    plan = (
        await authed.post(
            "/api/wardrobe/schedule",
            json={"outfit_id": outfit["id"], "calendar_id": calendar.id, "date": "2026-11-06"},
        )
    ).json()
    assert (await authed.delete(f"/api/wardrobe/outfits/{outfit['id']}")).status_code == 204
    event = await test_db_session.get(CalendarEvent, plan["event_id"])
    assert event is not None
    assert event.title == "Outfit: Evening"
    assert event.link is None
    assert (await authed.get("/api/wardrobe/schedule")).json() == []
    assert (await authed.get(f"/api/events/{event.id}/links")).json() == []


async def test_preferences_persist_and_reject_foreign_calendars(
    authed: AsyncClient, test_db_session: AsyncSession, test_user: User
) -> None:
    calendar = Calendar(user_id=test_user.id, name="Outfits", color="#22d3ee")
    test_db_session.add(calendar)
    await test_db_session.commit()
    payload = {
        "categories": ["Tops", "Travel"],
        "default_calendar_id": calendar.id,
        "ai_outfits_enabled": False,
        "weather_planning_enabled": False,
        "weather_city": "",
    }
    saved = await authed.put("/api/wardrobe/preferences", json=payload)
    assert saved.status_code == 200
    assert (await authed.get("/api/wardrobe/preferences")).json() == payload
    other = User(
        username="other-prefs",
        email="other-prefs@example.com",
        password_hash=test_user.password_hash,
    )
    test_db_session.add(other)
    await test_db_session.flush()
    foreign = Calendar(user_id=other.id, name="Private", color="#22d3ee")
    remote = Calendar(user_id=test_user.id, name="Remote", color="#22d3ee", source="ics")
    test_db_session.add_all([foreign, remote])
    await test_db_session.commit()
    for row in [foreign, remote]:
        response = await authed.put(
            "/api/wardrobe/preferences", json={**payload, "default_calendar_id": row.id}
        )
        assert response.status_code == 400
    assert (await authed.get("/api/wardrobe/preferences")).json() == payload


async def test_category_rename_updates_only_owned_garments(
    authed: AsyncClient, test_db_session: AsyncSession, test_user: User
) -> None:
    own = WardrobeGarment(user_id=test_user.id, name="Coat", category="Outerwear", archived=True)
    other = User(
        username="other-categories",
        email="other-categories@example.com",
        password_hash=test_user.password_hash,
    )
    test_db_session.add(other)
    await test_db_session.flush()
    foreign = WardrobeGarment(user_id=other.id, name="Private coat", category="Outerwear")
    test_db_session.add_all([own, foreign])
    await test_db_session.commit()
    response = await authed.post(
        "/api/wardrobe/categories/rename", json={"name": "Outerwear", "new_name": "Jackets"}
    )
    assert response.status_code == 200
    assert "Jackets" in response.json()["categories"]
    assert "Outerwear" not in response.json()["categories"]
    assert (await authed.get("/api/wardrobe/garments")).json()[0]["category"] == "Jackets"
    await test_db_session.refresh(foreign)
    assert foreign.category == "Outerwear"


async def test_used_categories_cannot_be_removed(authed: AsyncClient) -> None:
    await authed.post(
        "/api/wardrobe/garments",
        json={"name": "Archived shirt", "category": "Tops", "archived": True},
    )
    response = await authed.put(
        "/api/wardrobe/preferences", json={"categories": ["Shoes"], "default_calendar_id": None}
    )
    assert response.status_code == 409
    assert "Tops" in (await authed.get("/api/wardrobe/preferences")).json()["categories"]
    assert (
        await authed.post(
            "/api/wardrobe/categories/rename", json={"name": "Tops", "new_name": "Shoes"}
        )
    ).status_code == 409


@pytest.mark.parametrize("names", [[""], ["Tops", "tops"], ["x" * 101]])
async def test_invalid_preference_categories_are_rejected(
    authed: AsyncClient, names: list[str]
) -> None:
    assert (
        await authed.put("/api/wardrobe/preferences", json={"categories": names})
    ).status_code == 422


async def test_calendar_outfit_connection_create_copy_edit_and_unlink(
    authed: AsyncClient, test_db_session: AsyncSession, test_user: User
) -> None:
    calendar = Calendar(user_id=test_user.id, name="Personal", color="#22d3ee")
    test_db_session.add(calendar)
    await test_db_session.commit()
    garment = (
        await authed.post("/api/wardrobe/garments", json={"name": "Coat", "category": "Outerwear"})
    ).json()
    outfit = (
        await authed.post(
            "/api/wardrobe/outfits", json={"name": "Walk", "garment_ids": [garment["id"]]}
        )
    ).json()
    body = {
        "calendar_id": calendar.id,
        "title": "Walk outside",
        "start_at": "2026-11-06T10:00:00Z",
        "end_at": "2026-11-06T11:00:00Z",
        "connections": {"wardrobe": {"outfit_id": outfit["id"]}},
    }
    response = await authed.post("/api/events", json=body)
    assert response.status_code == 201
    event = response.json()
    assert event["link"] is None
    links = (await authed.get(f"/api/events/{event['id']}/links")).json()
    assert links[0]["relation"] == "logged_from"
    assert links[0]["target_type"] == "wardrobe_outfit"
    assert (await authed.get("/api/wardrobe/schedule")).json()[0]["outfit_id"] == outfit["id"]
    copied = await authed.post(
        "/api/events/copy",
        json={"event_ids": [event["id"]], "target_start": "2026-11-07T10:00:00Z"},
    )
    assert copied.status_code == 201
    copy_id = copied.json()[0]["id"]
    copy_links = (await authed.get(f"/api/events/{copy_id}/links")).json()
    assert copy_links[0]["target_id"] == outfit["id"]
    assert (
        await authed.put(
            f"/api/wardrobe/outfits/{outfit['id']}",
            json={"name": "Evening walk", "garment_ids": [garment["id"]]},
        )
    ).status_code == 200
    assert (await authed.get(f"/api/events/{event['id']}")).json()["connections"]["wardrobe"][
        "outfit_id"
    ] == outfit["id"]
    assert (await authed.delete(f"/api/links/{links[0]['id']}")).status_code == 204
    assert (
        await authed.patch(f"/api/events/{event['id']}", json={"title": "Still a walk"})
    ).status_code == 200
    assert (await authed.get(f"/api/events/{event['id']}/links")).json() == []
    assert (await authed.delete(f"/api/wardrobe/schedule/{copy_id}")).status_code == 204
    assert (await authed.get(f"/api/events/{copy_id}")).status_code == 200
    assert (await authed.get(f"/api/events/{copy_id}/links")).json() == []


async def test_calendar_connection_rejects_foreign_outfit(
    authed: AsyncClient, test_db_session: AsyncSession, test_user: User
) -> None:
    from app.models import WardrobeOutfit

    calendar = Calendar(user_id=test_user.id, name="Personal", color="#22d3ee")
    other = User(
        username="private-outfits",
        email="private-outfits@example.com",
        password_hash=test_user.password_hash,
    )
    test_db_session.add_all([calendar, other])
    await test_db_session.flush()
    outfit = WardrobeOutfit(user_id=other.id, name="Private", notes="")
    test_db_session.add(outfit)
    await test_db_session.commit()
    response = await authed.post(
        "/api/events",
        json={
            "calendar_id": calendar.id,
            "title": "Invalid",
            "start_at": "2026-11-06T10:00:00Z",
            "end_at": "2026-11-06T11:00:00Z",
            "connections": {"wardrobe": {"outfit_id": outfit.id}},
        },
    )
    assert response.status_code == 404
