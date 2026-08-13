import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any, cast

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AIAction, AIMemory, AIMessage, Calendar, CalendarEvent, Page, User
from app.modules.ai import agent, tools

pytestmark = pytest.mark.anyio


class FakeProvider:
    def __init__(self, responses: list[dict[str, Any]]) -> None:
        self.responses = responses
        self.seen: list[list[dict[str, Any]]] = []

    async def complete(
        self, messages: list[dict[str, Any]], schemas: list[dict[str, Any]]
    ) -> dict[str, Any]:
        self.seen.append(messages)
        return self.responses.pop(0)

    async def stream(
        self, messages: list[dict[str, Any]], schemas: list[dict[str, Any]]
    ) -> AsyncIterator[str]:
        yield "done"


def call(call_id: str, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": call_id,
        "type": "function",
        "function": {"name": name, "arguments": json.dumps(arguments)},
    }


def parse_events(response_text: str) -> list[dict[str, Any]]:
    return [
        json.loads(line[6:]) for line in response_text.splitlines() if line.startswith("data: ")
    ]


async def login(client: AsyncClient) -> None:
    response = await client.post(
        "/api/auth/login", json={"email": "test@example.com", "password": "testpassword123"}
    )
    assert response.status_code == 200


@pytest.fixture(autouse=True)
async def internal_api(client: AsyncClient) -> AsyncIterator[None]:
    tools.request_factory = lambda: client
    yield
    tools.request_factory = None
    agent.provider_factory = None


async def conversation(client: AsyncClient) -> dict[str, Any]:
    response = await client.post("/api/ai/conversations", json={})
    assert response.status_code == 201
    return cast(dict[str, Any], response.json())


async def test_ai_routes_require_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/ai/settings")).status_code == 401
    assert (await client.get("/api/ai/conversations")).status_code == 401


async def test_settings_are_singleton(client: AsyncClient, test_user: User) -> None:
    await login(client)
    first = await client.get("/api/ai/settings")
    second = await client.get("/api/ai/settings")
    assert first.status_code == 200
    assert first.json() == second.json()
    assert first.json()["model_name"] == "deepseek/deepseek-v4-flash"


async def test_static_conversation_routes_are_not_shadowed(
    client: AsyncClient, test_user: User
) -> None:
    await login(client)
    row = await conversation(client)
    response = await client.post(
        f"/api/ai/conversations/{row['id']}/confirm", json={"action_id": "missing"}
    )
    assert response.status_code == 409


async def test_read_tool_executes_and_preserves_tool_history(
    client: AsyncClient, test_user: User
) -> None:
    await login(client)
    row = await conversation(client)
    fake = FakeProvider(
        [
            {"role": "assistant", "content": None, "tool_calls": [call("read-1", "get_today", {})]},
            {"role": "assistant", "content": "It is today."},
        ]
    )
    agent.provider_factory = lambda model: fake
    response = await client.post(
        f"/api/ai/conversations/{row['id']}/messages", json={"content": "What day is it?"}
    )
    assert [event["type"] for event in parse_events(response.text)] == [
        "conversation",
        "tool_call",
        "tool_result",
        "text_delta",
        "message_done",
        "done",
    ]
    assert fake.seen[1][-2]["tool_calls"][0]["id"] == "read-1"
    assert fake.seen[1][-1]["tool_call_id"] == "read-1"


