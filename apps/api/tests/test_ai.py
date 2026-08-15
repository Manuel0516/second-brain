import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any, cast

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AIAction,
    AIConversation,
    AIMemory,
    AIMessage,
    AISettings,
    AITool,
    Calendar,
    CalendarEvent,
    Link,
    MealLog,
    Page,
    User,
    WorkoutSession,
)
from app.modules.ai import agent, capabilities, prompts, tools
from app.modules.ai import search as graph_search

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


async def test_capability_catalog_generates_typed_tools() -> None:
    matches = capabilities.search("fitness goals")
    capability = next(item for item in matches if item["path"] == "/api/fitness/goals")
    schema = capabilities.tool_schema(capability["id"])
    assert capability["risk"] == "read"
    assert schema["parameters"]["type"] == "object"
    login = next(item for item in capabilities.catalog() if item["path"] == "/api/auth/login")
    login_schema = capabilities.tool_schema(login["id"])
    assert login["risk"] == "high_risk"
    assert "password" in login_schema["secure_fields"]
    assert "password" not in login_schema["parameters"]["properties"]


async def test_capability_loads_and_executes(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    await login(client)
    item = next(row for row in capabilities.catalog() if row["path"] == "/api/calendars")
    loaded = await tools.execute(
        "load_capability", {"capability_id": item["id"]}, test_db_session, test_user.id
    )
    assert loaded["ok"] is True
    row = await test_db_session.scalar(
        select(AITool).where(AITool.user_id == test_user.id, AITool.source == "openapi")
    )
    assert row is not None
    result = await tools.execute(row.name, {}, test_db_session, test_user.id)
    assert result["ok"] is True


async def test_graph_search_keyword_fallback(
    test_user: User, test_db_session: AsyncSession
) -> None:
    test_db_session.add(
        AISettings(
            user_id=test_user.id,
            embedding_provider="local",
            embedding_endpoint_url=None,
        )
    )
    test_db_session.add(
        Page(
            user_id=test_user.id,
            title="Studio contract",
            content={"type": "doc", "content": [{"type": "text", "text": "renewal decision"}]},
        )
    )
    await test_db_session.commit()
    result = await graph_search.search(test_db_session, test_user.id, "renewal")
    assert result[0]["title"] == "Studio contract"


async def test_high_risk_action_executes_after_one_confirmation(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    await login(client)
    row = await conversation(client)
    doc = {"type": "doc", "content": [{"type": "paragraph"}]}
    message = AIMessage(
        conversation_id=row["id"],
        role="assistant",
        tool_calls=[call("sensitive-1", "create_page", {"title": "One click", "content": doc})],
        status="awaiting_confirmation",
    )
    action = AIAction(
        user_id=test_user.id,
        conversation_id=row["id"],
        tool="create_page",
        action="create",
        preview={
            "call_id": "sensitive-1",
            "args": {"title": "One click", "content": doc},
        },
        status="pending",
        risk_level="high_risk",
        confirmations_required=2,
    )
    test_db_session.add_all([message, action])
    await test_db_session.commit()
    agent.provider_factory = lambda model: FakeProvider([{"role": "assistant", "content": "Done"}])
    confirmed = await client.post(
        f"/api/ai/conversations/{row['id']}/confirm", json={"action_id": action.id}
    )
    assert confirmed.status_code == 200
    await test_db_session.refresh(action)
    assert action.status == "executed" and action.confirmations_received == 1
    assert await test_db_session.scalar(select(Page).where(Page.title == "One click"))


async def test_conversation_restores_only_pending_actions(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    await login(client)
    row = await conversation(client)
    pending = AIAction(
        user_id=test_user.id,
        conversation_id=row["id"],
        tool="login",
        action="create",
        preview={
            "call_id": "login-1",
            "args": {"username": "manuel"},
            "secure_fields": ["password"],
        },
        status="pending",
        risk_level="high_risk",
        confirmations_required=1,
    )
    complete = AIAction(
        user_id=test_user.id,
        conversation_id=row["id"],
        tool="create_page",
        action="create",
        preview={"call_id": "page-1", "args": {"title": "Done"}},
        status="executed",
    )
    test_db_session.add_all([pending, complete])
    await test_db_session.commit()

    response = await client.get(f"/api/ai/conversations/{row['id']}")
    assert response.status_code == 200
    assert response.json()["pending_actions"] == [
        {
            "action_id": pending.id,
            "tool": "login",
            "preview": {"username": "manuel", "_secure_fields": ["password"]},
            "high_risk": True,
            "confirmation": 1,
        }
    ]


async def test_pending_actions_are_not_visible_across_users(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    await login(client)
    other = User(
        username="other",
        email="other@example.com",
        password_hash="unused",
        is_active=True,
    )
    test_db_session.add(other)
    await test_db_session.flush()
    other_conversation = AIConversation(user_id=other.id, title="Private")
    test_db_session.add(other_conversation)
    await test_db_session.commit()

    response = await client.get(f"/api/ai/conversations/{other_conversation.id}")
    assert response.status_code == 404


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
    await client.patch("/api/ai/settings", json={"autonomy_level": "auto_low_risk"})
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


async def test_system_prompt_pins_reply_language_to_latest_message(
    test_user: User, test_db_session: AsyncSession
) -> None:
    """The old instruction ('reply in the user's language') was a single vague sentence at
    the very end of an otherwise all-English prompt (facts, skills, tool-call/result text),
    and the model would drift into English over a long conversation instead of matching the
    user (see history 0236). The instruction now leads the prompt and explicitly says the
    rest of the context is English by design and shouldn't influence reply language."""
    prompt = await prompts.build_system_prompt(test_db_session, test_user.id)
    assert "Always reply in the same language as the user's latest message" in prompt
    assert prompt.index("Always reply in the same language") < prompt.index("Recent facts:")


async def test_starter_skills_can_be_edited_and_disabled(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    await login(client)
    listed = await client.get("/api/ai/skills")
    skills = listed.json()
    assert listed.status_code == 200
    assert {row["name"] for row in skills} >= {
        "plan-my-day",
        "weekly-review",
        "meal-planning",
        "workout-coach",
        "spending-review",
        "capture-and-organize",
    }

    target = next(row for row in skills if row["name"] == "plan-my-day")
    updated = await client.patch(
        f"/api/ai/skills/{target['id']}",
        json={"content": "# Private plan", "enabled": False},
    )
    assert updated.status_code == 200
    assert updated.json()["enabled"] is False

    row = await conversation(client)
    fake = FakeProvider([{"role": "assistant", "content": "done"}])
    agent.provider_factory = lambda model: fake
    await client.post(f"/api/ai/conversations/{row['id']}/messages", json={"content": "plan"})
    assert "plan-my-day" not in fake.seen[0][0]["content"]
    loaded = await tools.execute(
        "load_skill", {"name": "plan-my-day"}, test_db_session, test_user.id
    )
    assert loaded["ok"] is False


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


async def test_list_calendars_returns_real_calendars(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    """The agent must be able to discover real calendar ids instead of guessing one for
    create_event — a guessed non-UUID id crashes Postgres (see history 0219)."""
    await login(client)
    calendar = Calendar(user_id=test_user.id, name="Work", color="#22d3ee")
    test_db_session.add(calendar)
    await test_db_session.commit()
    result = await tools.execute("list_calendars", {}, None, test_user.id)
    assert result["ok"] is True
    assert any(row["name"] == "Work" for row in result["data"])
    calendar_id = calendar.id
    assert calendar_id in result["summary"]


async def test_tool_summaries_include_the_entity_id(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    """The model can only reference something it just created/looked up (e.g. to link it,
    update it, or use its id in a later tool call) if the tool summary text includes the
    real id — a name-only summary forces the model to guess ids (see history 0219)."""
    await login(client)
    calendar = Calendar(user_id=test_user.id, name="AI", color="#22d3ee")
    test_db_session.add(calendar)
    await test_db_session.commit()
    calendar_id = calendar.id

    result = await tools.execute(
        "create_event",
        {
            "calendar_id": calendar_id,
            "title": "Push Day",
            "start_at": "2026-08-15T12:30:00Z",
            "end_at": "2026-08-15T13:30:00Z",
        },
        test_db_session,
        test_user.id,
    )
    assert result["ok"] is True
    assert result["data"]["id"] in result["summary"]
    assert "Push Day" in result["summary"]


async def test_create_event_with_workout_type_links_a_planned_session(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    """The agent used to have no one-call way to schedule a future workout: log_workout_session
    always creates a 'completed' session, so it could only be linked to an event after the
    fact via create_link — leaving it in the wrong status (see history 0229). create_event's
    workout_type param reuses the same event->planned-session connection the calendar UI
    offers, so this now happens atomically in a single tool call."""
    await login(client)
    calendar = Calendar(user_id=test_user.id, name="Fitness", color="#22d3ee")
    test_db_session.add(calendar)
    await test_db_session.commit()

    result = await tools.execute(
        "create_event",
        {
            "calendar_id": calendar.id,
            "title": "Legs Workout",
            "start_at": "2026-08-15T18:30:00Z",
            "end_at": "2026-08-15T19:30:00Z",
            "workout_type": "Legs",
        },
        test_db_session,
        test_user.id,
    )
    assert result["ok"] is True
    event_id = result["data"]["id"]

    workout = await test_db_session.scalar(
        select(WorkoutSession).where(WorkoutSession.type == "Legs")
    )
    assert workout is not None
    assert workout.status == "planned"
    assert workout.plan is None

    link = await test_db_session.scalar(
        select(Link).where(Link.source_id == event_id, Link.target_id == workout.id)
    )
    assert link is not None


async def test_create_event_with_meal_type_links_a_planned_meal(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    """Same bug as the workout case (history 0229), for food: log_food always creates an
    already-'logged' meal, so an agent-linked meal never showed the Overview page's
    'Log meal'/'Edit note' buttons — those only render for status == 'planned' meals (see
    history 0232). create_event's meal_type param links a genuinely 'planned' meal instead,
    mirroring workout_type."""
    await login(client)
    calendar = Calendar(user_id=test_user.id, name="Fitness", color="#22d3ee")
    test_db_session.add(calendar)
    await test_db_session.commit()

    result = await tools.execute(
        "create_event",
        {
            "calendar_id": calendar.id,
            "title": "Lunch",
            "start_at": "2026-08-15T12:30:00Z",
            "end_at": "2026-08-15T13:00:00Z",
            "meal_type": "lunch",
        },
        test_db_session,
        test_user.id,
    )
    assert result["ok"] is True
    event_id = result["data"]["id"]

    meal = await test_db_session.scalar(
        select(MealLog).where(MealLog.meal_type == "lunch", MealLog.user_id == test_user.id)
    )
    assert meal is not None
    assert meal.status == "planned"
    assert meal.calories is None

    link = await test_db_session.scalar(
        select(Link).where(Link.source_id == event_id, Link.target_id == meal.id)
    )
    assert link is not None


async def test_create_event_note_creates_and_links_a_page(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    """The agent used to attach a note to a new event via create_page + create_link — three
    calls, no default title/folder, and a hand-picked relation. create_event_note wraps the
    same single endpoint the calendar UI's Notes toggle uses, so this is one call that also
    gets the relation and defaults right (see history 0234)."""
    await login(client)
    calendar = Calendar(user_id=test_user.id, name="Personal", color="#22d3ee")
    test_db_session.add(calendar)
    await test_db_session.commit()

    created = await tools.execute(
        "create_event",
        {
            "calendar_id": calendar.id,
            "title": "Dentist",
            "start_at": "2026-08-15T09:00:00Z",
            "end_at": "2026-08-15T09:30:00Z",
        },
        test_db_session,
        test_user.id,
    )
    assert created["ok"] is True
    event_id = created["data"]["id"]

    result = await tools.execute(
        "create_event_note", {"event_id": event_id}, test_db_session, test_user.id
    )
    assert result["ok"] is True
    page_id = result["data"]["id"]
    assert result["data"]["title"] == "Dentist"

    link = await test_db_session.scalar(
        select(Link).where(
            Link.source_type == "event",
            Link.source_id == event_id,
            Link.target_type == "page",
            Link.target_id == page_id,
            Link.relation == "note",
        )
    )
    assert link is not None


async def test_tool_schemas_match_content_and_route_requirements() -> None:
    schemas = {item["function"]["name"]: item["function"]["parameters"] for item in tools.schemas()}
    assert schemas["create_page"]["properties"]["content"]["type"] == "object"
    assert schemas["create_event"]["required"] == ["calendar_id", "title", "start_at", "end_at"]
    assert set(schemas["create_event"]["properties"]) >= {
        "icon",
        "location",
        "link",
        "all_day",
        "reminder_minutes",
        "rrule",
        "recurrence_interval",
        "recurrence_byday",
        "recurrence_count",
        "recurrence_until",
        "workout_type",
        "meal_type",
    }
    assert schemas["create_event_note"]["required"] == ["event_id"]
    assert schemas["log_workout_session"]["required"] == ["type"]
    assert schemas["log_food"]["properties"]["calories"]["type"] == "number"
    assert schemas["web_fetch"]["required"] == ["url"]
    assert set(schemas["web_fetch"]["properties"]) >= {
        "url",
        "steps",
        "click_text",
        "max_clicks",
    }


async def test_web_fetch_hidden_and_blocked_until_enabled_in_settings(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    """web_fetch reaches the open internet, unlike every other tool — off by default and
    gated behind an explicit AISettings toggle, checked both when building the tool list the
    model sees and again inside execute() itself (defense in depth, see history 0237)."""
    await login(client)

    schemas, is_write = await tools.schemas_for(test_db_session, test_user.id)
    names = {item["function"]["name"] for item in schemas}
    assert "web_fetch" not in names
    assert "web_fetch" not in is_write

    blocked = await tools.execute(
        "web_fetch", {"url": "https://example.com"}, test_db_session, test_user.id
    )
    assert blocked["ok"] is False

    patched = await client.patch("/api/ai/settings", json={"web_fetch_enabled": True})
    assert patched.status_code == 200 and patched.json()["web_fetch_enabled"] is True

    schemas, is_write = await tools.schemas_for(test_db_session, test_user.id)
    names = {item["function"]["name"] for item in schemas}
    assert "web_fetch" in names
    assert is_write["web_fetch"] is False


async def test_web_fetch_uses_the_browser_only_when_click_text_is_given(
    test_user: User, test_db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A plain web_fetch call must stay on the fast httpx path (web.fetch) — the headless
    browser (web.fetch_dynamic) only launches when click_text is explicitly given, since it
    costs a real browser process. Real click-loop behavior is covered against a live local
    server in test_web_fetch.py; this only checks tools.execute's dispatch (see history
    0237)."""
    test_db_session.add(AISettings(user_id=test_user.id, web_fetch_enabled=True))
    await test_db_session.commit()

    from app.modules.ai import web

    calls: list[str] = []

    async def fake_fetch(_url: str) -> dict[str, object]:
        calls.append("static")
        return {"url": _url, "title": "T", "text": "static body", "truncated": False}

    async def fake_fetch_dynamic(
        _url: str,
        steps: list[dict[str, object]] | None = None,
        click_text: str | None = None,
        max_clicks: int = 10,
    ) -> dict[str, object]:
        calls.append(f"dynamic:{steps}:{click_text}:{max_clicks}")
        return {"url": _url, "title": "T", "text": "dynamic body", "truncated": False}

    monkeypatch.setattr(web, "fetch", fake_fetch)
    monkeypatch.setattr(web, "fetch_dynamic", fake_fetch_dynamic)

    plain = await tools.execute(
        "web_fetch", {"url": "https://example.com"}, test_db_session, test_user.id
    )
    assert plain["ok"] is True and "static body" in plain["summary"]

    clicked = await tools.execute(
        "web_fetch",
        {"url": "https://example.com", "click_text": "Visa fler", "max_clicks": 5},
        test_db_session,
        test_user.id,
    )
    assert clicked["ok"] is True and "dynamic body" in clicked["summary"]

    steps = [{"click": "Välj butik"}, {"type": "Lund", "into": "Sök"}]
    stepped = await tools.execute(
        "web_fetch",
        {"url": "https://example.com", "steps": steps},
        test_db_session,
        test_user.id,
    )
    assert stepped["ok"] is True and "dynamic body" in stepped["summary"]

    assert calls == [
        "static",
        "dynamic:[]:Visa fler:5",
        f"dynamic:{steps}:None:10",
    ]


async def test_create_event_workout_type_description_warns_against_asking() -> None:
    """Regression for a real chat where the model asked the user 3 times which workout
    'type' they meant before linking an empty planned workout — workout_type is just a
    label and never affects the (always empty) exercise list, so the model should pick a
    placeholder itself instead of interrogating the user (see history 0231)."""
    description = next(
        item["function"]["description"]
        for item in tools.schemas()
        if item["function"]["name"] == "create_event"
    )
    assert "never pre-fills exercises" in description
    assert "instead of asking which type they mean" in description


# ── Phase 7: self-extending spec tools ──────────────────────────────────────


async def test_schemas_for_includes_seeded_spec_tools(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    await login(client)
    schemas, is_write = await tools.schemas_for(test_db_session, test_user.id)
    names = {item["function"]["name"] for item in schemas}
    assert "workout_session_detail" in names
    assert "get_fitness_goals" in names
    assert is_write["set_meal_log_status"] is True
    assert is_write["workout_session_detail"] is False


async def test_seeded_read_spec_executes_against_real_route(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    await login(client)
    workout = WorkoutSession(
        user_id=test_user.id, date=datetime(2026, 8, 10, tzinfo=UTC), type="Push Day"
    )
    test_db_session.add(workout)
    await test_db_session.commit()

    row = await conversation(client)
    fake = FakeProvider(
        [
            {
                "role": "assistant",
                "tool_calls": [call("s1", "workout_session_detail", {"session_id": workout.id})],
            },
            {"role": "assistant", "content": "It was a push day."},
        ]
    )
    agent.provider_factory = lambda model: fake
    response = await client.post(
        f"/api/ai/conversations/{row['id']}/messages",
        json={"content": "how did my last workout go"},
    )
    result = next(e for e in parse_events(response.text) if e["type"] == "tool_result")
    assert result["ok"] is True


async def test_disabled_spec_tool_is_reported_unknown(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    await login(client)
    await tools.schemas_for(test_db_session, test_user.id)
    tool_row = (
        await test_db_session.execute(
            select(AITool).where(AITool.user_id == test_user.id, AITool.name == "recent_workouts")
        )
    ).scalar_one()
    tool_row.enabled = False
    await test_db_session.commit()

    row = await conversation(client)
    fake = FakeProvider(
        [
            {"role": "assistant", "tool_calls": [call("d1", "recent_workouts", {})]},
            {"role": "assistant", "content": "done"},
        ]
    )
    agent.provider_factory = lambda model: fake
    response = await client.post(
        f"/api/ai/conversations/{row['id']}/messages", json={"content": "recent workouts"}
    )
    result = next(e for e in parse_events(response.text) if e["type"] == "tool_result")
    assert result["ok"] is False
    assert "Unknown tool" in result["summary"]


async def test_create_tool_rejects_a_path_with_no_matching_route(
    client: AsyncClient, test_user: User
) -> None:
    await login(client)
    row = await conversation(client)
    bad_spec = {"method": "GET", "path": "/api/not/a/real/route", "args": {}}
    fake = FakeProvider(
        [
            {
                "role": "assistant",
                "tool_calls": [
                    call(
                        "t1",
                        "create_tool",
                        {
                            "name": "bogus",
                            "description": "Bogus.",
                            "kind": "read",
                            "spec": bad_spec,
                        },
                    )
                ],
            },
        ]
    )
    agent.provider_factory = lambda model: fake
    proposed = await client.post(
        f"/api/ai/conversations/{row['id']}/messages", json={"content": "make a tool"}
    )
    action_id = next(
        e["action_id"] for e in parse_events(proposed.text) if e["type"] == "confirm_required"
    )
    confirmed = await client.post(
        f"/api/ai/conversations/{row['id']}/confirm", json={"action_id": action_id}
    )
    assert confirmed.status_code == 502


async def test_create_tool_valid_spec_then_usable_in_a_later_turn(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    await login(client)
    row = await conversation(client)
    good_spec = {"method": "GET", "path": "/api/pages", "args": {}}
    creator = FakeProvider(
        [
            {
                "role": "assistant",
                "tool_calls": [
                    call(
                        "t1",
                        "create_tool",
                        {
                            "name": "list_pages_v2",
                            "description": "List pages.",
                            "kind": "read",
                            "spec": good_spec,
                        },
                    )
                ],
            },
            {"role": "assistant", "content": "Created it."},
        ]
    )
    agent.provider_factory = lambda model: creator
    proposed = await client.post(
        f"/api/ai/conversations/{row['id']}/messages", json={"content": "make a tool"}
    )
    action_id = next(
        e["action_id"] for e in parse_events(proposed.text) if e["type"] == "confirm_required"
    )
    confirmed = await client.post(
        f"/api/ai/conversations/{row['id']}/confirm", json={"action_id": action_id}
    )
    assert confirmed.status_code == 200

    schemas, is_write = await tools.schemas_for(test_db_session, test_user.id)
    assert "list_pages_v2" in {item["function"]["name"] for item in schemas}
    assert is_write["list_pages_v2"] is False

    row2 = await conversation(client)
    reader = FakeProvider(
        [
            {"role": "assistant", "tool_calls": [call("u1", "list_pages_v2", {})]},
            {"role": "assistant", "content": "Here they are."},
        ]
    )
    agent.provider_factory = lambda model: reader
    used = await client.post(
        f"/api/ai/conversations/{row2['id']}/messages", json={"content": "list my pages"}
    )
    result = next(e for e in parse_events(used.text) if e["type"] == "tool_result")
    assert result["ok"] is True


async def test_write_spec_confirm_executes_and_undo_restores(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    await login(client)
    log = MealLog(
        user_id=test_user.id,
        date=datetime(2026, 8, 10, tzinfo=UTC),
        meal_type="lunch",
        status="planned",
    )
    test_db_session.add(log)
    await test_db_session.commit()
    log_id = log.id

    row = await conversation(client)
    fake = FakeProvider(
        [
            {
                "role": "assistant",
                "tool_calls": [
                    call("w1", "set_meal_log_status", {"log_id": log_id, "status": "logged"})
                ],
            },
            {"role": "assistant", "content": "Marked it logged."},
        ]
    )
    agent.provider_factory = lambda model: fake
    proposed = await client.post(
        f"/api/ai/conversations/{row['id']}/messages", json={"content": "mark lunch logged"}
    )
    action_id = next(
        e["action_id"] for e in parse_events(proposed.text) if e["type"] == "confirm_required"
    )
    confirmed = await client.post(
        f"/api/ai/conversations/{row['id']}/confirm", json={"action_id": action_id}
    )
    assert confirmed.status_code == 200
    test_db_session.expire_all()
    current = await test_db_session.get(MealLog, log_id)
    assert current is not None and current.status == "logged"

    undo = await client.post(f"/api/ai/actions/{action_id}/undo")
    assert undo.status_code == 200
    test_db_session.expire_all()
    restored = await test_db_session.get(MealLog, log_id)
    assert restored is not None and restored.status == "planned"


# ── Phase 8: identity & growth ───────────────────────────────────────────────


async def test_remember_persists_category_and_invalid_falls_back(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    await login(client)
    await client.patch("/api/ai/settings", json={"autonomy_level": "auto_low_risk"})
    row = await conversation(client)
    fake = FakeProvider(
        [
            {
                "role": "assistant",
                "tool_calls": [
                    call("m1", "remember", {"fact": "trains 5x/week", "category": "preference"}),
                    call("m2", "remember", {"fact": "loose fact", "category": "nonsense"}),
                ],
            },
            {"role": "assistant", "content": "noted"},
        ]
    )
    agent.provider_factory = lambda model: fake
    await client.post(f"/api/ai/conversations/{row['id']}/messages", json={"content": "remember"})
    rows = (
        await test_db_session.execute(
            select(AIMemory.fact, AIMemory.category).where(AIMemory.user_id == test_user.id)
        )
    ).all()
    by_fact = {fact: category for fact, category in rows}
    assert by_fact["trains 5x/week"] == "preference"
    assert by_fact["loose fact"] == "fact"


async def test_forget_is_gated_and_deletes_by_fact(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    await login(client)
    test_db_session.add_all(
        [
            AIMemory(user_id=test_user.id, fact="keep me", category="fact"),
            AIMemory(user_id=test_user.id, fact="drop me", category="fact"),
        ]
    )
    await test_db_session.commit()

    row = await conversation(client)
    fake = FakeProvider(
        [
            {"role": "assistant", "tool_calls": [call("f1", "forget", {"fact": "drop me"})]},
            {"role": "assistant", "content": "forgot it"},
        ]
    )
    agent.provider_factory = lambda model: fake
    proposed = await client.post(
        f"/api/ai/conversations/{row['id']}/messages", json={"content": "forget that"}
    )
    action_id = next(
        e["action_id"] for e in parse_events(proposed.text) if e["type"] == "confirm_required"
    )
    still_there = (
        (
            await test_db_session.execute(
                select(AIMemory.fact).where(AIMemory.user_id == test_user.id)
            )
        )
        .scalars()
        .all()
    )
    assert "drop me" in still_there  # not deleted until confirmed

    confirmed = await client.post(
        f"/api/ai/conversations/{row['id']}/confirm", json={"action_id": action_id}
    )
    assert confirmed.status_code == 200
    remaining = (
        (
            await test_db_session.execute(
                select(AIMemory.fact).where(AIMemory.user_id == test_user.id)
            )
        )
        .scalars()
        .all()
    )
    assert "drop me" not in remaining
    assert "keep me" in remaining


async def test_system_prompt_shows_categorized_about_block(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    await login(client)
    test_db_session.add_all(
        [
            AIMemory(user_id=test_user.id, fact="works in tech", category="profile"),
            AIMemory(user_id=test_user.id, fact="likes kg units", category="preference"),
            AIMemory(user_id=test_user.id, fact="meant grams not kg", category="correction"),
            AIMemory(user_id=test_user.id, fact="ran 5k today", category="fact"),
        ]
    )
    await test_db_session.commit()
    row = await conversation(client)
    fake = FakeProvider([{"role": "assistant", "content": "hi"}])
    agent.provider_factory = lambda model: fake
    await client.post(f"/api/ai/conversations/{row['id']}/messages", json={"content": "hi"})
    prompt = fake.seen[0][0]["content"]
    assert "works in tech" in prompt
    assert "likes kg units" in prompt
    assert "meant grams not kg" in prompt
    assert "ran 5k today" in prompt
    assert prompt.index("Profile:") < prompt.index("Recent facts:")


async def test_consolidation_skill_is_seeded_and_collapses_facts(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    await login(client)
    await client.patch("/api/ai/settings", json={"autonomy_level": "auto_low_risk"})
    test_db_session.add_all(
        [
            AIMemory(user_id=test_user.id, fact="ran 5k monday", category="fact"),
            AIMemory(user_id=test_user.id, fact="ran 5k wednesday", category="fact"),
            AIMemory(user_id=test_user.id, fact="ran 5k friday", category="fact"),
        ]
    )
    await test_db_session.commit()

    row = await conversation(client)
    fake = FakeProvider(
        [
            {
                "role": "assistant",
                "tool_calls": [call("l1", "load_skill", {"name": "memory-consolidation"})],
            },
            {
                "role": "assistant",
                "tool_calls": [
                    call(
                        "r1",
                        "remember",
                        {"fact": "runs 5k three times a week", "category": "preference"},
                    )
                ],
            },
            {
                "role": "assistant",
                "tool_calls": [call("f1", "forget", {"category": "fact"})],
            },
            {"role": "assistant", "content": "Consolidated."},
        ]
    )
    agent.provider_factory = lambda model: fake
    proposed = await client.post(
        f"/api/ai/conversations/{row['id']}/messages", json={"content": "review your memory"}
    )
    action_id = next(
        e["action_id"] for e in parse_events(proposed.text) if e["type"] == "confirm_required"
    )
    confirmed = await client.post(
        f"/api/ai/conversations/{row['id']}/confirm", json={"action_id": action_id}
    )
    assert confirmed.status_code == 200

    remaining = (
        await test_db_session.execute(
            select(AIMemory.fact, AIMemory.category).where(AIMemory.user_id == test_user.id)
        )
    ).all()
    assert [tuple(item) for item in remaining] == [("runs 5k three times a week", "preference")]


async def test_create_link_supports_non_page_node_types(
    client: AsyncClient, test_user: User, test_db_session: AsyncSession
) -> None:
    """Regression: create_link used to hardcode source_type/target_type to "page",
    so linking an event to a workout session or meal log always 404'd/500'd."""
    await login(client)
    calendar = Calendar(user_id=test_user.id, name="AI", color="#22d3ee")
    test_db_session.add(calendar)
    await test_db_session.flush()
    event = CalendarEvent(
        calendar_id=calendar.id,
        title="Gym",
        start_at=datetime(2026, 8, 15, 12, 30, tzinfo=UTC),
        end_at=datetime(2026, 8, 15, 13, 30, tzinfo=UTC),
        created_by="user",
    )
    session_row = WorkoutSession(
        user_id=test_user.id, date=datetime(2026, 8, 15, tzinfo=UTC), type="Push"
    )
    test_db_session.add_all([event, session_row])
    await test_db_session.commit()
    event_id, session_id = event.id, session_row.id

    row = await conversation(client)
    fake = FakeProvider(
        [
            {
                "role": "assistant",
                "tool_calls": [
                    call(
                        "link-1",
                        "create_link",
                        {
                            "source_id": event_id,
                            "source_type": "event",
                            "target_id": session_id,
                            "target_type": "workout_session",
                        },
                    )
                ],
            },
            {"role": "assistant", "content": "Linked."},
        ]
    )
    agent.provider_factory = lambda model: fake
    proposed = await client.post(
        f"/api/ai/conversations/{row['id']}/messages", json={"content": "link them"}
    )
    action_id = next(
        e["action_id"] for e in parse_events(proposed.text) if e["type"] == "confirm_required"
    )
    confirmed = await client.post(
        f"/api/ai/conversations/{row['id']}/confirm", json={"action_id": action_id}
    )
    assert confirmed.status_code == 200
    link = await test_db_session.scalar(
        select(Link).where(Link.source_id == event_id, Link.target_id == session_id)
    )
    assert link is not None
    assert link.source_type == "event"
    assert link.target_type == "workout_session"
