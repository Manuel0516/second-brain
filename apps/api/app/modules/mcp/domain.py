"""MCP adapters over existing memories, Pages, calendar and fitness services.

Stored content is data. It never selects a tool, scope, identity or approval.
"""

import hashlib
import json
import re
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AIAction, AIConversation, AIMemory, AIMessage, Page, SetEntry, User
from app.modules.ai import memory, search
from app.modules.mcp import schemas as s
from app.routes import calendar, fitness

STOCKHOLM = ZoneInfo("Europe/Stockholm")
JSON = dict[str, Any]


def document(content: str) -> JSON:
    return {
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": content}]}],
    }


def memory_result(row: AIMemory) -> JSON:
    return {
        "id": row.id,
        "content": row.fact,
        "category": row.category,
        "created_at": row.created_at.isoformat(),
        "metadata": {},
    }


async def owned_memory(db: AsyncSession, user: User, id: str) -> AIMemory:
    row = await db.scalar(select(AIMemory).where(AIMemory.id == id, AIMemory.user_id == user.id))
    if row is None:
        raise HTTPException(404, "Memory not found")
    return row


async def records(db: AsyncSession, user: User, kind: str) -> list[Page]:
    return list(
        (
            await db.scalars(
                select(Page)
                .where(
                    Page.user_id == user.id,
                    Page.deleted_at.is_(None),
                    Page.properties["second_brain_kind"].as_string() == kind,
                )
                .order_by(Page.created_at)
                .limit(501)
            )
        ).all()
    )


async def owned_record(db: AsyncSession, user: User, id: str, kind: str) -> Page:
    row = await db.scalar(
        select(Page).where(
            Page.id == id,
            Page.user_id == user.id,
            Page.deleted_at.is_(None),
            Page.properties["second_brain_kind"].as_string() == kind,
        )
    )
    if row is None:
        raise HTTPException(404, "Record not found")
    return row


def record_result(row: Page) -> JSON:
    return {"id": row.id, "title": row.title, **row.properties}


async def add_record(db: AsyncSession, user: User, kind: str, title: str, values: JSON) -> Page:
    # ponytail: reuse visible Pages until dedicated organization modules exist.
    row = Page(
        user_id=user.id,
        title=title,
        content=document(json.dumps(values, ensure_ascii=False)),
        properties={"second_brain_kind": kind, "created_by": "ai_assistant", **values},
    )
    db.add(row)
    await db.flush()
    return row


def day_bounds(day: date) -> tuple[datetime, datetime]:
    # Wall-clock midnights preserve 23/25-hour days at DST transitions.
    return (
        datetime.combine(day, time.min, STOCKHOLM),
        datetime.combine(day + timedelta(days=1), time.min, STOCKHOLM),
    )


async def events(db: AsyncSession, user: User, span: s.DateRange) -> list[JSON]:
    start, _ = day_bounds(span.start)
    _, end = day_bounds(span.end)
    rows = await calendar.get_events(start, end, None, user, db)
    return [
        {
            "id": row.id,
            "title": row.title,
            "start_at": row.start_at.isoformat(),
            "end_at": row.end_at.isoformat(),
            "all_day": row.all_day,
            "calendar_id": row.calendar_id,
        }
        for row in rows
    ]


async def tasks(db: AsyncSession, user: User, span: s.DateRange) -> JSON:
    rows = await records(db, user, "task")
    matches = []
    for row in rows[:500]:
        due = row.properties.get("due_date")
        if not row.properties.get("completed") and isinstance(due, str):
            day = datetime.fromisoformat(due).astimezone(STOCKHOLM).date()
            if span.start <= day <= span.end:
                matches.append(record_result(row))
    return {
        "tasks": matches[:100],
        "truncated": len(rows) > 500 or len(matches) > 100,
        "unscheduled_tasks_omitted": True,
    }


async def daily(db: AsyncSession, user: User, span: s.DateRange) -> JSON:
    plans = [
        record_result(row)
        for row in await records(db, user, "daily_plan")
        if span.start.isoformat() <= str(row.properties.get("date")) <= span.end.isoformat()
    ]
    calendar_rows = await events(db, user, span)
    return {
        "timezone": "Europe/Stockholm",
        "calendar": calendar_rows[:200],
        "calendar_truncated": len(calendar_rows) > 200,
        **await tasks(db, user, span),
        "plans": plans[:100],
    }


