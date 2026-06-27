from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.dependencies import get_current_user
from app.models import Calendar, CalendarEvent, User

router = APIRouter(prefix="/api", tags=["calendar"])
HEX = r"^#[0-9A-Fa-f]{6}$"


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


class EventWrite(BaseModel):
    calendar_id: str
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=100_000)
    location: str | None = Field(default=None, max_length=255)
    link: HttpUrl | None = None
    start_at: datetime
    end_at: datetime
    all_day: bool = False
    timezone: str = Field(default="Europe/Stockholm", min_length=1, max_length=63)
    color_override: str | None = Field(default=None, pattern=HEX)
    reminder_minutes: int | None = Field(default=None, ge=0, le=40_320)
    rrule: Literal["DAILY", "WEEKLY", "MONTHLY"] | None = None

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
        return self


class EventPatch(BaseModel):
    calendar_id: str | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=100_000)
    location: str | None = Field(default=None, max_length=255)
    link: HttpUrl | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    all_day: bool | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=63)
    color_override: str | None = Field(default=None, pattern=HEX)
    reminder_minutes: int | None = Field(default=None, ge=0, le=40_320)
    rrule: Literal["DAILY", "WEEKLY", "MONTHLY"] | None = None

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
    has_events = await session.scalar(
        select(CalendarEvent.id).where(CalendarEvent.calendar_id == calendar.id).limit(1)
    )
    if has_events:
        raise HTTPException(status_code=409, detail="Move or delete this calendar's events first")
    await session.delete(calendar)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def expand_event(event: CalendarEvent, start: datetime, end: datetime) -> list[EventResponse]:
    start = start if start.tzinfo else start.replace(tzinfo=UTC)
    end = end if end.tzinfo else end.replace(tzinfo=UTC)
    event_start = event.start_at if event.start_at.tzinfo else event.start_at.replace(tzinfo=UTC)
    event_end = event.end_at if event.end_at.tzinfo else event.end_at.replace(tzinfo=UTC)
    if not event.rrule:
        return [event_response(event)] if event_start < end and event_end > start else []
    step = timedelta(days=1 if event.rrule == "DAILY" else 7)
    current_start, current_end = event_start, event_end
    items: list[EventResponse] = []
    while current_start < end:
        if current_end > start:
            items.append(event_response(event, current_start, current_end))
        if event.rrule == "MONTHLY":
            month = current_start.month % 12 + 1
            year = current_start.year + current_start.month // 12
            next_start = current_start.replace(
                year=year, month=month, day=min(current_start.day, 28)
            )
            current_end = next_start + (current_end - current_start)
            current_start = next_start
        else:
            current_start += step
            current_end += step
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
    if data.calendar_id:
        await owned_calendar(data.calendar_id, user, session)
    for key, value in values.items():
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
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    event = await owned_event(event_id, user, session)
    await session.delete(event)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
