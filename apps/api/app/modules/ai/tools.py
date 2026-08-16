import json
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import quote, urlencode

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import AISettings, AISkill, AITool, CalendarEvent
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
    Tool(
        "search_graph",
        "Hybrid semantic and keyword search across notes, events, meals, and workouts.",
        {"query": S, "limit": {"type": "integer", "minimum": 1, "maximum": 25}},
        ("query",),
    ),
    Tool(
        "search_pages",
        "Search notes/pages by keyword and return page ids. Results are pages only; use "
        "get_page on the chosen id before answering about its contents because search "
        "results are matches, not the complete note.",
        {"query": S},
        ("query",),
    ),
    Tool(
        "get_page",
        "Get one complete page by id, including its full Tiptap content and every section. "
        "This result is authoritative: do not use search snippets to infer what else the "
        "note contains and do not keep searching for sections after this succeeds.",
        {"id": S},
        ("id",),
    ),
    Tool("list_pages", "List active pages."),
    Tool(
        "get_events",
        "Get events in an ISO datetime range.",
        {"start": S, "end": S},
        ("start", "end"),
    ),
    Tool(
        "list_calendars",
        "List the user's calendars (id, name, color). Call this before create_event if "
        "you don't already know a real calendar_id — never guess one.",
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
    Tool(
        "remember",
        "Save a durable user fact.",
        {
            "fact": S,
            "category": {
                "type": "string",
                "enum": ["fact", "profile", "preference", "correction"],
            },
        },
        ("fact",),
        True,
    ),
    Tool("recall", "Recall all durable user facts."),
    Tool(
        "profile",
        "Read back a categorized 'what I know about you' summary (profile, preferences, "
        "corrections, recent facts).",
    ),
    Tool(
        "forget",
        "Delete durable memory: either one exact fact, or a whole category.",
        {
            "fact": S,
            "category": {
                "type": "string",
                "enum": ["fact", "profile", "preference", "correction"],
            },
        },
        (),
        True,
    ),
    Tool("list_skills", "List saved skill names."),
    Tool("load_skill", "Load a skill's markdown.", {"name": S}, ("name",)),
    Tool(
        "save_skill",
        "Create or update a skill.",
        {"name": S, "content": S},
        ("name", "content"),
        True,
    ),
    Tool("delete_skill", "Delete a skill.", {"name": S}, ("name",), True),
    Tool("list_tools", "List agent tools (name, kind, enabled, source)."),
    Tool(
        "discover_capabilities",
        "Search the app's live API catalog by words and optional module tag.",
        {"query": S, "tag": S},
    ),
    Tool(
        "load_capability",
        "Load one discovered capability by id so it becomes a typed tool.",
        {"capability_id": S},
        ("capability_id",),
    ),
    Tool(
        "create_tool",
        "Create a new agent tool as a declarative spec (method+path+args). Never "
        "arbitrary code. "
        "HARD LIMIT: the spec can only call THIS app's own already-registered routes. "
        "`path` must start with /api/ and must match a route that already exists here — "
        "a path that merely looks plausible is rejected. There is no way to call a "
        "third-party or internet API, and no field anywhere for a base URL, API key, or "
        "token. So never ask the user for an endpoint URL, API key, or token: nothing "
        "can be done with one. If what they want needs an external service, say plainly "
        "that agent-created tools cannot reach outside this app and that it needs to be "
        "built into the backend instead. "
        "Prefer discover_capabilities + load_capability over this tool: that searches "
        "the app's live API catalog and turns a real route into a typed tool, so you "
        "never guess a path. Use create_tool only to combine or re-shape a route you "
        "have already confirmed exists.",
        {
            "name": S,
            "description": S,
            "kind": {"type": "string", "enum": ["read", "write"]},
            "spec": OBJECT,
        },
        ("name", "description", "kind", "spec"),
        True,
    ),
    Tool(
        "update_tool",
        "Update an existing agent-created tool's spec.",
        {"name": S, "spec": OBJECT},
        ("name", "spec"),
        True,
    ),
    Tool("enable_tool", "Enable a disabled agent tool.", {"name": S}, ("name",), True),
    Tool(
        "disable_tool", "Disable an agent tool without deleting it.", {"name": S}, ("name",), True
    ),
    Tool(
        "create_page",
        "Create a page with Tiptap JSON content.",
        {"title": S, "content": OBJECT},
        ("title", "content"),
        True,
    ),
    Tool(
        "update_page",
        "Replace a page's title and/or Tiptap JSON content wholesale — content you send "
        "here REPLACES everything the page currently has. For an in-place edit, annotation, "
        "checkbox change, or text added beside an existing item, first call get_page and "
        "return its complete document with only the requested changes; preserve every "
        "untouched block and attribute. Use append_page_content only when the user explicitly "
        "wants entirely new blocks added, never to re-add or annotate existing items.",
        {"id": S, "title": S, "content": OBJECT},
        ("id",),
        True,
    ),
    Tool(
        "append_page_content",
        "Add Tiptap block(s) to an existing page/note's content — the one existing "
        "content is left alone, only the new blocks are added, so there's no need to "
        "read the page first and reconstruct its full content. content is a list of "
        "Tiptap block nodes (e.g. a heading followed by a bulletList) — NOT a full "
        '{"type": "doc", ...} wrapper, just the blocks themselves. position: \'end\' '
        "(default) appends after existing content; 'start' inserts before it — use "
        "'start' for a running-log/journal-style note where the newest entry should "
        "read first. Do not use this tool to annotate, rewrite, check off, or add text "
        "beside existing blocks; use get_page then update_page for those edits. Prefer a "
        "page the user already has (search_pages/search_graph first) over creating a new "
        "one for a recurring note like a shopping list.",
        {
            "id": S,
            "content": {"type": "array", "items": OBJECT, "minItems": 1, "maxItems": 200},
            "position": {"type": "string", "enum": ["start", "end"]},
        },
        ("id", "content"),
        True,
    ),
    Tool(
        "create_event",
        "Create an event — the single entry point for any 'event + linked X' request. "
        "Always prefer its own options below over creating the linked item separately and "
        "then calling create_link; that older two/three-call pattern is redundant and "
        "loses defaults (title, folder, correct link relation) these options fill in for "
        "you. calendar_id, title, start_at and end_at are required — calendar_id must be a "
        "real id from list_calendars, never guessed. Other card fields, all optional: icon "
        "(a short emoji), location, link (a URL), all_day, reminder_minutes (minutes "
        "before start_at), and recurrence via rrule (DAILY/WEEKLY/MONTHLY/YEARLY) + "
        "recurrence_interval + recurrence_byday (e.g. ['MO','WE','FR']) + EITHER "
        "recurrence_count OR recurrence_until, never both. "
        "WORKOUT: pass workout_type to link a 'planned' (not yet started) workout session "
        "— the same fitness connection the calendar UI offers. workout_type is only a "
        "label (e.g. 'Legs', 'Push', 'Gym') and can't be empty, but it never pre-fills "
        "exercises: the linked session is ALWAYS created with zero exercises no matter "
        "which label you pick, ready for the user to choose exercises themselves at the "
        "gym. So when the user wants a workout linked with no plan/exercises decided yet, "
        "that's the default behavior — just pick any reasonable label yourself (their most "
        "recent workout type, or a generic one like 'Gym') instead of asking which type "
        "they mean; asking is never necessary here. Do not use log_workout_session for "
        "this: that always creates a completed session, not a plan the user can start "
        "later. "
        "MEAL: pass meal_type the same way, to link a 'planned' meal log with no "
        "calories/macros filled in yet — the linked meal is always created empty "
        "regardless of meal_type. Do not use log_food for this: that always creates an "
        "already-logged meal, not a plan. "
        "NOTE/PAGE: create the event first, then call create_event_note(event_id=...) — "
        "never create_page + create_link for this; create_event_note creates the page AND "
        "links it correctly (relation 'note') in one call, and reuses an existing linked "
        "note instead of duplicating it.",
        {
            "calendar_id": S,
            "title": S,
            "start_at": S,
            "end_at": S,
            "description": S,
            "icon": S,
            "location": S,
            "link": S,
            "all_day": {"type": "boolean"},
            "reminder_minutes": {"type": "integer", "minimum": 0, "maximum": 40_320},
            "rrule": {"type": "string", "enum": ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]},
            "recurrence_interval": {"type": "integer", "minimum": 1, "maximum": 365},
            "recurrence_byday": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": ["MO", "TU", "WE", "TH", "FR", "SA", "SU"],
                },
            },
            "recurrence_count": {"type": "integer", "minimum": 1, "maximum": 730},
            "recurrence_until": S,
            "workout_type": S,
            "meal_type": {"type": "string", "enum": ["breakfast", "lunch", "dinner", "snack"]},
        },
        ("calendar_id", "title", "start_at", "end_at"),
        True,
    ),
    Tool(
        "create_event_note",
        "Attach a page/note to an existing event, linked in one call — creates the page "
        "(in parent_page_id if given, else the top level) and links it to the event with "
        "relation 'note', exactly what the calendar UI's Notes toggle does. Use this "
        "instead of create_page + create_link whenever the user wants a note tied to an "
        "event. title defaults to the event's own title if omitted. If the event already "
        "has a linked note, that note is reused instead of creating a duplicate.",
        {"event_id": S, "title": S, "icon": S, "parent_page_id": S},
        ("event_id",),
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
        "Link two EXISTING items in the graph — pages, calendar events, meal logs, or "
        "workout sessions. Do not use this to attach a workout, meal, or note to an event "
        "you're creating right now — create_event's workout_type/meal_type params and the "
        "create_event_note tool do that in one call and set up the correct data too (not "
        "just a bare link). Reach for create_link only for two items that already exist "
        "independently (e.g. linking an existing page to an existing meal log). Set "
        "source_type/target_type explicitly whenever linking anything other than two "
        "pages.",
        {
            "source_id": S,
            "target_id": S,
            "source_type": {
                "type": "string",
                "enum": ["page", "event", "meal_log", "workout_session"],
            },
            "target_type": {
                "type": "string",
                "enum": ["page", "event", "meal_log", "workout_session"],
            },
            "relation": S,
        },
        ("source_id", "target_id"),
        True,
    ),
    Tool(
        "log_food",
        "Log a meal that already happened — this always creates it with status "
        "'logged'. To plan a future meal for the user to fill in later (e.g. linked to a "
        "calendar event), use create_event's meal_type param instead, not this tool. "
        "photo_file_ids: ids from an uploaded photo (see "
        "'[Photo attached — file_id=...]' in the user's message).",
        {
            "meal_type": {"type": "string", "enum": ["breakfast", "lunch", "dinner", "snack"]},
            "name": S,
            "calories": N,
            "date": S,
            "photo_file_ids": {"type": "array", "items": S},
        },
        ("meal_type", "name"),
        True,
    ),
    Tool(
        "log_workout_session",
        "Log a workout session that already happened — this always creates it with "
        "status 'completed'. To plan a future workout for the user to start later at the "
        "gym, use create_event's workout_type param instead, not this tool.",
        {"type": S, "notes": OBJECT, "date": S},
        ("type",),
        True,
    ),
    Tool(
        "analyze_meal_log_photo",
        "Run AI nutrition analysis on a meal log's attached photo(s) and fill in its "
        "calories/macros.",
        {"id": S},
        ("id",),
        True,
    ),
    Tool(
        "web_fetch",
        "Fetch a web page and return its readable text (title + body, HTML stripped). "
        "Only fetch a URL the user gave you directly, or one already present in their "
        "notes/pages/memory — there is no web search tool, so never guess, invent, or "
        "construct a URL yourself (e.g. a guessed 'willys.se/erbjudanden' is not a URL "
        "the user gave you; ask them for the link instead). Only http(s) URLs are "
        "fetched; requests to private/internal addresses are rejected. Long pages are "
        "truncated — if the answer isn't in what comes back, say so rather than "
        "guessing the rest. "
        "Plain fetch (fast, no browser) is the default — use it unless the page needs "
        "interaction first. Two ways to add interaction, both render the page in a real "
        "(slower, several seconds) headless browser: "
        "steps is an ordered list of one-off setup actions run before reading the page, "
        'each either {"click": "text"} (click the first element matching that text — '
        'e.g. to open a store/location picker) or {"type": "value", "into": '
        '"placeholder or label text"} (fill a field; omit into to use the first visible '
        "text/search box, e.g. right after a click opens one). Use this for 'select a "
        "store/location/filter, then read the page' flows. Many EU sites show a cookie-"
        "consent overlay on first load that blocks every other click underneath it until "
        "dismissed — if a click step seems to silently fail or later steps can't find "
        "their target, add a cookie-accept click as the FIRST step (its wording varies "
        "by site/language, e.g. 'Accept all'/'Acceptera alla cookies'). When a search "
        "result list can contain near-duplicate entries (e.g. 'Store X' and 'Store X "
        "Annex'), click a short fragment that's unique to the one you want — an address "
        "or street name is usually safer than the venue name alone, since the name alone "
        "may be a substring of another result and match the wrong one. Worked example — "
        "checking one grocery chain's offers for a specific store: "
        '[{"click": "Acceptera alla cookies"}, {"click": "Välj butik"}, {"type": "Lund", '
        '"into": "Sök efter din butik"}, {"click": "Magistratsvägen 22"}]. Max 10 steps. '
        "click_text (e.g. 'Show more', 'Visa fler') is separate: it clicks the first "
        "element matching that text repeatedly, up to max_clicks times (default 10, max "
        "20), for JS-paginated content — runs after steps, so combine both when a page "
        "needs a selection made first and then more results loaded.",
        {
            "url": S,
            "steps": {
                "type": "array",
                "maxItems": 10,
                "items": {
                    "type": "object",
                    "properties": {"click": S, "type": S, "into": S},
                    "additionalProperties": False,
                },
            },
            "click_text": S,
            "max_clicks": {"type": "integer", "minimum": 1, "maximum": 20},
        },
        ("url",),
        False,
    ),
    Tool(
        "willys_offers",
        "Look up current Willys (Swedish grocery) offers — every live campaign in their "
        "online range, with the offer price, the ordinary price, the saving, the "
        "comparison price, and whether a Willys Plus membership is required. Use this "
        "instead of web_fetch for anything about Willys prices or discounts; web_fetch "
        "truncates and cannot see all of them. "
        "Pass items to check a shopping list: give the item names exactly as the user "
        "wrote them, in whatever language — English items are translated to Swedish "
        "automatically ('cheese' finds Ost, 'sour cream' finds Gräddfil), so do NOT "
        "translate them yourself and do not drop items you think will not match. Pass "
        "the plain grocery word ('kaffe'), not a whole phrase ('2 paket kaffe till "
        "helgen'). You get back the matching offers per item, best match first, plus a "
        "no_offer list. "
        "This already searches every offer in the range — there is no 'show more' to "
        "click and nothing further to check, so never fall back to web_fetch for Willys "
        "and never report an item as having no offer unless it came back in no_offer. "
        "Each offer carries the product's category: use it to sanity-check a match "
        "before writing it down (an 'ost' hit in Djur is cat food, not cheese). "
        "Omit items to get the full offer list, capped and only useful for browsing or "
        "counting — prefer items whenever the user has something specific in mind. "
        "Offers cover the national online range and refresh weekly; results are cached, "
        "so calling this repeatedly in one conversation is cheap.",
        {
            "items": {"type": "array", "maxItems": 40, "items": S},
            "limit": {"type": "integer", "minimum": 1, "maximum": 60},
        },
        (),
        False,
    ),
]
BY_NAME = {tool.name: tool for tool in TOOLS}