async def proposals(db: AsyncSession, user: User, name: str, args: JSON) -> JSON:
    validated = (
        s.WRITE_INPUTS[name].model_validate(args).model_dump(mode="json", exclude_unset=True)
    )
    conversation = AIConversation(user_id=user.id, title=f"ChatGPT: {name}")
    db.add(conversation)
    await db.flush()
    call_id = str(uuid4())
    action = AIAction(
        user_id=user.id,
        conversation_id=conversation.id,
        tool=f"mcp_{name}",
        action=name.split("_")[0],
        origin="mcp",
        status="pending",
        preview={"call_id": call_id, "args": validated},
        risk_level="high_risk" if name == "remove_grocery_item" else "ordinary",
    )
    db.add(action)
    db.add(
        AIMessage(
            conversation_id=conversation.id,
            role="assistant",
            content=f"ChatGPT proposes {name}. Review the full arguments before approving.",
            status="awaiting_confirmation",
            tool_calls=[
                {
                    "id": call_id,
                    "type": "function",
                    "function": {"name": f"mcp_{name}", "arguments": json.dumps(validated)},
                }
            ],
        )
    )
    await db.commit()
    return {
        "ok": True,
        "status": "pending_confirmation",
        "action_id": action.id,
        "conversation_id": conversation.id,
        "preview": validated,
        "next_step": "Open this conversation in Second Brain Assistant and approve or reject. "
        "No domain data has changed. Use get_action_status after approval.",
    }


async def validate_plan(db: AsyncSession, user: User, payload: s.DailyPlan) -> None:
    existing = await events(db, user, s.DateRange(start=payload.date, end=payload.date))
    for plan in await records(db, user, "daily_plan"):
        if plan.properties.get("date") == payload.date.isoformat():
            raise HTTPException(409, "A daily plan already exists for this date")
    activities = sorted(payload.activities, key=lambda item: item.start_at)
    _, day_end = day_bounds(payload.date)
    for index, item in enumerate(activities):
        if item.start_at.astimezone(STOCKHOLM).date() != payload.date or item.end_at > day_end:
            raise HTTPException(422, "Activities must fit within the Stockholm plan date")
        if index and activities[index - 1].end_at > item.start_at:
            raise HTTPException(409, "Activities overlap")
        if any(
            datetime.fromisoformat(event["start_at"]) < item.end_at
            and datetime.fromisoformat(event["end_at"]) > item.start_at
            for event in existing
        ):
            raise HTTPException(409, "Activity conflicts with an existing calendar occurrence")


