from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any, Self
from uuid import uuid4

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Calendar, CalendarEvent, File, Link, MealLog, MealLogPhoto, User
from app.routes import food as food_routes

pytestmark = pytest.mark.anyio


@pytest.fixture(autouse=True)
def disable_storage_delete(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(food_routes, "remove", lambda _user_id, _file_id: None)


async def test_delete_meal_log_with_photo_and_event_link(
    client: AsyncClient, test_db_session: AsyncSession, test_user: User
) -> None:
    """Deleting a meal removes every photo and link without deleting its event."""
    file_rows = [
        File(
            id=str(uuid4()),
            user_id=test_user.id,
            name=f"meal-{index}.jpg",
            content_type="image/jpeg",
            size=123,
        )
        for index in range(2)
    ]
    test_db_session.add_all(file_rows)
    await test_db_session.flush()

    log = MealLog(
        id=str(uuid4()),
        user_id=test_user.id,
        date=datetime.now(UTC),
        meal_type="lunch",
        status="logged",
    )
    test_db_session.add(log)
    await test_db_session.flush()
    test_db_session.add_all(
        MealLogPhoto(meal_log_id=log.id, file_id=file.id, position=index)
        for index, file in enumerate(file_rows)
    )

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

    remaining_photos = await test_db_session.scalars(
        select(MealLogPhoto).where(MealLogPhoto.meal_log_id == log.id)
    )
    assert list(remaining_photos) == []
    for file in file_rows:
        assert await test_db_session.scalar(select(File).where(File.id == file.id)) is None


async def test_meal_log_photo_order_and_replacement(
    client: AsyncClient, test_db_session: AsyncSession, test_user: User
) -> None:
    files = [
        File(
            id=str(uuid4()),
            user_id=test_user.id,
            name=f"dish-{index}.jpg",
            content_type="image/jpeg",
            size=123,
        )
        for index in range(3)
    ]
    test_db_session.add_all(files)
    await test_db_session.commit()

    login = await client.post(
        "/api/auth/login",
        json={"email": test_user.email, "password": "testpassword123"},
    )
    cookies = {"access_token": login.cookies["access_token"]}
    created = await client.post(
        "/api/food/logs",
        cookies=cookies,
        json={
            "date": datetime.now(UTC).isoformat(),
            "meal_type": "dinner",
            "photo_file_ids": [files[1].id, files[0].id],
        },
    )
    assert created.status_code == 201
    log_id = created.json()["id"]
    assert created.json()["photo_file_ids"] == [files[1].id, files[0].id]

    updated = await client.patch(
        f"/api/food/logs/{log_id}",
        cookies=cookies,
        json={"photo_file_ids": [files[0].id, files[2].id]},
    )
    assert updated.status_code == 200
    assert updated.json()["photo_file_ids"] == [files[0].id, files[2].id]
    assert await test_db_session.scalar(select(File).where(File.id == files[1].id)) is None


async def test_list_meal_logs_without_range_returns_older_history(
    client: AsyncClient, test_db_session: AsyncSession, test_user: User
) -> None:
    old_log = MealLog(
        user_id=test_user.id,
        date=datetime.now(UTC) - timedelta(days=30),
        meal_type="lunch",
        status="logged",
    )
    test_db_session.add(old_log)
    await test_db_session.commit()

    login = await client.post(
        "/api/auth/login",
        json={"email": test_user.email, "password": "testpassword123"},
    )
    response = await client.get(
        "/api/food/logs",
        cookies={"access_token": login.cookies["access_token"]},
    )

    assert response.status_code == 200
    assert old_log.id in {meal["id"] for meal in response.json()}


async def test_meal_log_rejects_invalid_photo_collections(
    client: AsyncClient, test_db_session: AsyncSession, test_user: User
) -> None:
    file = File(
        id=str(uuid4()),
        user_id=test_user.id,
        name="dish.jpg",
        content_type="image/jpeg",
        size=123,
    )
    test_db_session.add(file)
    await test_db_session.commit()
    login = await client.post(
        "/api/auth/login",
        json={"email": test_user.email, "password": "testpassword123"},
    )
    cookies = {"access_token": login.cookies["access_token"]}
    payload = {"date": datetime.now(UTC).isoformat(), "meal_type": "lunch"}

    duplicate = await client.post(
        "/api/food/logs",
        cookies=cookies,
        json={**payload, "photo_file_ids": [file.id, file.id]},
    )
    assert duplicate.status_code == 400

    too_many = await client.post(
        "/api/food/logs",
        cookies=cookies,
        json={**payload, "photo_file_ids": [str(uuid4()) for _ in range(16)]},
    )
    assert too_many.status_code == 422


async def test_analyze_meal_uses_every_photo_in_order_and_preserves_logged_at(
    client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    files = [
        File(
            id=str(uuid4()),
            user_id=test_user.id,
            name=f"dish-{index}.jpg",
            content_type="image/jpeg",
            size=123,
        )
        for index in range(2)
    ]
    logged_at = datetime(2026, 7, 20, 12, tzinfo=UTC)
    log = MealLog(
        id=str(uuid4()),
        user_id=test_user.id,
        date=logged_at,
        meal_type="dinner",
        status="logged",
        logged_at=logged_at,
        calories=100,
    )
    test_db_session.add_all([*files, log])
    await test_db_session.flush()
    test_db_session.add_all(
        MealLogPhoto(meal_log_id=log.id, file_id=file.id, position=index)
        for index, file in enumerate(files)
    )
    await test_db_session.commit()

    captured: dict[str, Any] = {}

    class FakeResponse:
        status_code = 200

        def json(self) -> dict[str, Any]:
            return {
                "choices": [
                    {"message": {"content": '{"calories": 850, "protein_g": 50, "items": []}'}}
                ]
            }

    class FakeOpenRouterClient:
        def __init__(self, **_kwargs: object) -> None:
            pass

        async def __aenter__(self) -> Self:
            return self

        async def __aexit__(self, *_args: object) -> None:
            pass

        async def post(self, _url: str, **kwargs: object) -> FakeResponse:
            captured.update(kwargs)
            return FakeResponse()

    monkeypatch.setattr(
        food_routes,
        "get_settings",
        lambda: SimpleNamespace(openrouter_api_key="key", openrouter_model="vision"),
    )
    image_bytes = {files[0].id: b"first", files[1].id: b"second"}
    monkeypatch.setattr(
        food_routes,
        "download",
        lambda _user_id, file_id: (image_bytes[file_id], "image/jpeg"),
    )
    monkeypatch.setattr(httpx, "AsyncClient", FakeOpenRouterClient)

    login = await client.post(
        "/api/auth/login",
        json={"email": test_user.email, "password": "testpassword123"},
    )
    response = await client.post(
        f"/api/food/logs/{log.id}/analyze",
        cookies={"access_token": login.cookies["access_token"]},
    )

    assert response.status_code == 200
    assert response.json()["calories"] == 850
    assert response.json()["logged_at"] == "2026-07-20T12:00:00"
    assert response.json()["photo_file_ids"] == [files[0].id, files[1].id]
    request_json = captured["json"]
    content = request_json["messages"][0]["content"]
    assert len(content) == 3
    assert content[1]["image_url"]["url"].endswith("Zmlyc3Q=")
    assert content[2]["image_url"]["url"].endswith("c2Vjb25k")
