from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.dependencies import get_current_user
from app.models import Calendar, CalendarEvent, User

router = APIRouter(prefix="/api", tags=["calendar"])


class CalendarResponse(BaseModel):
    id: str
    name: str
    color: str
    is_visible: bool


class CalendarEventResponse(BaseModel):
    id: str
    calendar_id: str
    title: str
    description: Optional[str]
    location: Optional[str]
    start_at: datetime
    end_at: datetime
    all_day: bool
    timezone: str


@router.get("/calendars", response_model=list[CalendarResponse])
async def get_calendars(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Get all calendars for the current user."""
    result = await session.execute(
        select(Calendar)
        .where(Calendar.user_id == user.id)
        .order_by(Calendar.name)
    )
    calendars = result.scalars().all()

    return [
        CalendarResponse(
            id=cal.id,
            name=cal.name,
            color=cal.color,
            is_visible=cal.is_visible,
        )
        for cal in calendars
    ]


@router.get("/events", response_model=list[CalendarEventResponse])
async def get_events(
    from_date: datetime = Query(..., description="Start date for event range"),
    to_date: datetime = Query(..., description="End date for event range"),
    calendar_ids: Optional[list[str]] = Query(None, description="Filter by calendar IDs"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Get calendar events in a date range for the current user."""
    # Build query for visible calendars for this user
    query = (
        select(CalendarEvent)
        .join(Calendar)
        .where(
            Calendar.user_id == user.id,
            Calendar.is_visible.is_(True),
            CalendarEvent.start_at >= from_date,
            CalendarEvent.end_at <= to_date,
        )
    )

    # Filter by specific calendars if provided
    if calendar_ids:
        query = query.where(Calendar.id.in_(calendar_ids))

    result = await session.execute(query.order_by(CalendarEvent.start_at))
    events = result.scalars().all()

    return [
        CalendarEventResponse(
            id=event.id,
            calendar_id=event.calendar_id,
            title=event.title,
            description=event.description,
            location=event.location,
            start_at=event.start_at,
            end_at=event.end_at,
            all_day=event.all_day,
            timezone=event.timezone,
        )
        for event in events
    ]
