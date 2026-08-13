from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import quote, urlencode

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import AISkill, CalendarEvent
from app.modules.ai import memory
from app.security import generate_jwt

JSON = dict[str, Any]
RequestFactory = Callable[[], httpx.AsyncClient]
request_factory: RequestFactory | None = None


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    properties: JSON = field(default_factory=dict)
    required: tuple[str, ...] = ()
    is_write: bool = False

    def schema(self) -> JSON:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": self.properties,
                    "required": list(self.required),
                    "additionalProperties": False,
                },
            },
        }


S = {"type": "string"}
N = {"type": "number"}
OBJECT = {"type": "object", "additionalProperties": True}
TOOLS = [
    Tool("search_pages", "Search pages by keyword.", {"query": S}, ("query",)),
    Tool("get_page", "Get one page by id.", {"id": S}, ("id",)),
    Tool("list_pages", "List active pages."),
    Tool(
        "get_events",
        "Get events in an ISO datetime range.",
        {"start": S, "end": S},
        ("start", "end"),
    ),
    Tool("get_food_summary", "Get one day's nutrition summary.", {"date": S}, ("date",)),
    Tool("get_food_logs", "Get one day's meal logs.", {"date": S}, ("date",)),
    Tool("get_fitness_overview", "Get fitness overview statistics."),
    Tool("list_exercises", "List exercises."),
    Tool("get_today", "Get today's UTC date and weekday."),
    Tool(
        "get_app_summary",
        "Count pages, upcoming events, today's food logs, and this week's workouts.",
    ),
    Tool("remember", "Save a durable user fact.", {"fact": S}, ("fact",)),
    Tool("recall", "Recall all durable user facts."),
    Tool("list_skills", "List saved skill names."),
    Tool("load_skill", "Load a skill's markdown.", {"name": S}, ("name",)),
    Tool("save_skill", "Create or update a skill.", {"name": S, "content": S}, ("name", "content")),
    Tool("delete_skill", "Delete a skill.", {"name": S}, ("name",)),
    Tool(
        "create_page",
        "Create a page with Tiptap JSON content.",
        {"title": S, "content": OBJECT},
        ("title", "content"),
        True,
    ),
    Tool(
        "update_page",
        "Update a page title and/or Tiptap JSON content.",
        {"id": S, "title": S, "content": OBJECT},
        ("id",),
        True,
    ),
    Tool(
        "create_event",
        "Create an event. calendar_id, title, start_at and end_at are required.",
        {"calendar_id": S, "title": S, "start_at": S, "end_at": S, "description": S},
        ("calendar_id", "title", "start_at", "end_at"),
        True,
    ),
    Tool(
        "update_event",
        "Update an event.",
        {"id": S, "title": S, "start_at": S, "end_at": S, "description": S},
        ("id",),
        True,
    ),
    Tool("delete_event", "Delete an event.", {"id": S}, ("id",), True),
    Tool(
        "create_link",
        "Link two pages.",
        {"source_id": S, "target_id": S},
        ("source_id", "target_id"),
        True,
    ),
    Tool(
        "log_food",
        "Log a meal.",
        {
            "meal_type": {"type": "string", "enum": ["breakfast", "lunch", "dinner", "snack"]},
            "name": S,
            "calories": N,
            "date": S,
        },
        ("meal_type", "name"),
        True,
    ),
    Tool(
        "log_workout_session",
        "Log a completed workout session.",
        {"type": S, "notes": OBJECT, "date": S},
        ("type",),
        True,
    ),
]
BY_NAME = {tool.name: tool for tool in TOOLS}


def schemas() -> list[JSON]:
    return [tool.schema() for tool in TOOLS]