def schemas() -> list[JSON]:
    return [tool.schema() for tool in TOOLS]


async def schemas_for(session: AsyncSession, user_id: str) -> tuple[list[JSON], dict[str, bool]]:
    """Hardcoded tool schemas + this user's enabled AITool specs, plus a name -> is_write
    map covering both (agent.py uses this instead of the static BY_NAME dispatch)."""
    from app.modules.ai import spec_tools

    await spec_tools.ensure_seeded(session, user_id)
    await memory.ensure_starter_skills(session, user_id)
    rows = list(
        (
            await session.execute(
                select(AITool).where(AITool.user_id == user_id, AITool.enabled.is_(True))
            )
        ).scalars()
    )
    is_write = {tool.name: tool.is_write for tool in TOOLS}
    result = schemas()
    web_fetch_enabled = await session.scalar(
        select(AISettings.web_fetch_enabled).where(AISettings.user_id == user_id)
    )
    if not web_fetch_enabled:
        result = [item for item in result if item["function"]["name"] != "web_fetch"]
        is_write.pop("web_fetch", None)
    willys_enabled = await session.scalar(
        select(AISettings.willys_offers_enabled).where(AISettings.user_id == user_id)
    )
    # `is None` means the user has no AISettings row yet; the column defaults to
    # true, so an absent row must not read as "disabled" the way `not None` would.
    if willys_enabled is False:
        result = [item for item in result if item["function"]["name"] != "willys_offers"]
        is_write.pop("willys_offers", None)
    for row in rows:
        spec_tool = spec_tools.to_tool(row)
        result.append(spec_tool.schema())
        is_write[spec_tool.name] = spec_tool.is_write
    return result, is_write