async def apply_write(name: str, args: JSON, db: AsyncSession, user: User) -> JSON:
    """Execute only from the authenticated application approval flow."""
    payload = s.WRITE_INPUTS[name].model_validate(args)
    # Serialize MCP writes for one owner, including duplicate/overlap checks.
    if db.get_bind().dialect.name == "postgresql":
        key = int.from_bytes(hashlib.sha256(user.id.encode()).digest()[:8], signed=True)
        await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})
    result: JSON
    if isinstance(payload, s.MemoryCreate):
        await memory.remember(db, user.id, payload.content, payload.category, commit=False)
        normalized = re.sub(r"\s+", " ", payload.content.strip().casefold())
        key_text = hashlib.sha256(f"{payload.category}:{normalized}".encode()).hexdigest()
        row = await db.scalar(
            select(AIMemory).where(AIMemory.user_id == user.id, AIMemory.normalized_key == key_text)
        )
        assert row is not None
        result = memory_result(row)
    elif isinstance(payload, s.MemoryUpdate):
        row = await owned_memory(db, user, str(payload.id))
        if payload.changes.content is not None:
            row.fact = payload.changes.content
        if payload.changes.category is not None:
            row.category = payload.changes.category
        normalized = re.sub(r"\s+", " ", row.fact.strip().casefold())
        normalized_key = hashlib.sha256(f"{row.category}:{normalized}".encode()).hexdigest()
        duplicate = await db.scalar(
            select(AIMemory.id).where(
                AIMemory.user_id == user.id,
                AIMemory.id != row.id,
                AIMemory.normalized_key == normalized_key,
            )
        )
        if duplicate:
            raise HTTPException(409, "Memory already exists")
        row.normalized_key = normalized_key
        result = memory_result(row)
    elif isinstance(payload, s.TaskCreate):
        values = payload.model_dump(mode="json")
        values["completed"] = False
        result = record_result(await add_record(db, user, "task", payload.title, values))
    elif isinstance(payload, s.TaskUpdate) or (
        isinstance(payload, s.Identifier) and name == "complete_task"
    ):
        page = await owned_record(db, user, str(payload.id), "task")
        changes = (
            payload.changes.model_dump(mode="json", exclude_unset=True)
            if isinstance(payload, s.TaskUpdate)
            else {"completed": True}
        )
        if changes.get("title") is not None:
            page.title = str(changes["title"])
        values = {**page.properties, **changes}
        page.properties, page.content = values, document(json.dumps(values))
        result = record_result(page)
    elif isinstance(payload, s.DailyPlan):
        await validate_plan(db, user, payload)
        result = record_result(
            await add_record(
                db, user, "daily_plan", f"Plan: {payload.date}", payload.model_dump(mode="json")
            )
        )
    elif isinstance(payload, s.GroceryCreate):
        normalized = " ".join(payload.name.casefold().split())
        matches = [
            row
            for row in await records(db, user, "grocery")
            if " ".join(row.title.casefold().split()) == normalized
        ]
        if matches:
            page = matches[0]
            previous = s.Quantity.model_validate(page.properties["quantity"])
            if previous.unit.casefold() != payload.quantity.unit.casefold():
                raise HTTPException(409, "Item exists with another unit; update it explicitly")
            quantity = s.Quantity(
                amount=previous.amount + payload.quantity.amount, unit=previous.unit
            )
            page.properties = {**page.properties, "quantity": quantity.model_dump()}
            page.content = document(json.dumps(page.properties))
            result = record_result(page)
        else:
            result = record_result(
                await add_record(db, user, "grocery", payload.name, payload.model_dump(mode="json"))
            )
    elif isinstance(payload, s.GroceryUpdate) or (
        isinstance(payload, s.Identifier) and name == "remove_grocery_item"
    ):
        page = await owned_record(db, user, str(payload.id), "grocery")
        if isinstance(payload, s.GroceryUpdate):
            changes = payload.changes.model_dump(mode="json", exclude_unset=True)
            if changes.get("name"):
                if any(
                    row.id != page.id and row.title.casefold() == str(changes["name"]).casefold()
                    for row in await records(db, user, "grocery")
                ):
                    raise HTTPException(409, "Grocery item already exists")
                page.title = str(changes["name"])
            page.properties = {**page.properties, **changes}
            page.content = document(json.dumps(page.properties))
        else:
            page.deleted_at = datetime.now(UTC)  # Uses the existing Notes trash/restore flow.
        result = record_result(page)
    elif isinstance(payload, s.WorkoutCreate):
        for entry in payload.exercises:
            await fitness._owned_exercise(str(entry.exercise_id), user, db)
        session = await fitness.build_workout_session(
            fitness.SessionCreate(date=payload.date, type=payload.type), user, db
        )
        for entry in payload.exercises:
            db.add(SetEntry(workout_session_id=session.id, **entry.model_dump(mode="json")))
        result = {
            "id": session.id,
            "date": payload.date.isoformat(),
            "sets": len(payload.exercises),
        }
    elif isinstance(payload, s.WorkoutUpdate):
        session = await fitness._owned_workout_session(str(payload.id), user, db)
        for field_name, value in payload.changes.model_dump(exclude_unset=True).items():
            setattr(session, field_name, value)
        result = {"id": session.id}
    elif isinstance(payload, s.NoteCreate):
        page = Page(user_id=user.id, title=payload.title, content=document(payload.content))
        db.add(page)
        await db.flush()
        result = {"id": page.id, "title": page.title}
    else:
        raise HTTPException(422, "Unsupported operation")
    await db.flush()
    return {"ok": True, "data": result, "summary": f"Applied {name}."}


async def execute_approved(name: str, args: JSON, db: AsyncSession, user_id: str) -> JSON:
    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(401, "Inactive account")
    return await apply_write(name.removeprefix("mcp_"), args, db, user)


async def memory_search(
    db: AsyncSession, user: User, query: str, filters: s.MemoryFilters, limit: int
) -> list[JSON]:
    return await search.search(db, user.id, query, limit, {"memory"}, filters.category)