def _request(name: str, a: JSON) -> tuple[str, str, JSON | None]:
    now = datetime.now(UTC)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if name == "search_pages":
        return "GET", f"/api/search?q={quote(str(a['query']))}", None
    if name == "get_page":
        return "GET", f"/api/pages/{a['id']}", None
    if name == "list_pages":
        return "GET", "/api/pages", None
    if name == "get_events":
        return (
            "GET",
            "/api/events?" + urlencode({"from_date": a["start"], "to_date": a["end"]}),
            None,
        )
    if name == "get_food_summary":
        start = f"{a['date']}T00:00:00Z"
        end = f"{a['date']}T23:59:59Z"
        return "GET", "/api/food/summary?" + urlencode({"from_date": start, "to_date": end}), None
    if name == "get_food_logs":
        start = f"{a['date']}T00:00:00Z"
        end = f"{a['date']}T23:59:59Z"
        return "GET", "/api/food/logs?" + urlencode({"from_date": start, "to_date": end}), None
    if name == "get_fitness_overview":
        return "GET", "/api/fitness/stats/overview", None
    if name == "list_exercises":
        return "GET", "/api/fitness/exercises", None
    if name == "create_page":
        return "POST", "/api/pages", {"title": a["title"]}
    if name == "update_page":
        return "PATCH", f"/api/pages/{a['id']}", {k: v for k, v in a.items() if k != "id"}
    if name == "create_event":
        return "POST", "/api/events", dict(a)
    if name == "update_event":
        return "PATCH", f"/api/events/{a['id']}", {k: v for k, v in a.items() if k != "id"}
    if name == "delete_event":
        return "DELETE", f"/api/events/{a['id']}", None
    if name == "create_link":
        return (
            "POST",
            "/api/links",
            {
                "source_type": "page",
                "source_id": a["source_id"],
                "target_type": "page",
                "target_id": a["target_id"],
                "relation": "related",
            },
        )
    if name == "log_food":
        return (
            "POST",
            "/api/food/logs",
            {
                "date": a.get("date", now.isoformat()),
                "meal_type": a["meal_type"],
                "status": "logged",
                "notes": a["name"],
                "calories": a.get("calories"),
            },
        )
    if name == "log_workout_session":
        return (
            "POST",
            "/api/fitness/sessions",
            {
                "date": a.get("date", now.isoformat()),
                "type": a["type"],
                "status": "completed",
                "notes": a.get("notes", {}),
            },
        )
    if name == "_summary_events":
        return (
            "GET",
            "/api/events?"
            + urlencode(
                {"from_date": now.isoformat(), "to_date": (now + timedelta(days=7)).isoformat()}
            ),
            None,
        )
    if name == "_summary_food":
        return (
            "GET",
            "/api/food/logs?"
            + urlencode(
                {
                    "from_date": day_start.isoformat(),
                    "to_date": (day_start + timedelta(days=1)).isoformat(),
                }
            ),
            None,
        )
    if name == "_summary_workouts":
        week = day_start - timedelta(days=day_start.weekday())
        return (
            "GET",
            "/api/fitness/sessions?"
            + urlencode({"from_date": week.isoformat(), "to_date": now.isoformat()}),
            None,
        )
    raise KeyError(name)


async def _api(method: str, path: str, body: JSON | None, user_id: str) -> httpx.Response:
    # get_current_user authenticates the same access JWT from its httpOnly cookie.
    token = generate_jwt(user_id, "access", 5)
    if request_factory:
        client = request_factory()
        client.cookies.set("access_token", token)
        return await client.request(method, path, json=body)
    async with httpx.AsyncClient(
        base_url=get_settings().ai_internal_api_url,
        timeout=30,
        cookies={"access_token": token},
    ) as client:
        return await client.request(method, path, json=body)


async def _call(name: str, args: JSON, user_id: str) -> tuple[bool, Any, str]:
    method, path, body = _request(name, args)
    response = await _api(method, path, body, user_id)
    if response.status_code >= 400:
        return False, None, f"API returned {response.status_code}: {response.text[:300]}"
    data = None if response.status_code == 204 else response.json()
    return True, data, str(data)[:500]


async def execute(name: str, args: JSON, session: AsyncSession | None, user_id: str) -> JSON:
    if name == "get_today":
        now = datetime.now(UTC)
        data = {"date": now.date().isoformat(), "weekday": now.strftime("%A")}
        return {"ok": True, "data": data, "summary": f"{data['weekday']} {data['date']}"}
    if name == "remember":
        assert session is not None
        return {"ok": True, "summary": await memory.remember(session, user_id, str(args["fact"]))}
    if name == "recall":
        assert session is not None
        rows = await memory.recall(session, user_id)
        return {"ok": True, "data": rows, "summary": str(rows)[:500]}
    if name in {"list_skills", "load_skill", "save_skill", "delete_skill"}:
        assert session is not None
        if name == "list_skills":
            rows = list(
                (
                    await session.execute(select(AISkill.name).where(AISkill.user_id == user_id))
                ).scalars()
            )
            return {"ok": True, "data": rows, "summary": str(rows)[:500]}
        if name == "load_skill":
            row = (
                await session.execute(
                    select(AISkill.content).where(
                        AISkill.user_id == user_id, AISkill.name == str(args["name"])
                    )
                )
            ).scalar_one_or_none()
            return {"ok": row is not None, "data": row, "summary": (row or "Skill not found")[:500]}
        if name == "save_skill":
            return {
                "ok": True,
                "summary": await memory.save_skill(
                    session, user_id, str(args["name"]), str(args["content"])
                ),
            }
        return {
            "ok": True,
            "summary": await memory.delete_skill(session, user_id, str(args["name"])),
        }
    if name == "get_app_summary":
        pages_ok, pages, _ = await _call("list_pages", {}, user_id)
        events_ok, events, _ = await _call("_summary_events", {}, user_id)
        food_ok, food, _ = await _call("_summary_food", {}, user_id)
        workouts_ok, workouts, _ = await _call("_summary_workouts", {}, user_id)
        ok = all((pages_ok, events_ok, food_ok, workouts_ok))
        summary_data: JSON = {
            "pages": len(pages or []),
            "events_next_7_days": len(events or []),
            "food_logs_today": len(food or []),
            "workouts_this_week": len(workouts or []),
        }
        return {"ok": ok, "data": summary_data, "summary": str(summary_data)}

    ok, data, summary = await _call(name, args, user_id)
    if ok and name == "create_page" and isinstance(data, dict) and args.get("content") is not None:
        ok, data, summary = await _call(
            "update_page", {"id": data["id"], "content": args["content"]}, user_id
        )
    if ok and name == "create_event" and isinstance(data, dict) and session is not None:
        event = await session.get(CalendarEvent, data["id"])
        if event is not None:
            event.created_by = "ai_assistant"
            await session.commit()
    return {"ok": ok, "data": data, "summary": summary}