async def risk_for(name: str, session: AsyncSession, user_id: str) -> str:
    if name in {"remember", "save_skill", "delete_skill", "load_capability"}:
        return "low"
    if name in {
        "create_page",
        "create_event",
        "create_event_note",
        "create_link",
        "log_food",
        "log_workout_session",
    }:
        return "low"
    row = (
        await session.execute(select(AITool).where(AITool.user_id == user_id, AITool.name == name))
    ).scalar_one_or_none()
    if row and row.source == "openapi":
        from app.modules.ai import capabilities

        item = capabilities.find(str(row.spec["capability_id"]))
        return str(item["risk"]) if item else "forbidden"
    return "ordinary"


async def secure_fields_for(name: str, session: AsyncSession, user_id: str) -> list[str]:
    row = await session.scalar(select(AITool).where(AITool.user_id == user_id, AITool.name == name))
    if row and row.source == "openapi":
        from app.modules.ai import capabilities

        return list(capabilities.tool_schema(str(row.spec["capability_id"]))["secure_fields"])
    return []


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
    if name == "list_calendars":
        return "GET", "/api/calendars", None
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
    if name == "append_page_content":
        return (
            "POST",
            f"/api/pages/{a['id']}/append",
            {k: v for k, v in a.items() if k != "id"},
        )
    if name == "create_event":
        body = {k: v for k, v in a.items() if k not in {"workout_type", "meal_type"}}
        connections: JSON = {}
        if a.get("workout_type"):
            connections["fitness"] = {"workout_type": a["workout_type"]}
        if a.get("meal_type"):
            connections["food"] = {"meal_type": a["meal_type"]}
        if connections:
            body["connections"] = connections
        return "POST", "/api/events", body
    if name == "create_event_note":
        return (
            "POST",
            f"/api/events/{a['event_id']}/note",
            {k: v for k, v in a.items() if k != "event_id"},
        )
    if name == "update_event":
        return "PATCH", f"/api/events/{a['id']}", {k: v for k, v in a.items() if k != "id"}
    if name == "delete_event":
        return "DELETE", f"/api/events/{a['id']}", None
    if name == "create_link":
        return (
            "POST",
            "/api/links",
            {
                "source_type": a.get("source_type") or "page",
                "source_id": a["source_id"],
                "target_type": a.get("target_type") or "page",
                "target_id": a["target_id"],
                "relation": a.get("relation") or "related",
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
                "photo_file_ids": a.get("photo_file_ids") or [],
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
    if name == "analyze_meal_log_photo":
        return "POST", f"/api/food/logs/{a['id']}/analyze", None
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


def _entity_label(item: dict[str, Any]) -> str:
    """Name/title + id — the model needs the real id for any follow-up tool call
    (update/delete/link), so it must never be dropped from what the model reads back."""
    name = item.get("title") or item.get("name")
    item_id = item.get("id")
    if name and item_id:
        return f"{name} ({item_id})"
    return str(name or item_id or "?")


def _summarize(data: Any) -> str:
    """Human-readable stand-in for the raw `str(data)` Python dump."""
    if isinstance(data, list):
        if not data:
            return "No results."
        if isinstance(data[0], dict):
            labels = [_entity_label(item) for item in data[:3]]
            more = f" and {len(data) - 3} more" if len(data) > 3 else ""
            return f"{len(data)} result(s): {', '.join(labels)}{more}"
        labels = [str(item) for item in data[:5]]
        more = f" and {len(data) - 5} more" if len(data) > 5 else ""
        return f"{len(data)} result(s): {', '.join(labels)}{more}" if labels else "No results."
    if isinstance(data, dict):
        if data.get("title") or data.get("name") or data.get("id"):
            return _entity_label(data)
        return f"Done ({len(data)} field(s))."
    if data is None:
        return "Done."
    return str(data)[:200]


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
    return True, data, _summarize(data)


async def execute(name: str, args: JSON, session: AsyncSession | None, user_id: str) -> JSON:
    if name not in BY_NAME:
        assert session is not None
        from app.modules.ai import spec_tools

        spec_row = (
            await session.execute(
                select(AITool).where(
                    AITool.user_id == user_id, AITool.name == name, AITool.enabled.is_(True)
                )
            )
        ).scalar_one_or_none()
        if spec_row is None:
            return {"ok": False, "summary": f"Unknown tool: {name}"}
        ok, data, summary = await spec_tools.execute(spec_row, args, user_id)
        return {"ok": ok, "data": data, "summary": summary}
    if name == "get_today":
        now = datetime.now(UTC)
        data = {"date": now.date().isoformat(), "weekday": now.strftime("%A")}
        return {"ok": True, "data": data, "summary": f"{data['weekday']} {data['date']}"}
    if name == "search_graph":
        assert session is not None
        from app.modules.ai import search as graph_search

        data = await graph_search.search(
            session, user_id, str(args["query"]), int(args.get("limit") or 10)
        )
        return {"ok": True, "data": data, "summary": str(data)[:8000]}
    if name == "discover_capabilities":
        from app.modules.ai import capabilities

        data = capabilities.search(str(args.get("query") or ""), str(args.get("tag") or ""))
        return {"ok": True, "data": data, "summary": str(data)[:4000]}
    if name == "load_capability":
        assert session is not None
        from app.modules.ai import capabilities

        item = capabilities.find(str(args["capability_id"]))
        if item is None:
            return {"ok": False, "summary": "Capability not found"}
        if item["risk"] in {"forbidden", "unsupported"}:
            return {"ok": False, "summary": f"Capability is {item['risk']}"}
        generated = capabilities.tool_schema(item["id"])
        row = (
            await session.execute(
                select(AITool).where(AITool.user_id == user_id, AITool.name == generated["name"])
            )
        ).scalar_one_or_none()
        if row is None:
            row = AITool(
                user_id=user_id,
                name=generated["name"],
                description=generated["description"],
                kind="read" if item["risk"] == "read" else "write",
                spec={"capability_id": item["id"]},
                enabled=True,
                source="openapi",
            )
            session.add(row)
        else:
            row.enabled = True
        await session.commit()
        return {"ok": True, "summary": f"Loaded {generated['name']}."}
    if name == "remember":
        assert session is not None
        category = str(args.get("category") or "fact")
        return {
            "ok": True,
            "summary": await memory.remember(session, user_id, str(args["fact"]), category),
        }
    if name == "recall":
        assert session is not None
        rows = await memory.recall(session, user_id)
        return {"ok": True, "data": rows, "summary": _summarize(rows)}
    if name == "profile":
        assert session is not None
        text = await memory.profile(session, user_id)
        return {"ok": True, "data": text, "summary": text[:500]}
    if name == "forget":
        assert session is not None
        fact_arg = args.get("fact")
        category_arg = args.get("category")
        if not fact_arg and not category_arg:
            return {"ok": False, "summary": "Give either a fact or a category to forget."}
        summary = await memory.forget(
            session,
            user_id,
            str(fact_arg) if fact_arg else None,
            str(category_arg) if category_arg else None,
        )
        return {"ok": True, "summary": summary}
    if name in {"list_tools", "create_tool", "update_tool", "enable_tool", "disable_tool"}:
        assert session is not None
        from app.modules.ai import spec_tools

        if name == "list_tools":
            tool_rows = list(
                (await session.execute(select(AITool).where(AITool.user_id == user_id))).scalars()
            )
            data = [
                {"name": r.name, "kind": r.kind, "enabled": r.enabled, "source": r.source}
                for r in tool_rows
            ]
            return {"ok": True, "data": data, "summary": _summarize(data)}
        if name in {"create_tool", "update_tool"}:
            error = spec_tools.validate_spec(args.get("spec") or {})
            if error:
                return {"ok": False, "summary": f"Invalid spec: {error}"}
        if name == "create_tool":
            new_tool = AITool(
                user_id=user_id,
                name=str(args["name"]),
                description=str(args["description"]),
                kind=str(args["kind"]),
                spec=args["spec"],
                enabled=True,
                source="agent",
            )
            session.add(new_tool)
            await session.commit()
            await session.refresh(new_tool)
            return {
                "ok": True,
                "data": {"id": new_tool.id, "name": new_tool.name},
                "summary": f"Tool '{new_tool.name}' created.",
            }
        target = (
            await session.execute(
                select(AITool).where(AITool.user_id == user_id, AITool.name == str(args["name"]))
            )
        ).scalar_one_or_none()
        if target is None:
            return {"ok": False, "summary": f"Tool '{args['name']}' not found"}
        if name == "update_tool":
            target.spec = args["spec"]
            await session.commit()
            return {"ok": True, "summary": f"Tool '{target.name}' updated."}
        target.enabled = name == "enable_tool"
        await session.commit()
        state = "enabled" if target.enabled else "disabled"
        return {"ok": True, "summary": f"Tool '{target.name}' {state}."}
    if name in {"list_skills", "load_skill", "save_skill", "delete_skill"}:
        assert session is not None
        if name == "list_skills":
            rows = list(
                (
                    await session.execute(
                        select(AISkill.name).where(
                            AISkill.user_id == user_id, AISkill.enabled.is_(True)
                        )
                    )
                ).scalars()
            )
            return {"ok": True, "data": rows, "summary": _summarize(rows)}
        if name == "load_skill":
            skill_content = (
                await session.execute(
                    select(AISkill.content).where(
                        AISkill.user_id == user_id,
                        AISkill.name == str(args["name"]),
                        AISkill.enabled.is_(True),
                    )
                )
            ).scalar_one_or_none()
            return {
                "ok": skill_content is not None,
                "data": skill_content,
                "summary": (skill_content or "Skill not found")[:500],
                # Keep chips compact while giving the model the complete procedure.
                "model_content": skill_content or "Skill not found",
            }
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
    if name == "web_fetch":
        assert session is not None
        from app.modules.ai import web

        web_fetch_enabled = await session.scalar(
            select(AISettings.web_fetch_enabled).where(AISettings.user_id == user_id)
        )
        if not web_fetch_enabled:
            return {"ok": False, "summary": "web_fetch is disabled in AI settings."}
        try:
            if args.get("click_text") or args.get("steps"):
                data = await web.fetch_dynamic(
                    str(args["url"]),
                    steps=list(args.get("steps") or []),
                    click_text=str(args["click_text"]) if args.get("click_text") else None,
                    max_clicks=int(args.get("max_clicks") or 10),
                )
            else:
                data = await web.fetch(str(args["url"]))
        except web.FetchError as exc:
            return {"ok": False, "summary": str(exc)}
        title = f"{data['title']} — " if data["title"] else ""
        return {
            "ok": True,
            "data": data,
            "summary": f"{title}{data['url']}\n{data['text']}"[:8000],
        }
    if name == "willys_offers":
        assert session is not None
        from app.modules.ai import willys

        willys_enabled = await session.scalar(
            select(AISettings.willys_offers_enabled).where(AISettings.user_id == user_id)
        )
        if willys_enabled is False:
            return {"ok": False, "summary": "willys_offers is disabled in AI settings."}
        try:
            offers = await willys.all_offers()
        except (willys.WillysError, httpx.HTTPError) as exc:
            return {"ok": False, "summary": f"Could not read Willys offers: {exc}"}
        items = [str(item) for item in (args.get("items") or []) if str(item).strip()]
        if items:
            matched = willys.match(offers, items)
            found = sum(len(group["offers"]) for group in matched)
            missing = [item for item in items if item not in {g["item"] for g in matched}]
            willys_data: JSON = {"matches": matched, "no_offer": missing}
            summary = (
                f"{found} offer(s) matching {len(matched)} of {len(items)} item(s)."
                if matched
                else f"No current Willys offers match: {', '.join(items)}."
            )
        else:
            # The full list is ~800 offers; capped so it cannot swamp the reply.
            limit = int(args.get("limit") or 40)
            willys_data = {"offers": offers[:limit], "total": len(offers)}
            summary = f"{len(offers)} current Willys offers (showing {min(limit, len(offers))})."
        return {
            "ok": True,
            "data": willys_data,
            "summary": summary,
            "model_content": json.dumps(willys_data, ensure_ascii=False, separators=(",", ":")),
        }

    ok, data, summary = await _call(name, args, user_id)
    if ok and name == "search_pages" and isinstance(data, list):
        # /api/search intentionally returns pages and events for the app-wide picker,
        # but this agent tool promises page ids. Event ids sent to get_page caused the
        # repeated 404/search loop visible in the grocery-list transcript.
        data = [item for item in data if isinstance(item, dict) and item.get("type") == "page"]
        summary = _summarize(data)
    if ok and name == "create_page" and isinstance(data, dict) and args.get("content") is not None:
        ok, data, summary = await _call(
            "update_page", {"id": data["id"], "content": args["content"]}, user_id
        )
    if ok and name == "create_event" and isinstance(data, dict) and session is not None:
        event = await session.get(CalendarEvent, data["id"])
        if event is not None:
            event.created_by = "ai_assistant"
            await session.commit()
    result = {"ok": ok, "data": data, "summary": summary}
    if ok and name == "get_page":
        # `summary` remains concise for the UI tool chip. The provider needs the full
        # page JSON, otherwise it sees only "Title (id)" and mistakes a search snippet
        # for the complete note.
        result["model_content"] = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return result


async def preimage(tool: str, args: JSON, session: AsyncSession, user_id: str) -> JSON | None:
    read_name = {
        "update_page": "get_page",
        "append_page_content": "get_page",
        "update_event": None,
        "delete_event": None,
    }.get(tool)
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
    if tool == "create_event_note" and isinstance(result, dict):
        return await _delete_page(result["id"], user_id)
    if tool == "create_link" and isinstance(result, dict):
        return await _delete_path(f"/api/links/{result['id']}", user_id)
    if tool == "log_food" and isinstance(result, dict):
        return await _delete_path(f"/api/food/logs/{result['id']}", user_id)
    if tool == "log_workout_session" and isinstance(result, dict):
        return await _delete_path(f"/api/fitness/sessions/{result['id']}", user_id)
    if tool == "create_tool" and isinstance(result, dict) and result.get("id"):
        existing_tool = (
            await session.execute(
                select(AITool).where(AITool.id == result["id"], AITool.user_id == user_id)
            )
        ).scalar_one_or_none()
        if existing_tool is None:
            return False, None, "Tool already removed"
        await session.delete(existing_tool)
        await session.commit()
        return True, None, "Tool deleted"
    if tool in {"update_page", "append_page_content"} and isinstance(before, dict):
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
    if tool not in BY_NAME:
        from app.modules.ai import spec_tools

        spec_row = (
            await session.execute(
                select(AITool).where(AITool.user_id == user_id, AITool.name == tool)
            )
        ).scalar_one_or_none()
        if spec_row is not None:
            return await spec_tools.undo(spec_row, payload, user_id)
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
    return True, data, _summarize(data)
