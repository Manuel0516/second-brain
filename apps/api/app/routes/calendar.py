from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Response,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from pydantic import BaseModel, EmailStr, Field, HttpUrl, field_validator, model_validator
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.access import effective_role, shared_ids
from app.collaboration import calendar_connections
from app.database import async_session_factory, get_async_session
from app.dependencies import get_current_user, get_websocket_user
from app.models import Calendar, CalendarEvent, Link, MealLog, ResourceShare, User, WorkoutSession

router = APIRouter(prefix="/api", tags=["calendar"])
HEX = r"^#[0-9A-Fa-f]{6}$"
CURRENCY = r"^[A-Z]{3}$"

Frequency = Literal["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]
Weekday = Literal["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
WEEKDAY_INDEX = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}


class CalendarWrite(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    color: str = Field(pattern=HEX)

    @field_validator("name")
    @classmethod
    def non_empty_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("name must not be blank")
        return value.strip()


class CalendarPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    color: str | None = Field(default=None, pattern=HEX)
    is_visible: bool | None = None

    @field_validator("name")
    @classmethod
    def non_empty_name(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("name must not be blank")
        return value.strip() if value is not None else None


class CalendarResponse(BaseModel):
    id: str
    name: str
    color: str
    is_visible: bool
    source: str
    sync_direction: str = "pull"
    ics_url: str | None = None
    google_calendar_id: str | None = None
    last_synced_at: datetime | None = None
    effective_role: Literal["owner", "editor", "viewer"] = "owner"
    owner_email: str | None = None
    collaborators: list["CollaboratorResponse"] = []


class CollaboratorResponse(BaseModel):
    user_id: str
    email: str
    role: Literal["viewer", "editor"]


class ShareWrite(BaseModel):
    email: EmailStr
    role: Literal["viewer", "editor"]


class SharePatch(BaseModel):
    role: Literal["viewer", "editor"]


class SelfSharePatch(BaseModel):
    """A recipient's own visibility/color override for a shared calendar."""

    visible: bool | None = None
    color: str | None = Field(default=None, pattern=HEX)


class NoteConnection(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    folder_id: str | None = None
    link_ids: list[str] = Field(default_factory=list, max_length=50)


class FinanceConnection(BaseModel):
    type: Literal["income", "expense"] = "expense"
    amount: float = Field(gt=0)
    currency: str = Field(default="SEK", pattern=CURRENCY)
    category: str = Field(min_length=1, max_length=100)
    counterparty: str | None = Field(default=None, max_length=255)
    tax_relevant: bool = False


class FitnessConnection(BaseModel):
    workout_type: str = Field(min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=10_000)


class FoodConnection(BaseModel):
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"] = "lunch"
    notes: str | None = Field(default=None, max_length=10_000)


class EventConnections(BaseModel):
    notes: NoteConnection | None = None
    finance: FinanceConnection | None = None
    fitness: FitnessConnection | None = None
    food: FoodConnection | None = None


class EventWrite(BaseModel):
    calendar_id: str
    title: str = Field(min_length=1, max_length=255)
    icon: str | None = Field(default=None, max_length=32)
    description: str | None = Field(default=None, max_length=100_000)
    location: str | None = Field(default=None, max_length=255)
    link: HttpUrl | None = None
    start_at: datetime
    end_at: datetime
    all_day: bool = False
    timezone: str = Field(default="Europe/Stockholm", min_length=1, max_length=63)
    color_override: str | None = Field(default=None, pattern=HEX)
    reminder_minutes: int | None = Field(default=None, ge=0, le=40_320)
    rrule: Frequency | None = None
    recurrence_interval: int = Field(default=1, ge=1, le=365)
    recurrence_byday: list[Weekday] = Field(default_factory=list)
    recurrence_count: int | None = Field(default=None, ge=1, le=730)
    recurrence_until: datetime | None = None
    connections: EventConnections = Field(default_factory=EventConnections)

    @field_validator("title")
    @classmethod
    def non_empty_title(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("title must not be blank")
        return value.strip()

    @model_validator(mode="after")
    def valid_range(self) -> "EventWrite":
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be after start_at")
        if self.recurrence_count is not None and self.recurrence_until is not None:
            raise ValueError("recurrence_count and recurrence_until are mutually exclusive")
        return self


class EventPatch(BaseModel):
    calendar_id: str | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    icon: str | None = Field(default=None, max_length=32)
    description: str | None = Field(default=None, max_length=100_000)
    location: str | None = Field(default=None, max_length=255)
    link: HttpUrl | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    all_day: bool | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=63)
    color_override: str | None = Field(default=None, pattern=HEX)
    reminder_minutes: int | None = Field(default=None, ge=0, le=40_320)
    rrule: Frequency | None = None
    recurrence_interval: int | None = Field(default=None, ge=1, le=365)
    recurrence_byday: list[Weekday] | None = None
    recurrence_count: int | None = Field(default=None, ge=1, le=730)
    recurrence_until: datetime | None = None
    connections: EventConnections | None = None
    # Recurrence edit scope. "this" creates a single-occurrence override and
    # leaves the rest of the series intact; "all" edits the whole series.
    scope: Literal["all", "this"] = "all"
    occurrence_start: datetime | None = None

    @field_validator("title")
    @classmethod
    def non_empty_title(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("title must not be blank")
        return value.strip() if value is not None else None


class EventResponse(BaseModel):
    id: str
    calendar_id: str
    title: str
    icon: str | None
    description: str | None
    location: str | None
    link: str | None
    start_at: datetime
    end_at: datetime
    all_day: bool
    timezone: str
    color_override: str | None
    reminder_minutes: int | None
    rrule: str | None
    recurrence_interval: int
    recurrence_byday: list[str]
    recurrence_count: int | None
    recurrence_until: datetime | None
    connections: EventConnections


class EventMove(BaseModel):
    id: str
    original_start_at: datetime
    start_at: datetime
    end_at: datetime

    @model_validator(mode="after")
    def valid_range(self) -> "EventMove":
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be after start_at")
        return self


class BulkEventMove(BaseModel):
    events: list[EventMove] = Field(min_length=1, max_length=100)


class BulkEventCopy(BaseModel):
    event_ids: list[str] = Field(min_length=1, max_length=100)
    target_start: datetime


def _own_share_overrides(
    calendar: Calendar, user: User, share: ResourceShare | None
) -> tuple[bool, str]:
    """A shared calendar's visibility/color can be overridden per-recipient
    (ResourceShare.visible/.color) without touching the owner's Calendar row.
    Falls back to the owner's values when there's no override, or none set."""
    if calendar.user_id == user.id or share is None:
        return calendar.is_visible, calendar.color
    is_visible = share.visible if share.visible is not None else calendar.is_visible
    color = share.color if share.color is not None else calendar.color
    return is_visible, color


async def calendar_response(
    calendar: Calendar, user: User, session: AsyncSession
) -> CalendarResponse:
    role = await effective_role("calendar", calendar.id, calendar.user_id, user.id, session)
    assert role is not None
    owner_email = await session.scalar(select(User.email).where(User.id == calendar.user_id))
    collaborators: list[CollaboratorResponse] = []
    own_share: ResourceShare | None = None
    if role == "owner":
        rows = await session.execute(
            select(ResourceShare, User)
            .join(User, User.id == ResourceShare.recipient_user_id)
            .where(
                ResourceShare.resource_type == "calendar",
                ResourceShare.resource_id == calendar.id,
            )
            .order_by(User.email)
        )
        collaborators = [
            CollaboratorResponse(user_id=recipient.id, email=recipient.email, role=share.role)
            for share, recipient in rows
        ]
    else:
        own_share = await session.scalar(
            select(ResourceShare).where(
                ResourceShare.resource_type == "calendar",
                ResourceShare.resource_id == calendar.id,
                ResourceShare.recipient_user_id == user.id,
            )
        )
    is_visible, color = _own_share_overrides(calendar, user, own_share)
    return CalendarResponse(
        id=calendar.id,
        name=calendar.name,
        color=color,
        is_visible=is_visible,
        source=calendar.source,
        sync_direction=calendar.sync_direction,
        ics_url=calendar.ics_url,
        google_calendar_id=calendar.google_calendar_id,
        last_synced_at=calendar.last_synced_at,
        effective_role=role,
        owner_email=owner_email,
        collaborators=collaborators,
    )


def event_response(
    event: CalendarEvent, start: datetime | None = None, end: datetime | None = None
) -> EventResponse:
    return EventResponse(
        id=event.id,
        calendar_id=event.calendar_id,
        title=event.title,
        icon=event.icon,
        description=event.description,
        location=event.location,
        link=event.link,
        start_at=start or event.start_at,
        end_at=end or event.end_at,
        all_day=event.all_day,
        timezone=event.timezone,
        color_override=event.color_override,
        reminder_minutes=event.reminder_minutes,
        rrule=event.rrule,
        recurrence_interval=event.recurrence_interval or 1,
        recurrence_byday=list(event.recurrence_byday or []),
        recurrence_count=event.recurrence_count,
        recurrence_until=event.recurrence_until,
        connections=EventConnections.model_validate(event.connections or {}),
    )


def _build_override(
    parent: CalendarEvent, values: dict[str, object], occurrence_start: datetime
) -> CalendarEvent:
    """A standalone row replacing one occurrence: parent fields, patch overlaid."""

    def pick(key: str, default: object) -> object:
        return values[key] if key in values else default

    duration = _as_utc(parent.end_at) - _as_utc(parent.start_at)
    link = values["link"] if "link" in values else parent.link
    connections = (
        values["connections"] if "connections" in values else dict(parent.connections or {})
    )
    return CalendarEvent(
        calendar_id=pick("calendar_id", parent.calendar_id),
        title=pick("title", parent.title),
        icon=pick("icon", parent.icon),
        description=pick("description", parent.description),
        location=pick("location", parent.location),
        start_at=pick("start_at", occurrence_start),
        end_at=pick("end_at", occurrence_start + duration),
        all_day=pick("all_day", parent.all_day),
        timezone=pick("timezone", parent.timezone),
        color_override=pick("color_override", parent.color_override),
        link=str(link) if link else None,
        reminder_minutes=pick("reminder_minutes", parent.reminder_minutes),
        rrule=None,
        recurrence_parent_id=parent.id,
        recurrence_overridden_at=occurrence_start,
        connections=connections or {},
    )


async def owned_calendar(calendar_id: str, user: User, session: AsyncSession) -> Calendar:
    calendar = await session.scalar(
        select(Calendar).where(Calendar.id == calendar_id, Calendar.user_id == user.id)
    )
    if calendar is None:
        raise HTTPException(status_code=404, detail="Calendar not found")
    return calendar


async def readable_calendar(calendar_id: str, user: User, session: AsyncSession) -> Calendar:
    calendar = await session.get(Calendar, calendar_id)
    if calendar is None or not await effective_role(
        "calendar", calendar_id, calendar.user_id, user.id, session
    ):
        raise HTTPException(status_code=404, detail="Calendar not found")
    return calendar


async def writable_calendar(calendar_id: str, user: User, session: AsyncSession) -> Calendar:
    """Like owned_calendar, but rejects read-only (ICS-subscribed) calendars."""
    calendar = await readable_calendar(calendar_id, user, session)
    role = await effective_role("calendar", calendar.id, calendar.user_id, user.id, session)
    if role == "viewer":
        raise HTTPException(status_code=403, detail="Calendar is read-only")
    if calendar.source == "ics":
        raise HTTPException(status_code=409, detail="ICS calendars are read-only")
    return calendar


async def owned_event(event_id: str, user: User, session: AsyncSession) -> CalendarEvent:
    event = await session.scalar(select(CalendarEvent).where(CalendarEvent.id == event_id))
    calendar = await session.get(Calendar, event.calendar_id) if event else None
    if (
        event is None
        or calendar is None
        or not await effective_role(
            "calendar", event.calendar_id, calendar.user_id, user.id, session
        )
    ):
        raise HTTPException(status_code=404, detail="Event not found")
    return event


async def writable_event(event_id: str, user: User, session: AsyncSession) -> CalendarEvent:
    """Like owned_event, but rejects events living in read-only ICS calendars."""
    event = await owned_event(event_id, user, session)
    await writable_calendar(event.calendar_id, user, session)
    return event


async def notify_calendar(calendar_id: str, session: AsyncSession) -> None:
    calendar = await session.get(Calendar, calendar_id)
    if calendar is None:
        return
    recipients = [calendar.user_id]
    recipients.extend(
        await session.scalars(
            select(ResourceShare.recipient_user_id).where(
                ResourceShare.resource_type == "calendar",
                ResourceShare.resource_id == calendar_id,
            )
        )
    )
    await calendar_connections.notify(recipients)


@router.websocket("/calendar/updates")
async def calendar_updates(websocket: WebSocket) -> None:
    async with async_session_factory() as session:
        user = await get_websocket_user(websocket, session)
        if user is None:
            await websocket.close(code=1008)
            return
        await calendar_connections.join(user.id, websocket)
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            await calendar_connections.leave(user.id, websocket)


def _plain_text_to_prosemirror(text: str) -> dict[str, object]:
    """Wrap plain text in a minimal ProseMirror doc (empty doc when blank)."""
    content = [{"type": "paragraph", "content": [{"type": "text", "text": text}]}] if text else []
    return {"type": "doc", "content": content}


async def _linked_planned_sessions(
    session: AsyncSession, event_ids: list[str]
) -> list[WorkoutSession]:
    """Planned workout sessions linked to the given events via logged_from."""
    if not event_ids:
        return []
    linked_ids = list(
        await session.scalars(
            select(Link.target_id).where(
                Link.source_type == "event",
                Link.source_id.in_(event_ids),
                Link.target_type == "workout_session",
                Link.relation == "logged_from",
            )
        )
    )
    if not linked_ids:
        return []
    rows = await session.scalars(
        select(WorkoutSession).where(
            WorkoutSession.id.in_(linked_ids),
            WorkoutSession.status == "planned",
        )
    )
    return list(rows)


async def _linked_planned_meals(session: AsyncSession, event_ids: list[str]) -> list[MealLog]:
    """Planned meal logs linked to the given events via logged_from."""
    if not event_ids:
        return []
    linked_ids = list(
        await session.scalars(
            select(Link.target_id).where(
                Link.source_type == "event",
                Link.source_id.in_(event_ids),
                Link.target_type == "meal_log",
                Link.relation == "logged_from",
            )
        )
    )
    if not linked_ids:
        return []
    rows = await session.scalars(
        select(MealLog).where(
            MealLog.id.in_(linked_ids),
            MealLog.status == "planned",
        )
    )
    return list(rows)


async def _linked_all_sessions(session: AsyncSession, event_ids: list[str]) -> list[WorkoutSession]:
    """All workout sessions (any status) linked via logged_from to the given events."""
    if not event_ids:
        return []
    linked_ids = list(
        await session.scalars(
            select(Link.target_id).where(
                Link.source_type == "event",
                Link.source_id.in_(event_ids),
                Link.target_type == "workout_session",
                Link.relation == "logged_from",
            )
        )
    )
    if not linked_ids:
        return []
    rows = await session.scalars(select(WorkoutSession).where(WorkoutSession.id.in_(linked_ids)))
    return list(rows)


async def _linked_all_meals(session: AsyncSession, event_ids: list[str]) -> list[MealLog]:
    """All meal logs (any status) linked via logged_from to the given events."""
    if not event_ids:
        return []
    linked_ids = list(
        await session.scalars(
            select(Link.target_id).where(
                Link.source_type == "event",
                Link.source_id.in_(event_ids),
                Link.target_type == "meal_log",
                Link.relation == "logged_from",
            )
        )
    )
    if not linked_ids:
        return []
    rows = await session.scalars(select(MealLog).where(MealLog.id.in_(linked_ids)))
    return list(rows)


async def _delete_event_links(session: AsyncSession, event_ids: list[str]) -> None:
    if event_ids:
        await session.execute(
            delete(Link).where(
                or_(
                    (Link.source_type == "event") & Link.source_id.in_(event_ids),
                    (Link.target_type == "event") & Link.target_id.in_(event_ids),
                )
            )
        )


# ponytail: caps unbounded recurring series at ~1yr of linked entries; a
# top-up background job would be the upgrade path if a longer horizon matters.
MAX_LINKED_OCCURRENCES = 366


async def _create_linked_entries(
    session: AsyncSession,
    user: User,
    event: CalendarEvent,
    fitness: FitnessConnection | None,
    food: FoodConnection | None,
    occurrence_starts: list[datetime],
) -> None:
    """One planned WorkoutSession/MealLog + Link per occurrence start."""
    for occ in occurrence_starts[:MAX_LINKED_OCCURRENCES]:
        if fitness is not None:
            workout = WorkoutSession(
                user_id=user.id,
                type=fitness.workout_type,
                status="planned",
                scheduled_at=occ,
                date=occ,
                notes=_plain_text_to_prosemirror(fitness.notes or ""),
            )
            session.add(workout)
            await session.flush()
            session.add(
                Link(
                    source_type="event",
                    source_id=event.id,
                    target_type="workout_session",
                    target_id=workout.id,
                    relation="logged_from",
                )
            )
        if food is not None:
            meal = MealLog(
                user_id=user.id,
                date=occ,
                meal_type=food.meal_type,
                status="planned",
                scheduled_at=occ,
                notes=food.notes,
            )
            session.add(meal)
            await session.flush()
            session.add(
                Link(
                    source_type="event",
                    source_id=event.id,
                    target_type="meal_log",
                    target_id=meal.id,
                    relation="logged_from",
                )
            )


@router.get("/calendars", response_model=list[CalendarResponse])
async def get_calendars(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[CalendarResponse]:
    ids = await shared_ids("calendar", user.id, session)
    calendars = list(
        await session.scalars(
            select(Calendar)
            .where((Calendar.user_id == user.id) | Calendar.id.in_(ids))
            .order_by(Calendar.name)
        )
    )
    return [await calendar_response(calendar, user, session) for calendar in calendars]


@router.post("/calendars", response_model=CalendarResponse, status_code=201)
async def create_calendar(
    data: CalendarWrite,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> CalendarResponse:
    calendar = Calendar(user_id=user.id, name=data.name.strip(), color=data.color, is_visible=True)
    session.add(calendar)
    await session.commit()
    await session.refresh(calendar)
    return await calendar_response(calendar, user, session)


@router.patch("/calendars/{calendar_id}", response_model=CalendarResponse)
async def patch_calendar(
    calendar_id: str,
    data: CalendarPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> CalendarResponse:
    calendar = await owned_calendar(calendar_id, user, session)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(calendar, key, value.strip() if isinstance(value, str) else value)
    await session.commit()
    await session.refresh(calendar)
    return await calendar_response(calendar, user, session)


@router.patch("/calendars/{calendar_id}/my-share", response_model=CalendarResponse)
async def patch_own_calendar_share(
    calendar_id: str,
    data: SelfSharePatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> CalendarResponse:
    """Let a calendar recipient override their own view (visibility/color)
    without touching the owner's Calendar row."""
    calendar = await readable_calendar(calendar_id, user, session)
    share = await session.scalar(
        select(ResourceShare).where(
            ResourceShare.resource_type == "calendar",
            ResourceShare.resource_id == calendar_id,
            ResourceShare.recipient_user_id == user.id,
        )
    )
    if share is None:
        raise HTTPException(status_code=404, detail="Share not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(share, key, value)
    await session.commit()
    return await calendar_response(calendar, user, session)


async def _share_recipient(data: ShareWrite, owner: User, session: AsyncSession) -> User:
    recipient = await session.scalar(select(User).where(User.email == str(data.email).casefold()))
    if recipient is None or recipient.id == owner.id:
        raise HTTPException(status_code=422, detail="Cannot share with that account")
    return recipient


@router.get("/calendars/{calendar_id}/shares", response_model=list[CollaboratorResponse])
async def list_calendar_shares(
    calendar_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[CollaboratorResponse]:
    calendar = await owned_calendar(calendar_id, user, session)
    return (await calendar_response(calendar, user, session)).collaborators


@router.post(
    "/calendars/{calendar_id}/shares", response_model=CollaboratorResponse, status_code=201
)
async def create_calendar_share(
    calendar_id: str,
    data: ShareWrite,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> CollaboratorResponse:
    await owned_calendar(calendar_id, user, session)
    recipient = await _share_recipient(data, user, session)
    share = await session.scalar(
        select(ResourceShare).where(
            ResourceShare.resource_type == "calendar",
            ResourceShare.resource_id == calendar_id,
            ResourceShare.recipient_user_id == recipient.id,
        )
    )
    if share is None:
        share = ResourceShare(
            resource_type="calendar",
            resource_id=calendar_id,
            recipient_user_id=recipient.id,
            role=data.role,
        )
        session.add(share)
    else:
        share.role = data.role
    await session.commit()
    return CollaboratorResponse(user_id=recipient.id, email=recipient.email, role=data.role)


@router.patch("/calendars/{calendar_id}/shares/{recipient_id}", response_model=CollaboratorResponse)
async def patch_calendar_share(
    calendar_id: str,
    recipient_id: str,
    data: SharePatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> CollaboratorResponse:
    await owned_calendar(calendar_id, user, session)
    share = await session.scalar(
        select(ResourceShare).where(
            ResourceShare.resource_type == "calendar",
            ResourceShare.resource_id == calendar_id,
            ResourceShare.recipient_user_id == recipient_id,
        )
    )
    recipient = await session.get(User, recipient_id)
    if share is None or recipient is None:
        raise HTTPException(status_code=404, detail="Share not found")
    share.role = data.role
    await session.commit()
    return CollaboratorResponse(user_id=recipient.id, email=recipient.email, role=share.role)


@router.delete("/calendars/{calendar_id}/shares/{recipient_id}", status_code=204)
async def delete_calendar_share(
    calendar_id: str,
    recipient_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    # Either the owner (revoking anyone's access) or the recipient themself
    # (leaving a calendar shared with them) may delete a share row.
    calendar = await session.get(Calendar, calendar_id)
    if calendar is None:
        raise HTTPException(status_code=404, detail="Calendar not found")
    if calendar.user_id != user.id and recipient_id != user.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    share = await session.scalar(
        select(ResourceShare).where(
            ResourceShare.resource_type == "calendar",
            ResourceShare.resource_id == calendar_id,
            ResourceShare.recipient_user_id == recipient_id,
        )
    )
    if share is None:
        raise HTTPException(status_code=404, detail="Share not found")
    await session.delete(share)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/calendars/{calendar_id}", status_code=204)
async def delete_calendar(
    calendar_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    calendar = await owned_calendar(calendar_id, user, session)
    if calendar.source != "local":
        raise HTTPException(status_code=409, detail="Synced calendars cannot be deleted here")
    event_ids = list(
        await session.scalars(
            select(CalendarEvent.id).where(CalendarEvent.calendar_id == calendar.id)
        )
    )
    await _delete_event_links(session, event_ids)
    await session.execute(delete(CalendarEvent).where(CalendarEvent.calendar_id == calendar.id))
    await session.delete(calendar)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _occurrence_key(value: datetime) -> int:
    """Stable per-occurrence key (whole seconds, UTC) for exdate matching."""
    return int(_as_utc(value).timestamp())


def _add_months(value: datetime, months: int) -> datetime:
    total = value.month - 1 + months
    year = value.year + total // 12
    month = total % 12 + 1
    return value.replace(year=year, month=month, day=min(value.day, 28))


def _occurrence_starts(event: CalendarEvent, event_start: datetime) -> Iterator[datetime]:
    """Series occurrence starts in chronological order, bounded by count/until.

    Lazy: the caller stops consuming once it leaves the requested window, so an
    open-ended series (no count/until) is fine — the guard only caps worst case.
    """
    freq = event.rrule
    interval = max(1, event.recurrence_interval or 1)
    count = event.recurrence_count
    until = _as_utc(event.recurrence_until) if event.recurrence_until else None
    generated = 0

    def within_limits(occ: datetime) -> bool:
        return (until is None or occ < until) and (count is None or generated < count)

    if freq == "WEEKLY":
        weekdays = sorted(
            {WEEKDAY_INDEX[d] for d in (event.recurrence_byday or [])} or {event_start.weekday()}
        )
        week_start = event_start - timedelta(days=event_start.weekday())
        for block in range(0, 5000, interval):
            for weekday in weekdays:
                occ = week_start + timedelta(weeks=block, days=weekday)
                if occ < event_start:
                    continue
                if not within_limits(occ):
                    return
                generated += 1
                yield occ
        return

    occ = event_start
    for _ in range(5000):
        if not within_limits(occ):
            return
        generated += 1
        yield occ
        if freq == "DAILY":
            occ = occ + timedelta(days=interval)
        elif freq == "MONTHLY":
            occ = _add_months(occ, interval)
        elif freq == "YEARLY":
            occ = occ.replace(year=occ.year + interval)
        else:
            return


def expand_event(event: CalendarEvent, start: datetime, end: datetime) -> list[EventResponse]:
    start = _as_utc(start)
    end = _as_utc(end)
    event_start = _as_utc(event.start_at)
    event_end = _as_utc(event.end_at)
    if not event.rrule:
        return [event_response(event)] if event_start < end and event_end > start else []
    duration = event_end - event_start
    exdates = {_occurrence_key(datetime.fromisoformat(d)) for d in (event.recurrence_exdates or [])}
    items: list[EventResponse] = []
    for occ in _occurrence_starts(event, event_start):
        if occ >= end:
            break
        occ_end = occ + duration
        if occ_end > start and _occurrence_key(occ) not in exdates:
            items.append(event_response(event, occ, occ_end))
        if len(items) > 500:
            break
    return items


@router.get("/events", response_model=list[EventResponse])
async def get_events(
    from_date: datetime = Query(...),
    to_date: datetime = Query(...),
    calendar_ids: list[str] | None = Query(None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[EventResponse]:
    if to_date <= from_date:
        raise HTTPException(status_code=422, detail="to_date must be after from_date")
    shared_calendar_ids = await shared_ids("calendar", user.id, session)
    accessible_calendars = list(
        await session.scalars(
            select(Calendar).where(
                (Calendar.user_id == user.id) | Calendar.id.in_(shared_calendar_ids)
            )
        )
    )
    # A shared calendar's visibility can be overridden per-recipient (see
    # ResourceShare.visible) without touching the owner's Calendar row —
    # resolve each accessible calendar's *effective* visibility for this user
    # rather than trusting the owner's Calendar.is_visible alone.
    own_shares = {
        share.resource_id: share
        for share in await session.scalars(
            select(ResourceShare).where(
                ResourceShare.resource_type == "calendar",
                ResourceShare.recipient_user_id == user.id,
            )
        )
    }
    visible_ids = [
        calendar.id
        for calendar in accessible_calendars
        if _own_share_overrides(calendar, user, own_shares.get(calendar.id))[0]
    ]
    query = (
        select(CalendarEvent)
        .join(Calendar)
        .where(
            Calendar.id.in_(visible_ids),
            CalendarEvent.start_at < to_date,
        )
    )
    if calendar_ids:
        query = query.where(Calendar.id.in_(calendar_ids))
    events = await session.scalars(query.order_by(CalendarEvent.start_at))
    return [item for event in events for item in expand_event(event, from_date, to_date)]


@router.get("/events/{event_id}", response_model=EventResponse)
async def get_event(
    event_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> EventResponse:
    return event_response(await owned_event(event_id, user, session))


@router.post("/events", response_model=EventResponse, status_code=201)
async def create_event(
    data: EventWrite,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> EventResponse:
    await writable_calendar(data.calendar_id, user, session)
    values = data.model_dump()
    values["link"] = str(data.link) if data.link else None
    event = CalendarEvent(**values)
    session.add(event)

    fitness = data.connections.fitness
    food = data.connections.food
    if fitness is not None or food is not None:
        await session.flush()
        occurrence_starts = (
            list(_occurrence_starts(event, _as_utc(event.start_at)))
            if event.rrule
            else [event.start_at]
        )
        await _create_linked_entries(session, user, event, fitness, food, occurrence_starts)

    await session.commit()
    await session.refresh(event)
    await notify_calendar(event.calendar_id, session)
    return event_response(event)


@router.patch("/events/{event_id}", response_model=EventResponse)
async def patch_event(
    event_id: str,
    data: EventPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> EventResponse:
    event = await writable_event(event_id, user, session)
    values = data.model_dump(exclude_unset=True)
    values.pop("scope", None)
    values.pop("occurrence_start", None)
    if data.calendar_id:
        await writable_calendar(data.calendar_id, user, session)

    # Editing a single occurrence of a series: split it off as an override row
    # and hide the original occurrence from the parent, so the series continues.
    if data.scope == "this" and event.rrule:
        if data.occurrence_start is None:
            raise HTTPException(
                status_code=422, detail="occurrence_start is required to edit one occurrence"
            )
        override = _build_override(event, values, _as_utc(data.occurrence_start))
        if override.end_at <= override.start_at:
            raise HTTPException(status_code=422, detail="end_at must be after start_at")
        event.recurrence_exdates = [
            *(event.recurrence_exdates or []),
            _as_utc(data.occurrence_start).isoformat(),
        ]
        session.add(override)
        await session.commit()
        await session.refresh(override)
        await notify_calendar(override.calendar_id, session)
        return event_response(override)

    for key, value in values.items():
        if key == "connections":
            value = value or {}
        setattr(event, key, str(value) if key == "link" and value else value)
    if event.end_at <= event.start_at:
        raise HTTPException(status_code=422, detail="end_at must be after start_at")

    recurrence_fields = {
        "rrule",
        "recurrence_interval",
        "recurrence_byday",
        "recurrence_count",
        "recurrence_until",
    }
    connections = EventConnections.model_validate(event.connections or {})
    fitness = connections.fitness
    food = connections.food

    if event.rrule and (
        "connections" in values or "start_at" in values or (recurrence_fields & values.keys())
    ):
        # Recurrence or connections changed: regenerate one planned entry per
        # occurrence from scratch. Never touches logged/active/completed entries.
        for workout in await _linked_planned_sessions(session, [event.id]):
            await session.delete(workout)
        for meal in await _linked_planned_meals(session, [event.id]):
            await session.delete(meal)
        await session.execute(
            delete(Link).where(
                Link.source_type == "event",
                Link.source_id == event.id,
                Link.relation == "logged_from",
            )
        )
        if fitness is not None or food is not None:
            occurrence_starts = list(_occurrence_starts(event, _as_utc(event.start_at)))
            await _create_linked_entries(session, user, event, fitness, food, occurrence_starts)
    elif "start_at" in values:
        # Non-recurring reschedule: move linked entries along with it.
        # Planned entries (created via the event-editor create form).
        for workout in await _linked_planned_sessions(session, [event.id]):
            workout.scheduled_at = event.start_at
            workout.date = event.start_at
        for meal in await _linked_planned_meals(session, [event.id]):
            meal.scheduled_at = event.start_at
            meal.date = event.start_at
        # Logged/completed entries linked via search (any status).
        for workout in await _linked_all_sessions(session, [event.id]):
            if workout.status != "planned":
                workout.date = event.start_at
        for meal in await _linked_all_meals(session, [event.id]):
            if meal.status != "planned":
                meal.date = event.start_at

    await session.commit()
    await session.refresh(event)
    await notify_calendar(event.calendar_id, session)
    return event_response(event)


@router.patch("/events", response_model=list[EventResponse])
async def move_events(
    data: BulkEventMove,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[EventResponse]:
    if len({item.id for item in data.events}) != len(data.events):
        raise HTTPException(status_code=422, detail="Each event may only be moved once")
    events = [await writable_event(item.id, user, session) for item in data.events]
    changes = {item.id: item for item in data.events}
    for event in events:
        change = changes[event.id]
        delta = change.start_at - change.original_start_at
        duration = change.end_at - change.start_at
        event.start_at += delta
        event.end_at = event.start_at + duration
        # Propagate date change to linked planned entries.
        for workout in await _linked_planned_sessions(session, [event.id]):
            workout.scheduled_at = event.start_at
            workout.date = event.start_at
        for meal in await _linked_planned_meals(session, [event.id]):
            meal.scheduled_at = event.start_at
            meal.date = event.start_at
    await session.commit()
    for calendar_id in {event.calendar_id for event in events}:
        await notify_calendar(calendar_id, session)
    return [event_response(event) for event in events]


async def _linked_workout_and_meal(
    session: AsyncSession, event_id: str
) -> tuple[WorkoutSession | None, MealLog | None]:
    """Whatever workout/meal is currently linked to this event, planned or logged."""
    workout_id = await session.scalar(
        select(Link.target_id).where(
            Link.source_type == "event",
            Link.source_id == event_id,
            Link.target_type == "workout_session",
            Link.relation == "logged_from",
        )
    )
    meal_id = await session.scalar(
        select(Link.target_id).where(
            Link.source_type == "event",
            Link.source_id == event_id,
            Link.target_type == "meal_log",
            Link.relation == "logged_from",
        )
    )
    workout = await session.get(WorkoutSession, workout_id) if workout_id else None
    meal = await session.get(MealLog, meal_id) if meal_id else None
    return workout, meal


@router.post("/events/copy", response_model=list[EventResponse], status_code=201)
async def copy_events(
    data: BulkEventCopy,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[EventResponse]:
    event_ids = list(dict.fromkeys(data.event_ids))
    # Copies land in the source calendar, so ICS-backed events cannot be copied.
    events = [await writable_event(event_id, user, session) for event_id in event_ids]
    starts = [
        event.start_at if event.start_at.tzinfo else event.start_at.replace(tzinfo=UTC)
        for event in events
    ]
    first_start = min(starts)
    copies: list[CalendarEvent] = []
    for event, event_start in zip(events, starts, strict=True):
        start_at = data.target_start + (event_start - first_start)
        workout, meal = await _linked_workout_and_meal(session, event.id)
        copy = CalendarEvent(
            calendar_id=event.calendar_id,
            title=event.title,
            icon=event.icon,
            description=event.description,
            location=event.location,
            link=event.link,
            start_at=start_at,
            end_at=start_at + (event.end_at - event.start_at),
            all_day=event.all_day,
            timezone=event.timezone,
            color_override=event.color_override,
            reminder_minutes=event.reminder_minutes,
            rrule=event.rrule,
            recurrence_interval=event.recurrence_interval,
            recurrence_byday=list(event.recurrence_byday or []),
            recurrence_count=event.recurrence_count,
            recurrence_until=event.recurrence_until,
            connections=dict(event.connections or {}),
        )
        session.add(copy)
        await session.flush()
        copies.append(copy)
        if workout is not None:
            new_workout = WorkoutSession(
                user_id=user.id,
                type=workout.type,
                status="planned",
                scheduled_at=start_at,
                date=start_at,
                plan=list(workout.plan) if workout.plan else None,
                notes=workout.notes,
            )
            session.add(new_workout)
            await session.flush()
            session.add(
                Link(
                    source_type="event",
                    source_id=copy.id,
                    target_type="workout_session",
                    target_id=new_workout.id,
                    relation="logged_from",
                )
            )
        if meal is not None:
            new_meal = MealLog(
                user_id=user.id,
                date=start_at,
                meal_type=meal.meal_type,
                slot_index=meal.slot_index,
                status="planned",
                scheduled_at=start_at,
                calories=meal.calories,
                protein_g=meal.protein_g,
                carbs_g=meal.carbs_g,
                fat_g=meal.fat_g,
                water_units=meal.water_units,
                veg_units=meal.veg_units,
                fruit_units=meal.fruit_units,
                notes=meal.notes,
            )
            session.add(new_meal)
            await session.flush()
            session.add(
                Link(
                    source_type="event",
                    source_id=copy.id,
                    target_type="meal_log",
                    target_id=new_meal.id,
                    relation="logged_from",
                )
            )
    await session.commit()
    for copy in copies:
        await session.refresh(copy)
    return [event_response(copy) for copy in copies]


@router.delete("/events/{event_id}", status_code=204)
async def delete_event(
    event_id: str,
    scope: Literal["all", "this", "following"] = "all",
    occurrence_start: datetime | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    event = await writable_event(event_id, user, session)

    # Non-recurring, or the whole series: drop the row (override children cascade).
    if scope == "all" or not event.rrule:
        event_ids = [event.id]
        event_ids.extend(
            await session.scalars(
                select(CalendarEvent.id).where(CalendarEvent.recurrence_parent_id == event.id)
            )
        )
        # Deleting the event un-schedules linked planned sessions but keeps
        # the session rows themselves.
        for workout in await _linked_planned_sessions(session, event_ids):
            workout.scheduled_at = None
        for meal in await _linked_planned_meals(session, event_ids):
            meal.scheduled_at = None
        await _delete_event_links(session, event_ids)
        await session.delete(event)
        await session.commit()
        await notify_calendar(event.calendar_id, session)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    if occurrence_start is None:
        raise HTTPException(
            status_code=422, detail="occurrence_start is required for this/following"
        )
    occ = _as_utc(occurrence_start)

    if scope == "this":
        # Hide just this occurrence and remove any override that replaced it.
        event.recurrence_exdates = [*(event.recurrence_exdates or []), occ.isoformat()]
        override_ids = list(
            await session.scalars(
                select(CalendarEvent.id).where(
                    CalendarEvent.recurrence_parent_id == event.id,
                    CalendarEvent.recurrence_overridden_at == occ,
                )
            )
        )
        for workout in await _linked_planned_sessions(session, override_ids):
            workout.scheduled_at = None
        for meal in await _linked_planned_meals(session, override_ids):
            meal.scheduled_at = None
        await _delete_event_links(session, override_ids)
        await session.execute(
            delete(CalendarEvent).where(
                CalendarEvent.recurrence_parent_id == event.id,
                CalendarEvent.recurrence_overridden_at == occ,
            )
        )
    else:  # following — end the series here and drop later overrides/exceptions.
        event.recurrence_until = occ
        override_ids = list(
            await session.scalars(
                select(CalendarEvent.id).where(
                    CalendarEvent.recurrence_parent_id == event.id,
                    CalendarEvent.recurrence_overridden_at >= occ,
                )
            )
        )
        for workout in await _linked_planned_sessions(session, override_ids):
            workout.scheduled_at = None
        await _delete_event_links(session, override_ids)
        await session.execute(
            delete(CalendarEvent).where(
                CalendarEvent.recurrence_parent_id == event.id,
                CalendarEvent.recurrence_overridden_at >= occ,
            )
        )
        event.recurrence_exdates = [
            d for d in (event.recurrence_exdates or []) if _as_utc(datetime.fromisoformat(d)) < occ
        ]
    await session.commit()
    await notify_calendar(event.calendar_id, session)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