async def preimage(tool: str, args: JSON, session: AsyncSession, user_id: str) -> JSON | None:
    read_name = {"update_page": "get_page", "update_event": None, "delete_event": None}.get(tool)
    if tool in {"update_event", "delete_event"}:
        row = await session.get(CalendarEvent, args["id"])
        if row is not None:
            keys = (
                "id",
                "calendar_id",
                "title",
                "icon",
                "description",
                "location",
                "start_at",
                "end_at",
                "all_day",
                "timezone",
                "color_override",
                "link",
                "reminder_minutes",
                "rrule",
                "recurrence_interval",
                "recurrence_byday",
                "recurrence_count",
                "recurrence_until",
                "recurrence_exdates",
                "recurrence_parent_id",
                "recurrence_overridden_at",
                "connections",
                "created_by",
                "external_id",
                "google_etag",
                "source",
                "last_synced_at",
                "created_at",
                "updated_at",
            )
            return {
                key: value.isoformat()
                if isinstance((value := getattr(row, key)), datetime)
                else value
                for key in keys
            }
    if read_name:
        ok, data, _ = await _call(read_name, {"id": args["id"]}, user_id)
        return data if ok and isinstance(data, dict) else None
    return None


async def undo(
    tool: str, payload: JSON, user_id: str, session: AsyncSession
) -> tuple[bool, Any, str]:
    result = payload.get("result")
    before = payload.get("before")
    if tool == "create_page" and isinstance(result, dict):
        return (
            await _call(
                "update_page",
                {"id": result["id"], "deleted_at": datetime.now(UTC).isoformat()},
                user_id,
            )
            if False
            else await _delete_page(result["id"], user_id)
        )
    if tool == "create_event" and isinstance(result, dict):
        return await _delete_path(f"/api/events/{result['id']}", user_id)
    if tool == "create_link" and isinstance(result, dict):
        return await _delete_path(f"/api/links/{result['id']}", user_id)
    if tool == "log_food" and isinstance(result, dict):
        return await _delete_path(f"/api/food/logs/{result['id']}", user_id)
    if tool == "log_workout_session" and isinstance(result, dict):
        return await _delete_path(f"/api/fitness/sessions/{result['id']}", user_id)
    if tool == "update_page" and isinstance(before, dict):
        body = {
            key: before[key]
            for key in ("title", "content", "icon", "cover", "parent_page_id")
            if key in before
        }
        response = await _api("PATCH", f"/api/pages/{before['id']}", body, user_id)
        return _response_tuple(response)
    if tool == "update_event" and isinstance(before, dict):
        body = _event_body(before)
        response = await _api("PATCH", f"/api/events/{before['id']}", body, user_id)
        if response.status_code < 400:
            row = await session.get(CalendarEvent, before["id"])
            if row:
                row.created_by = before.get("created_by", "user")
                await session.commit()
        return _response_tuple(response)
    if tool == "delete_event" and isinstance(before, dict):
        datetime_keys = {
            "start_at",
            "end_at",
            "recurrence_until",
            "recurrence_overridden_at",
            "last_synced_at",
            "created_at",
            "updated_at",
        }
        values = {
            key: datetime.fromisoformat(value)
            if key in datetime_keys and isinstance(value, str)
            else value
            for key, value in before.items()
        }
        session.add(CalendarEvent(**values))
        await session.commit()
        return True, before, "Event restored"
    return False, None, "Undo is not supported for this action"


def _event_body(data: JSON) -> JSON:
    keys = (
        "calendar_id",
        "title",
        "description",
        "location",
        "start_at",
        "end_at",
        "all_day",
        "timezone",
        "color_override",
        "reminder_minutes",
        "rrule",
        "recurrence_interval",
        "recurrence_byday",
        "recurrence_count",
        "recurrence_until",
        "connections",
    )
    return {key: data[key] for key in keys if key in data}


async def _delete_page(page_id: str, user_id: str) -> tuple[bool, Any, str]:
    deleted = await _delete_path(f"/api/pages/{page_id}", user_id)
    if not deleted[0]:
        return deleted
    return await _delete_path(f"/api/pages/{page_id}/permanent", user_id)


async def _delete_path(path: str, user_id: str) -> tuple[bool, Any, str]:
    return _response_tuple(await _api("DELETE", path, None, user_id))


def _response_tuple(response: httpx.Response) -> tuple[bool, Any, str]:
    if response.status_code >= 400:
        return False, None, f"API returned {response.status_code}: {response.text[:300]}"
    data = None if response.status_code == 204 else response.json()
    return True, data, str(data)[:500]
