"""Native wardrobe catalog; outfit schedules are regular linked calendar events."""

from datetime import UTC, date, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.dependencies import get_current_user
from app.models import (
    Calendar,
    CalendarEvent,
    File,
    Link,
    User,
    UserSettings,
    WardrobeGarment,
    WardrobeOutfit,
    WardrobeOutfitGarment,
)
from app.routes.calendar import (
    EventConnections,
    EventWrite,
    WardrobeConnection,
    _as_utc,
    create_event,
    notify_calendar,
)
from app.routes.settings import _get_or_create_settings

router = APIRouter(prefix="/api/wardrobe", tags=["wardrobe"])


class GarmentInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=255)
    category: str = Field(min_length=1, max_length=100)
    brand: str = Field(default="", max_length=100)
    size: str = Field(default="", max_length=50)
    color: str = Field(default="", max_length=100)
    notes: str = Field(default="", max_length=10000)
    archived: bool = False
    photo_file_id: UUID | None = None


class GarmentResponse(GarmentInput):
    model_config = ConfigDict(from_attributes=True)
    id: str


class OutfitInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=255)
    notes: str = Field(default="", max_length=10000)
    garment_ids: list[UUID] = Field(min_length=1, max_length=100)

    @field_validator("garment_ids")
    @classmethod
    def unique_garments(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("Choose each garment once")
        return value


class OutfitResponse(OutfitInput):
    id: str


class ScheduleInput(BaseModel):
    outfit_id: UUID
    calendar_id: UUID
    date: date
    timezone: str = "Europe/Stockholm"

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Unknown timezone") from None
        return value


class ScheduleResponse(BaseModel):
    event_id: str
    outfit_id: str
    title: str
    start_at: datetime
    timezone: str


async def owned_garment(garment_id: UUID, user: User, session: AsyncSession) -> WardrobeGarment:
    row = await session.scalar(
        select(WardrobeGarment).where(
            WardrobeGarment.id == str(garment_id), WardrobeGarment.user_id == user.id
        )
    )
    if row is None:
        raise HTTPException(404, "Garment not found")
    return row


async def owned_outfit(outfit_id: UUID, user: User, session: AsyncSession) -> WardrobeOutfit:
    row = await session.scalar(
        select(WardrobeOutfit).where(
            WardrobeOutfit.id == str(outfit_id), WardrobeOutfit.user_id == user.id
        )
    )
    if row is None:
        raise HTTPException(404, "Outfit not found")
    return row


async def validate_photo(data: GarmentInput, user: User, session: AsyncSession) -> None:
    if data.photo_file_id:
        photo = await session.get(File, str(data.photo_file_id))
        if photo is None or photo.user_id != user.id or not photo.content_type.startswith("image/"):
            raise HTTPException(400, "Choose one of your uploaded images")


@router.get("/garments", response_model=list[GarmentResponse])
async def garments(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_async_session)
) -> list[WardrobeGarment]:
    return list(
        await session.scalars(
            select(WardrobeGarment)
            .where(WardrobeGarment.user_id == user.id)
            .order_by(WardrobeGarment.name)
        )
    )


