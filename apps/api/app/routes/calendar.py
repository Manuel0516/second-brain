from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.dependencies import get_current_user
from app.models import Calendar, CalendarEvent, User

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


class NoteConnection(BaseModel):
    title: str = Field(min_length=1, max_length=255)


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
    name: str = Field(min_length=1, max_length=255)
    quantity: float = Field(default=1, gt=0)
    unit: str = Field(default="serving", min_length=1, max_length=50)
    calories: float | None = Field(default=None, ge=0)
    protein: float | None = Field(default=None, ge=0)
    carbs: float | None = Field(default=None, ge=0)
    fat: float | None = Field(default=None, ge=0)


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


async def owned_event(event_id: str, user: User, session: AsyncSession) -> CalendarEvent:
    event = await session.scalar(
        select(CalendarEvent)
        .join(Calendar)
        .where(CalendarEvent.id == event_id, Calendar.user_id == user.id)
    )
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.get("/calendars", response_model=list[CalendarResponse])
async def get_calendars(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[Calendar]:
    result = await session.scalars(
        select(Calendar).where(Calendar.user_id == user.id).order_by(Calendar.name)
    )
    return list(result)


@router.post("/calendars", response_model=CalendarResponse, status_code=201)
async def create_calendar(
    data: CalendarWrite,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Calendar:
    calendar = Calendar(user_id=user.id, name=data.name.strip(), color=data.color, is_visible=True)
    session.add(calendar)
    await session.commit()
    await session.refresh(calendar)
    return calendar


@router.patch("/calendars/{calendar_id}", response_model=CalendarResponse)
async def patch_calendar(
    calendar_id: str,
    data: CalendarPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Calendar:
    calendar = await owned_calendar(calendar_id, user, session)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(calendar, key, value.strip() if isinstance(value, str) else value)
    await session.commit()
    await session.refresh(calendar)
    return calendar


@router.delete("/calendars/{calendar_id}", status_code=204)
async def delete_calendar(
    calendar_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    calendar = await owned_calendar(calendar_id, user, session)
    if calendar.source != "local":
        raise HTTPException(status_code=409, detail="Synced calendars cannot be deleted here")
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
    query = (
        select(CalendarEvent)
        .join(Calendar)
        .where(
            Calendar.user_id == user.id,
            Calendar.is_visible.is_(True),
            CalendarEvent.start_at < to_date,
        )
    )
    if calendar_ids:
        query = query.where(Calendar.id.in_(calendar_ids))
    events = await session.scalars(query.order_by(CalendarEvent.start_at))
    return [item for event in events for item in expand_event(event, from_date, to_date)]


@router.post("/events", response_model=EventResponse, status_code=201)
async def create_event(
    data: EventWrite,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> EventResponse:
    await owned_calendar(data.calendar_id, user, session)
    values = data.model_dump()
    values["link"] = str(data.link) if data.link else None
    event = CalendarEvent(**values)
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return event_response(event)


@router.patch("/events/{event_id}", response_model=EventResponse)
async def patch_event(
    event_id: str,
    data: EventPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> EventResponse:
    event = await owned_event(event_id, user, session)
    values = data.model_dump(exclude_unset=True)
    values.pop("scope", None)
    values.pop("occurrence_start", None)
    if data.calendar_id:
        await owned_calendar(data.calendar_id, user, session)

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
        return event_response(override)

    for key, value in values.items():
        if key == "connections":
            value = value or {}
        setattr(event, key, str(value) if key == "link" and value else value)
    if event.end_at <= event.start_at:
        raise HTTPException(status_code=422, detail="end_at must be after start_at")
    await session.commit()
    await session.refresh(event)
    return event_response(event)


@router.patch("/events", response_model=list[EventResponse])
async def move_events(
    data: BulkEventMove,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[EventResponse]:
    if len({item.id for item in data.events}) != len(data.events):
        raise HTTPException(status_code=422, detail="Each event may only be moved once")
    events = [await owned_event(item.id, user, session) for item in data.events]
    changes = {item.id: item for item in data.events}
    for event in events:
        change = changes[event.id]
        delta = change.start_at - change.original_start_at
        duration = change.end_at - change.start_at
        event.start_at += delta
        event.end_at = event.start_at + duration
    await session.commit()
    return [event_response(event) for event in events]


@router.post("/events/copy", response_model=list[EventResponse], status_code=201)
async def copy_events(
    data: BulkEventCopy,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[EventResponse]:
    event_ids = list(dict.fromkeys(data.event_ids))
    events = [await owned_event(event_id, user, session) for event_id in event_ids]
    starts = [
        event.start_at if event.start_at.tzinfo else event.start_at.replace(tzinfo=UTC)
        for event in events
    ]
    first_start = min(starts)
    copies: list[CalendarEvent] = []
    for event, event_start in zip(events, starts, strict=True):
        start_at = data.target_start + (event_start - first_start)
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
        copies.append(copy)
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
    event = await owned_event(event_id, user, session)

    # Non-recurring, or the whole series: drop the row (override children cascade).
    if scope == "all" or not event.rrule:
        await session.delete(event)
        await session.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    if occurrence_start is None:
        raise HTTPException(
            status_code=422, detail="occurrence_start is required for this/following"
        )
    occ = _as_utc(occurrence_start)

    if scope == "this":
        # Hide just this occurrence and remove any override that replaced it.
        event.recurrence_exdates = [*(event.recurrence_exdates or []), occ.isoformat()]
        await session.execute(
            delete(CalendarEvent).where(
                CalendarEvent.recurrence_parent_id == event.id,
                CalendarEvent.recurrence_overridden_at == occ,
            )
        )
    else:  # following — end the series here and drop later overrides/exceptions.
        event.recurrence_until = occ
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
    return Response(status_code=status.HTTP_204_NO_CONTENT)
