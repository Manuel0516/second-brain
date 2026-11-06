import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4
from zoneinfo import ZoneInfo

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.routes import wardrobe_ai

pytestmark = pytest.mark.anyio


@pytest.fixture
async def wardrobe_client(client: AsyncClient, test_user: User) -> AsyncClient:
    login = await client.post(
        "/api/auth/login", json={"email": test_user.email, "password": "testpassword123"}
    )
    assert login.status_code == 200
    return client


async def enable(client: AsyncClient, **flags: object) -> None:
    prefs = (await client.get("/api/wardrobe/preferences")).json()
    response = await client.put("/api/wardrobe/preferences", json={**prefs, **flags})
    assert response.status_code == 200


async def garment(client: AsyncClient, archived: bool = False) -> str:
    response = await client.post(
        "/api/wardrobe/garments",
        json={"name": "Linen shirt", "category": "Tops", "archived": archived},
    )
    assert response.status_code == 201
    return str(response.json()["id"])


def fake_ai(monkeypatch: pytest.MonkeyPatch, content: str) -> None:
    monkeypatch.setattr(
        wardrobe_ai, "get_settings", lambda: SimpleNamespace(openrouter_api_key="test-key")
    )
    monkeypatch.setattr(
        wardrobe_ai,
        "provider",
        lambda *_args: SimpleNamespace(complete=AsyncMock(return_value={"content": content})),
    )


async def test_ai_proposals_require_authentication_and_opt_in(
    client: AsyncClient, wardrobe_client: AsyncClient
) -> None:
    payload = {"mode": "outfits", "date": "2026-11-06"}
    response = await wardrobe_client.post("/api/wardrobe/ai/suggestions", json=payload)
    assert response.status_code == 403
    client.cookies.clear()
    assert (await client.post("/api/wardrobe/ai/suggestions", json=payload)).status_code == 401


async def test_ai_returns_proposals_without_saving_or_scheduling(
    wardrobe_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    item = await garment(wardrobe_client)
    await enable(wardrobe_client, ai_outfits_enabled=True)
    fake_ai(
        monkeypatch,
        json.dumps(
            {"outfits": [{"name": "Workday", "notes": "Comfortable layers", "garment_ids": [item]}]}
        ),
    )
    response = await wardrobe_client.post(
        "/api/wardrobe/ai/suggestions", json={"date": "2026-11-06"}
    )
    assert response.status_code == 200
    assert response.json()["outfits"][0]["garment_ids"] == [item]
    assert response.json()["weather"] is None
    assert (await wardrobe_client.get("/api/wardrobe/outfits")).json() == []
    assert (await wardrobe_client.get("/api/wardrobe/schedule")).json() == []


@pytest.mark.parametrize("invalid", ["unknown", "archived", "malformed"])
async def test_ai_rejects_invalid_garment_references_and_responses(
    wardrobe_client: AsyncClient, monkeypatch: pytest.MonkeyPatch, invalid: str
) -> None:
    await garment(wardrobe_client)
    bad_id = await garment(wardrobe_client, True) if invalid == "archived" else str(uuid4())
    await enable(wardrobe_client, ai_outfits_enabled=True)
    content = (
        "not JSON"
        if invalid == "malformed"
        else json.dumps({"outfits": [{"name": "Invalid", "garment_ids": [bad_id]}]})
    )
    fake_ai(monkeypatch, content)
    response = await wardrobe_client.post(
        "/api/wardrobe/ai/suggestions", json={"date": "2026-11-06"}
    )
    assert response.status_code == 502
    assert (await wardrobe_client.get("/api/wardrobe/outfits")).json() == []


async def test_weather_planning_uses_forecast_and_has_independent_switch(
    wardrobe_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    item = await garment(wardrobe_client)
    await enable(wardrobe_client, weather_planning_enabled=True, weather_city="Lund, Sweden")
    fake_ai(
        monkeypatch,
        json.dumps(
            {
                "outfits": [
                    {"name": "Rainy day", "notes": "Add a waterproof layer", "garment_ids": [item]}
                ]
            }
        ),
    )
    today = datetime.now(ZoneInfo("Europe/Stockholm")).date().isoformat()

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "geocoding-api.open-meteo.com":
            return httpx.Response(
                200,
                json={
                    "results": [
                        {"name": "Lund", "country": "Sweden", "latitude": 55.7, "longitude": 13.2}
                    ]
                },
            )
        return httpx.Response(
            200,
            json={
                "daily": {
                    "time": [today],
                    "temperature_2m_min": [3],
                    "temperature_2m_max": [8],
                    "precipitation_probability_max": [80],
                    "wind_speed_10m_max": [20],
                    "weather_code": [61],
                }
            },
        )

    original = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs),
    )
    response = await wardrobe_client.post(
        "/api/wardrobe/ai/suggestions", json={"mode": "weather", "date": today}
    )
    assert response.status_code == 200
    assert response.json()["weather"]["location"] == "Lund, Sweden"
    assert response.json()["weather"]["rain_probability"] == 80
    assert response.json()["weather"]["min_c"] == 3
    assert (await wardrobe_client.get("/api/wardrobe/outfits")).json() == []
    assert (
        await wardrobe_client.post(
            "/api/wardrobe/ai/suggestions", json={"mode": "outfits", "date": today}
        )
    ).status_code == 403