@router.post("/garments", response_model=GarmentResponse, status_code=201)
async def create_garment(
    data: GarmentInput,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> WardrobeGarment:
    await validate_photo(data, user, session)
    row = WardrobeGarment(user_id=user.id, **data.model_dump(mode="json"))
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.put("/garments/{garment_id}", response_model=GarmentResponse)
async def update_garment(
    garment_id: UUID,
    data: GarmentInput,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> WardrobeGarment:
    row = await owned_garment(garment_id, user, session)
    await validate_photo(data, user, session)
    for key, value in data.model_dump(mode="json").items():
        setattr(row, key, value)
    await session.commit()
    await session.refresh(row)
    return row


@router.delete("/garments/{garment_id}", status_code=204, response_class=Response)
async def delete_garment(
    garment_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    row = await owned_garment(garment_id, user, session)
    if await session.scalar(
        select(WardrobeOutfitGarment).where(WardrobeOutfitGarment.garment_id == row.id).limit(1)
    ):
        raise HTTPException(409, "Remove this garment from saved outfits first, or archive it")
    await session.delete(row)
    await session.commit()
    return Response(status_code=204)


@router.get("/outfits", response_model=list[OutfitResponse])
async def outfits(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_async_session)
) -> list[OutfitResponse]:
    rows = list(
        await session.scalars(
            select(WardrobeOutfit)
            .where(WardrobeOutfit.user_id == user.id)
            .order_by(WardrobeOutfit.name)
        )
    )
    members = list(
        await session.scalars(
            select(WardrobeOutfitGarment).where(
                WardrobeOutfitGarment.outfit_id.in_([row.id for row in rows])
            )
        )
    )
    return [
        OutfitResponse(
            id=row.id,
            name=row.name,
            notes=row.notes,
            garment_ids=[
                UUID(member.garment_id) for member in members if member.outfit_id == row.id
            ],
        )
        for row in rows
    ]


async def save_outfit(
    row: WardrobeOutfit, data: OutfitInput, user: User, session: AsyncSession
) -> OutfitResponse:
    ids = [str(item) for item in data.garment_ids]
    found = list(
        await session.scalars(
            select(WardrobeGarment.id).where(
                WardrobeGarment.id.in_(ids), WardrobeGarment.user_id == user.id
            )
        )
    )
    if len(found) != len(ids):
        raise HTTPException(400, "Choose garments from your wardrobe")
    row.name, row.notes = data.name, data.notes
    session.add(row)
    await session.flush()
    await session.execute(
        delete(WardrobeOutfitGarment).where(WardrobeOutfitGarment.outfit_id == row.id)
    )
    session.add_all(WardrobeOutfitGarment(outfit_id=row.id, garment_id=item) for item in ids)
    await session.commit()
    return OutfitResponse(id=row.id, **data.model_dump())


@router.post("/outfits", response_model=OutfitResponse, status_code=201)
async def create_outfit(
    data: OutfitInput,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> OutfitResponse:
    return await save_outfit(WardrobeOutfit(user_id=user.id), data, user, session)


@router.put("/outfits/{outfit_id}", response_model=OutfitResponse)
async def update_outfit(
    outfit_id: UUID,
    data: OutfitInput,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> OutfitResponse:
    return await save_outfit(await owned_outfit(outfit_id, user, session), data, user, session)


@router.delete("/outfits/{outfit_id}", status_code=204, response_class=Response)
async def delete_outfit(
    outfit_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    row = await owned_outfit(outfit_id, user, session)
    await session.execute(
        delete(WardrobeOutfitGarment).where(WardrobeOutfitGarment.outfit_id == row.id)
    )
    linked_events = await session.scalars(
        select(CalendarEvent)
        .join(Link, Link.source_id == CalendarEvent.id)
        .where(
            Link.source_type == "event",
            Link.target_type == "wardrobe_outfit",
            Link.target_id == row.id,
        )
    )
    for event in linked_events:
        connection = (event.connections or {}).get("wardrobe")
        if isinstance(connection, dict) and connection.get("outfit_id") == row.id:
            event.connections = {
                key: value for key, value in event.connections.items() if key != "wardrobe"
            }

    await session.execute(
        delete(Link).where(
            ((Link.target_type == "wardrobe_outfit") & (Link.target_id == row.id))
            | ((Link.source_type == "wardrobe_outfit") & (Link.source_id == row.id))
        )
    )
    await session.delete(row)
    await session.commit()
    return Response(status_code=204)


@router.get("/schedule", response_model=list[ScheduleResponse])
async def schedule(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_async_session)
) -> list[ScheduleResponse]:
    rows = await session.execute(
        select(CalendarEvent, Link.target_id)
        .join(Calendar, Calendar.id == CalendarEvent.calendar_id)
        .join(Link, Link.source_id == CalendarEvent.id)
        .join(WardrobeOutfit, WardrobeOutfit.id == Link.target_id)
        .where(
            Calendar.user_id == user.id,
            WardrobeOutfit.user_id == user.id,
            Link.source_type == "event",
            Link.target_type == "wardrobe_outfit",
            Link.relation == "logged_from",
        )
        .order_by(CalendarEvent.start_at.desc())
    )
    return [
        ScheduleResponse(
            event_id=event.id,
            outfit_id=outfit_id,
            title=event.title,
            start_at=_as_utc(event.start_at),
            timezone=event.timezone,
        )
        for event, outfit_id in rows
    ]


@router.post("/schedule", response_model=ScheduleResponse, status_code=201)
async def create_schedule(
    data: ScheduleInput,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ScheduleResponse:
    outfit = await owned_outfit(data.outfit_id, user, session)
    calendar = await session.scalar(
        select(Calendar).where(
            Calendar.id == str(data.calendar_id),
            Calendar.user_id == user.id,
            Calendar.source == "local",
        )
    )
    if calendar is None:
        raise HTTPException(400, "Choose one of your local calendars")
    zone = ZoneInfo(data.timezone)
    start = datetime.combine(data.date, datetime.min.time(), tzinfo=zone)
    event = await create_event(
        EventWrite(
            calendar_id=calendar.id,
            title=f"Outfit: {outfit.name}",
            description=outfit.notes,
            icon="👕",
            start_at=start.astimezone(UTC),
            end_at=(start + timedelta(days=1)).astimezone(UTC),
            timezone=data.timezone,
            all_day=True,
            connections=EventConnections(wardrobe=WardrobeConnection(outfit_id=outfit.id)),
        ),
        user,
        session,
    )
    stored = await session.get(CalendarEvent, event.id)
    if stored is not None:
        stored.created_by = "system:wardrobe"
        await session.commit()
    return ScheduleResponse(
        event_id=event.id,
        outfit_id=outfit.id,
        title=event.title,
        start_at=_as_utc(event.start_at),
        timezone=event.timezone,
    )


@router.delete("/schedule/{event_id}", status_code=204, response_class=Response)
async def delete_schedule(
    event_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    event = await session.scalar(
        select(CalendarEvent)
        .join(Calendar)
        .join(Link, Link.source_id == CalendarEvent.id)
        .join(WardrobeOutfit, WardrobeOutfit.id == Link.target_id)
        .where(
            CalendarEvent.id == str(event_id),
            Calendar.user_id == user.id,
            Link.source_type == "event",
            Link.target_type == "wardrobe_outfit",
            Link.relation == "logged_from",
            WardrobeOutfit.user_id == user.id,
        )
    )
    if event is None:
        raise HTTPException(404, "Scheduled outfit not found")
    await session.execute(
        delete(Link).where(
            Link.source_type == "event",
            Link.source_id == event.id,
            Link.target_type == "wardrobe_outfit",
            Link.relation == "logged_from",
        )
    )
    event.connections = {
        key: value for key, value in (event.connections or {}).items() if key != "wardrobe"
    }
    await session.commit()
    await notify_calendar(event.calendar_id, session)
    return Response(status_code=204)


class PreferencesInput(BaseModel):
    categories: list[str] = Field(max_length=100)
    default_calendar_id: UUID | None = None
    ai_outfits_enabled: bool = False
    weather_planning_enabled: bool = False
    weather_city: str = Field(default="", max_length=200)

    @field_validator("categories")
    @classmethod
    def valid_categories(cls, values: list[str]) -> list[str]:
        names = [value.strip() for value in values]
        if any(not name or len(name) > 100 for name in names):
            raise ValueError("Category names must contain 1–100 characters")
        if len({name.casefold() for name in names}) != len(names):
            raise ValueError("Category names must be unique")
        return names


class PreferencesResponse(BaseModel):
    categories: list[str]
    default_calendar_id: str | None
    ai_outfits_enabled: bool
    weather_planning_enabled: bool
    weather_city: str


def preference_response(prefs: UserSettings, names: list[str]) -> PreferencesResponse:
    return PreferencesResponse(
        categories=names,
        default_calendar_id=prefs.wardrobe_default_calendar_id,
        ai_outfits_enabled=prefs.wardrobe_ai_outfits_enabled,
        weather_planning_enabled=prefs.wardrobe_weather_planning_enabled,
        weather_city=prefs.wardrobe_weather_city,
    )


class CategoryRename(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=100)
    new_name: str = Field(min_length=1, max_length=100)


async def category_names(user: User, session: AsyncSession) -> list[str]:
    prefs = await _get_or_create_settings(user.id, session)
    used = await session.scalars(
        select(WardrobeGarment.category).where(WardrobeGarment.user_id == user.id).distinct()
    )
    return list(dict.fromkeys([*prefs.wardrobe_categories, *used]))


@router.get("/preferences", response_model=PreferencesResponse)
async def preferences(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_async_session)
) -> PreferencesResponse:
    prefs = await _get_or_create_settings(user.id, session)
    names = await category_names(user, session)
    await session.commit()
    return preference_response(prefs, names)


@router.put("/preferences", response_model=PreferencesResponse)
async def save_preferences(
    data: PreferencesInput,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> PreferencesResponse:
    if data.default_calendar_id is not None:
        calendar = await session.scalar(
            select(Calendar).where(
                Calendar.id == str(data.default_calendar_id),
                Calendar.user_id == user.id,
                Calendar.source == "local",
            )
        )
        if calendar is None:
            raise HTTPException(400, "Choose one of your local calendars")
    used = set(
        await session.scalars(
            select(WardrobeGarment.category).where(WardrobeGarment.user_id == user.id).distinct()
        )
    )
    if used - set(data.categories):
        raise HTTPException(
            409, "Move garments out of a category before removing it, including archived garments"
        )
    prefs = await _get_or_create_settings(user.id, session)
    prefs.wardrobe_categories = data.categories
    prefs.wardrobe_default_calendar_id = (
        str(data.default_calendar_id) if data.default_calendar_id else None
    )
    prefs.wardrobe_ai_outfits_enabled = data.ai_outfits_enabled
    prefs.wardrobe_weather_planning_enabled = data.weather_planning_enabled
    prefs.wardrobe_weather_city = data.weather_city.strip()
    await session.commit()
    return preference_response(prefs, data.categories)


@router.post("/categories/rename", response_model=PreferencesResponse)
async def rename_category(
    data: CategoryRename,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> PreferencesResponse:
    names = await category_names(user, session)
    if data.name not in names:
        raise HTTPException(404, "Category not found")
    if any(name.casefold() == data.new_name.casefold() and name != data.name for name in names):
        raise HTTPException(409, "A category with that name already exists")
    await session.execute(
        update(WardrobeGarment)
        .where(WardrobeGarment.user_id == user.id, WardrobeGarment.category == data.name)
        .values(category=data.new_name)
    )
    prefs = await _get_or_create_settings(user.id, session)
    prefs.wardrobe_categories = [data.new_name if name == data.name else name for name in names]
    await session.commit()
    return preference_response(prefs, prefs.wardrobe_categories)