async def test_write_waits_then_confirm_executes_and_resumes(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    await login(client)
    row = await conversation(client)
    doc = {"type": "doc", "content": [{"type": "paragraph"}]}
    fake = FakeProvider(
        [
            {
                "role": "assistant",
                "content": "I can create it.",
                "tool_calls": [
                    call("write-7", "create_page", {"title": "Agent page", "content": doc})
                ],
            },
            {"role": "assistant", "content": "Created."},
        ]
    )
    agent.provider_factory = lambda model: fake
    proposed = await client.post(
        f"/api/ai/conversations/{row['id']}/messages", json={"content": "Create a page"}
    )
    events = parse_events(proposed.text)
    confirmation = next(event for event in events if event["type"] == "confirm_required")
    assert events[-1]["type"] == "confirm_required"
    assert await test_db_session.scalar(select(Page).where(Page.title == "Agent page")) is None

    confirmed = await client.post(
        f"/api/ai/conversations/{row['id']}/confirm",
        json={"action_id": confirmation["action_id"]},
    )
    assert confirmed.status_code == 200
    assert [event["type"] for event in parse_events(confirmed.text)][-3:] == [
        "text_delta",
        "message_done",
        "done",
    ]
    page = await test_db_session.scalar(select(Page).where(Page.title == "Agent page"))
    assert page is not None and page.content == doc
    assert fake.seen[1][-2]["tool_calls"][0]["id"] == "write-7"
    assert fake.seen[1][-1]["tool_call_id"] == "write-7"
    action = await test_db_session.get(AIAction, confirmation["action_id"])
    assert action is not None and action.status == "executed" and action.entity_id == page.id
    awaiting = await test_db_session.scalar(
        select(AIMessage).where(
            AIMessage.conversation_id == row["id"], AIMessage.tool_calls.is_not(None)
        )
    )
    assert awaiting is not None and awaiting.status == "complete"
    assert awaiting.tool_results and awaiting.tool_results[0]["tool_call_id"] == "write-7"


async def test_reject_resumes_with_matching_tool_call_id(
    client: AsyncClient, test_user: User
) -> None:
    await login(client)
    row = await conversation(client)
    fake = FakeProvider(
        [
            {
                "role": "assistant",
                "tool_calls": [
                    call(
                        "reject-2",
                        "create_page",
                        {"title": "No", "content": {"type": "doc", "content": []}},
                    )
                ],
            },
            {"role": "assistant", "content": "Okay, skipped."},
        ]
    )
    agent.provider_factory = lambda model: fake
    proposed = await client.post(
        f"/api/ai/conversations/{row['id']}/messages", json={"content": "Create it"}
    )
    action_id = next(
        e["action_id"] for e in parse_events(proposed.text) if e["type"] == "confirm_required"
    )
    rejected = await client.post(
        f"/api/ai/conversations/{row['id']}/reject", json={"action_id": action_id}
    )
    assert rejected.status_code == 200
    assert fake.seen[1][-1]["tool_call_id"] == "reject-2"
    assert "rejected" in fake.seen[1][-1]["content"]


async def test_create_undo_removes_created_page(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    await login(client)
    row = await conversation(client)
    fake = FakeProvider(
        [
            {
                "role": "assistant",
                "tool_calls": [
                    call(
                        "c1",
                        "create_page",
                        {"title": "Undo me", "content": {"type": "doc", "content": []}},
                    )
                ],
            },
            {"role": "assistant", "content": "done"},
        ]
    )
    agent.provider_factory = lambda model: fake
    proposed = await client.post(
        f"/api/ai/conversations/{row['id']}/messages", json={"content": "create"}
    )
    action_id = next(
        e["action_id"] for e in parse_events(proposed.text) if e["type"] == "confirm_required"
    )
    await client.post(f"/api/ai/conversations/{row['id']}/confirm", json={"action_id": action_id})
    assert (await client.post(f"/api/ai/actions/{action_id}/undo")).json()["status"] == "undone"
    page = await test_db_session.scalar(select(Page).where(Page.title == "Undo me"))
    assert page is None


async def test_update_and_delete_event_undo_restore_preimage(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    await login(client)
    calendar = Calendar(user_id=test_user.id, name="AI", color="#22d3ee")
    test_db_session.add(calendar)
    await test_db_session.flush()
    original = CalendarEvent(
        calendar_id=calendar.id,
        title="Original",
        start_at=datetime(2026, 8, 14, 9, tzinfo=UTC),
        end_at=datetime(2026, 8, 14, 10, tzinfo=UTC),
        created_by="user",
    )
    test_db_session.add(original)
    await test_db_session.commit()
    event_id = original.id

    for tool_name, args, expected_after in [
        ("update_event", {"id": event_id, "title": "Changed"}, "Changed"),
        ("delete_event", {"id": event_id}, None),
    ]:
        row = await conversation(client)
        fake = FakeProvider(
            [
                {"role": "assistant", "tool_calls": [call(tool_name, tool_name, args)]},
                {"role": "assistant", "content": "done"},
            ]
        )
        agent.provider_factory = lambda model, fake=fake: fake
        proposed = await client.post(
            f"/api/ai/conversations/{row['id']}/messages", json={"content": tool_name}
        )
        action_id = next(
            e["action_id"] for e in parse_events(proposed.text) if e["type"] == "confirm_required"
        )
        await client.post(
            f"/api/ai/conversations/{row['id']}/confirm", json={"action_id": action_id}
        )
        test_db_session.expire_all()
        current = await test_db_session.get(CalendarEvent, event_id)
        assert (current.title if current else None) == expected_after
        undo = await client.post(f"/api/ai/actions/{action_id}/undo")
        assert undo.status_code == 200
        test_db_session.expire_all()
        restored = await test_db_session.get(CalendarEvent, event_id)
        assert (
            restored is not None and restored.title == "Original" and restored.created_by == "user"
        )


async def test_ai_created_event_is_attributed(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    await login(client)
    calendar = Calendar(user_id=test_user.id, name="AI", color="#22d3ee")
    test_db_session.add(calendar)
    await test_db_session.commit()
    row = await conversation(client)
    fake = FakeProvider(
        [
            {
                "role": "assistant",
                "tool_calls": [
                    call(
                        "event-create",
                        "create_event",
                        {
                            "calendar_id": calendar.id,
                            "title": "AI event",
                            "start_at": "2026-08-14T09:00:00Z",
                            "end_at": "2026-08-14T10:00:00Z",
                        },
                    )
                ],
            },
            {"role": "assistant", "content": "done"},
        ]
    )
    agent.provider_factory = lambda model: fake
    proposed = await client.post(
        f"/api/ai/conversations/{row['id']}/messages", json={"content": "event"}
    )
    action_id = next(
        e["action_id"] for e in parse_events(proposed.text) if e["type"] == "confirm_required"
    )
    await client.post(f"/api/ai/conversations/{row['id']}/confirm", json={"action_id": action_id})
    event = await test_db_session.scalar(
        select(CalendarEvent).where(CalendarEvent.title == "AI event")
    )
    assert event is not None and event.created_by == "ai_assistant"


async def test_memory_and_skills_are_durable_across_conversations(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    await login(client)
    first = await conversation(client)
    writer = FakeProvider(
        [
            {
                "role": "assistant",
                "tool_calls": [
                    call("m1", "remember", {"fact": "uses kg"}),
                    call(
                        "s1", "save_skill", {"name": "weekly", "content": "# Weekly\nUse summaries"}
                    ),
                ],
            },
            {"role": "assistant", "content": "saved"},
        ]
    )
    agent.provider_factory = lambda model: writer
    await client.post(f"/api/ai/conversations/{first['id']}/messages", json={"content": "remember"})
    assert await test_db_session.scalar(select(AIMemory.fact).where(AIMemory.fact == "uses kg"))

    second = await conversation(client)
    reader = FakeProvider([{"role": "assistant", "content": "I know."}])
    agent.provider_factory = lambda model: reader
    await client.post(
        f"/api/ai/conversations/{second['id']}/messages", json={"content": "What do you know?"}
    )
    prompt = reader.seen[0][0]["content"]
    assert "uses kg" in prompt and "weekly: # Weekly" in prompt


async def test_get_app_summary_composes_real_endpoint_counts(
    client: AsyncClient, test_user: User
) -> None:
    await login(client)
    result = await tools.execute("get_app_summary", {}, None, test_user.id)
    assert result["ok"] is True
    assert set(result["data"]) == {
        "pages",
        "events_next_7_days",
        "food_logs_today",
        "workouts_this_week",
    }


async def test_tool_schemas_match_content_and_route_requirements() -> None:
    schemas = {item["function"]["name"]: item["function"]["parameters"] for item in tools.schemas()}
    assert schemas["create_page"]["properties"]["content"]["type"] == "object"
    assert schemas["create_event"]["required"] == ["calendar_id", "title", "start_at", "end_at"]
    assert schemas["log_workout_session"]["required"] == ["type"]
    assert schemas["log_food"]["properties"]["calories"]["type"] == "number"