async def test_weather_planning_rejects_dates_outside_forecast_range(
    wardrobe_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    item = await garment(wardrobe_client)
    await enable(wardrobe_client, weather_planning_enabled=True, weather_city="Lund")
    fake_ai(monkeypatch, json.dumps({"outfits": [{"name": "Test", "garment_ids": [item]}]}))
    far_day = (datetime.now(UTC) + timedelta(days=40)).date().isoformat()
    response = await wardrobe_client.post(
        "/api/wardrobe/ai/suggestions", json={"mode": "weather", "date": far_day}
    )
    assert response.status_code == 400
    assert "15 days" in response.json()["detail"]


async def test_missing_provider_configuration_has_actionable_error(
    wardrobe_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await garment(wardrobe_client)
    await enable(wardrobe_client, ai_outfits_enabled=True)
    monkeypatch.setattr(wardrobe_ai, "get_settings", lambda: SimpleNamespace(openrouter_api_key=""))
    response = await wardrobe_client.post(
        "/api/wardrobe/ai/suggestions", json={"date": "2026-11-06"}
    )
    assert response.status_code == 400
    assert "API key" in response.json()["detail"]


async def test_suggestions_include_only_accessible_events_on_selected_day(
    wardrobe_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.models import Calendar, CalendarEvent

    item = await garment(wardrobe_client)
    await enable(wardrobe_client, ai_outfits_enabled=True)
    fake_ai(
        monkeypatch, json.dumps({"outfits": [{"name": "Day-aware look", "garment_ids": [item]}]})
    )
    owned = Calendar(user_id=test_user.id, name="Personal", color="#22d3ee")
    hidden = Calendar(user_id=test_user.id, name="Hidden", color="#22d3ee", is_visible=False)
    other = User(
        username="private-day",
        email="private-day@example.com",
        password_hash=test_user.password_hash,
    )
    test_db_session.add_all([owned, hidden, other])
    await test_db_session.flush()
    private = Calendar(user_id=other.id, name="Private", color="#22d3ee")
    test_db_session.add(private)
    await test_db_session.flush()

    def event(calendar_id: str, title: str, day: int = 6) -> CalendarEvent:
        return CalendarEvent(
            calendar_id=calendar_id,
            title=title,
            start_at=datetime(2026, 11, day, 10, tzinfo=UTC),
            end_at=datetime(2026, 11, day, 11, tzinfo=UTC),
        )

    recurring = CalendarEvent(
        calendar_id=owned.id,
        title="Gym session",
        start_at=datetime(2026, 10, 30, 16, tzinfo=UTC),
        end_at=datetime(2026, 10, 30, 17, tzinfo=UTC),
        rrule="WEEKLY",
        recurrence_byday=["FR"],
        recurrence_count=4,
    )
    test_db_session.add_all(
        [
            event(owned.id, "Client meeting"),
            CalendarEvent(
                calendar_id=owned.id,
                title="Early morning",
                start_at=datetime(2026, 11, 5, 23, 30, tzinfo=UTC),
                end_at=datetime(2026, 11, 5, 23, 50, tzinfo=UTC),
            ),
            CalendarEvent(
                calendar_id=owned.id,
                title="Next local day",
                start_at=datetime(2026, 11, 6, 23, 30, tzinfo=UTC),
                end_at=datetime(2026, 11, 6, 23, 50, tzinfo=UTC),
            ),
            event(owned.id, "Tomorrow", 7),
            event(hidden.id, "Hidden event"),
            event(private.id, "Private event"),
            recurring,
        ]
    )
    await test_db_session.commit()
    response = await wardrobe_client.post(
        "/api/wardrobe/ai/suggestions", json={"date": "2026-11-06"}
    )
    assert response.status_code == 200
    assert {event["title"] for event in response.json()["calendar_events"]} == {
        "Client meeting",
        "Gym session",
        "Early morning",
    }


async def test_ai_rejects_saved_combinations_even_renamed_or_reordered(
    wardrobe_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    first = await garment(wardrobe_client)
    second = await garment(wardrobe_client)
    await enable(wardrobe_client, ai_outfits_enabled=True)
    saved = await wardrobe_client.post(
        "/api/wardrobe/outfits", json={"name": "Original", "garment_ids": [first, second]}
    )
    assert saved.status_code == 201
    for ids in [[first, second], [second, first]]:
        fake_ai(
            monkeypatch,
            json.dumps({"outfits": [{"name": "Completely new name", "garment_ids": ids}]}),
        )
        response = await wardrobe_client.post(
            "/api/wardrobe/ai/suggestions", json={"date": "2026-11-06"}
        )
        assert response.status_code == 502
        assert "already saved" in response.json()["detail"]
    assert len((await wardrobe_client.get("/api/wardrobe/outfits")).json()) == 1


async def test_ai_filters_saved_and_repeated_candidates_but_keeps_new_combinations(
    wardrobe_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    first = await garment(wardrobe_client)
    second = await garment(wardrobe_client)
    await enable(wardrobe_client, ai_outfits_enabled=True)
    await wardrobe_client.post(
        "/api/wardrobe/outfits", json={"name": "Existing", "garment_ids": [first]}
    )
    fake_ai(
        monkeypatch,
        json.dumps(
            {
                "outfits": [
                    {"name": "Renamed existing", "garment_ids": [first]},
                    {"name": "New", "garment_ids": [first, second]},
                    {"name": "Duplicate new", "garment_ids": [second, first]},
                ]
            }
        ),
    )
    response = await wardrobe_client.post(
        "/api/wardrobe/ai/suggestions", json={"date": "2026-11-06"}
    )
    assert response.status_code == 200
    assert len(response.json()["outfits"]) == 1
    assert response.json()["outfits"][0]["name"] == "New"
