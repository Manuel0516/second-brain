from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.dependencies import get_current_user
from app.models import Calendar, CalendarEvent, User, UserSettings

router = APIRouter(prefix="/api/settings", tags=["settings"])

HEX = r"^#[0-9A-Fa-f]{6}$"

DEFAULT_FAVORITE_EMOJIS = ["📅", "💼", "☕", "🏃", "🍽️", "📝", "🎧", "🎯"]
DEFAULT_FAVORITE_COLORS = ["#3B6FE0", "#2E9E6E", "#D6932B", "#8B5CF6", "#D9573F"]

BulletStyle = Literal["disc", "circle", "square", "dash"]
NumberedStyle = Literal["decimal", "lower-alpha", "upper-alpha", "lower-roman", "upper-roman"]


class SettingsResponse(BaseModel):
    theme: Literal["system", "light", "dark"]
    visual_style: Literal["neon", "monochrome"]
    timezone: str
    week_start: Literal["monday", "sunday"]
    default_view: Literal["day", "week", "month"]
    time_format: Literal["24h", "12h"]
    favorite_emojis: list[str]
    favorite_colors: list[str]
    default_event_minutes: int
    default_calendar_id: str | None
    default_reminder_minutes: int | None
    show_weekends: bool
    dim_past_events: bool
    notes_bullet_style: BulletStyle
    notes_numbered_style: NumberedStyle
    favorite_text_colors: list[str]
    favorite_highlight_colors: list[str]
    favorite_block_colors: list[str]
    favorite_covers: list[str]
    fitness_rest_seconds: int
    fitness_auto_start_rest: bool
    fitness_weight_unit: Literal["kg", "lb"]
    fitness_weekly_session_target: int | None
    fitness_stats_range_days: int
    food_daily_meal_goal: int
    food_calorie_target: int | None
    food_protein_target_g: float | None
    food_carbs_target_g: float | None
    food_fat_target_g: float | None
    food_water_target_units: int | None
    food_veg_target_units: int | None
    food_fruit_target_units: int | None
    food_stats_range_days: int


class SettingsPatch(BaseModel):
    theme: Literal["system", "light", "dark"] | None = None
    visual_style: Literal["neon", "monochrome"] | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=63)
    week_start: Literal["monday", "sunday"] | None = None
    default_view: Literal["day", "week", "month"] | None = None
    time_format: Literal["24h", "12h"] | None = None
    favorite_emojis: list[str] | None = Field(default=None, max_length=32)
    favorite_colors: list[str] | None = Field(default=None, max_length=24)
    default_event_minutes: int | None = Field(default=None, ge=5, le=1440)
    default_calendar_id: str | None = None
    default_reminder_minutes: int | None = Field(default=None, ge=0, le=40_320)
    show_weekends: bool | None = None
    dim_past_events: bool | None = None
    notes_bullet_style: BulletStyle | None = None
    notes_numbered_style: NumberedStyle | None = None
    favorite_text_colors: list[str] | None = Field(default=None, max_length=24)
    favorite_highlight_colors: list[str] | None = Field(default=None, max_length=24)
    favorite_block_colors: list[str] | None = Field(default=None, max_length=24)
    favorite_covers: list[str] | None = Field(default=None, max_length=12)
    fitness_rest_seconds: int | None = Field(default=None, ge=10, le=600)
    fitness_auto_start_rest: bool | None = None
    fitness_weight_unit: Literal["kg", "lb"] | None = None
    fitness_weekly_session_target: int | None = Field(default=None, ge=0, le=14)
    fitness_stats_range_days: int | None = Field(default=None, ge=7, le=365)
    food_daily_meal_goal: int | None = Field(default=None, ge=1, le=20)
    food_calorie_target: int | None = Field(default=None, ge=0)
    food_protein_target_g: float | None = Field(default=None, ge=0)
    food_carbs_target_g: float | None = Field(default=None, ge=0)
    food_fat_target_g: float | None = Field(default=None, ge=0)
    food_water_target_units: int | None = Field(default=None, ge=0)
    food_veg_target_units: int | None = Field(default=None, ge=0)
    food_fruit_target_units: int | None = Field(default=None, ge=0)
    food_stats_range_days: int | None = Field(default=None, ge=7, le=365)

    @field_validator("favorite_emojis")
    @classmethod
    def validate_emojis(cls, value: list[str] | None) -> list[str] | None:
        if value is not None:
            for emoji in value:
                if len(emoji) > 8:
                    raise ValueError("Each emoji must be at most 8 characters")
        return value

    @field_validator(
        "favorite_colors",
        "favorite_text_colors",
        "favorite_highlight_colors",
        "favorite_block_colors",
    )
    @classmethod
    def validate_colors(cls, value: list[str] | None) -> list[str] | None:
        if value is not None:
            import re

            pattern = re.compile(HEX)
            for color in value:
                if not pattern.match(color):
                    raise ValueError(f"Invalid hex color: {color}")
        return value

    @field_validator("favorite_covers")
    @classmethod
    def validate_covers(cls, value: list[str] | None) -> list[str] | None:
        if value is not None:
            for cover in value:
                if not cover or len(cover) > 2048:
                    raise ValueError("Cover URL must be 1-2048 characters")
        return value


async def _get_or_create_settings(
    user_id: str,
    session: AsyncSession,
) -> UserSettings:
    """Get settings for the user, creating with defaults if missing."""
    result = await session.execute(select(UserSettings).where(UserSettings.user_id == user_id))
    settings = result.scalar_one_or_none()

    if settings is None:
        # Find default calendar for seeding defaults
        cal_result = await session.execute(
            select(Calendar)
            .where(Calendar.user_id == user_id)
            .order_by(Calendar.created_at)
            .limit(1)
        )
        default_cal = cal_result.scalar_one_or_none()

        settings = UserSettings(
            user_id=user_id,
            favorite_emojis=DEFAULT_FAVORITE_EMOJIS,
            favorite_colors=DEFAULT_FAVORITE_COLORS,
            default_calendar_id=default_cal.id if default_cal else None,
        )
        session.add(settings)
        await session.commit()
        await session.refresh(settings)

    return settings


def _settings_to_response(s: UserSettings) -> SettingsResponse:
    return SettingsResponse(
        theme=s.theme,
        visual_style=s.visual_style,
        timezone=s.timezone,
        week_start=s.week_start,
        default_view=s.default_view,
        time_format=s.time_format,
        favorite_emojis=s.favorite_emojis,
        favorite_colors=s.favorite_colors,
        default_event_minutes=s.default_event_minutes,
        default_calendar_id=s.default_calendar_id,
        default_reminder_minutes=s.default_reminder_minutes,
        show_weekends=s.show_weekends,
        dim_past_events=s.dim_past_events,
        notes_bullet_style=s.notes_bullet_style,
        notes_numbered_style=s.notes_numbered_style,
        favorite_text_colors=s.favorite_text_colors,
        favorite_highlight_colors=s.favorite_highlight_colors,
        favorite_block_colors=s.favorite_block_colors,
        favorite_covers=s.favorite_covers,
        fitness_rest_seconds=s.fitness_rest_seconds,
        fitness_auto_start_rest=s.fitness_auto_start_rest,
        fitness_weight_unit=s.fitness_weight_unit,
        fitness_weekly_session_target=s.fitness_weekly_session_target,
        fitness_stats_range_days=s.fitness_stats_range_days,
        food_daily_meal_goal=s.food_daily_meal_goal,
        food_calorie_target=s.food_calorie_target,
        food_protein_target_g=s.food_protein_target_g,
        food_carbs_target_g=s.food_carbs_target_g,
        food_fat_target_g=s.food_fat_target_g,
        food_water_target_units=s.food_water_target_units,
        food_veg_target_units=s.food_veg_target_units,
        food_fruit_target_units=s.food_fruit_target_units,
        food_stats_range_days=s.food_stats_range_days,
    )


@router.get("", response_model=SettingsResponse)
async def get_settings(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> SettingsResponse:
    """Get user settings, creating defaults if missing."""
    settings = await _get_or_create_settings(user.id, session)
    return _settings_to_response(settings)


@router.patch("", response_model=SettingsResponse)
async def patch_settings(
    payload: SettingsPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> SettingsResponse:
    """Partial update user settings."""
    settings = await _get_or_create_settings(user.id, session)

    update_data = payload.model_dump(exclude_unset=True)

    # Validate default_calendar_id belongs to user
    if "default_calendar_id" in update_data and update_data["default_calendar_id"] is not None:
        cal_result = await session.execute(
            select(Calendar).where(
                Calendar.id == update_data["default_calendar_id"],
                Calendar.user_id == user.id,
            )
        )
        if cal_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Calendar not found",
            )

    for field_name, value in update_data.items():
        setattr(settings, field_name, value)

    settings.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(settings)

    return _settings_to_response(settings)


@router.get("/export")
async def export_data(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> JSONResponse:
    """Export all user data as JSON."""
    # Get calendars
    cal_result = await session.execute(select(Calendar).where(Calendar.user_id == user.id))
    calendars = cal_result.scalars().all()

    # Get stored events (raw rows, not expanded occurrences)
    event_result = await session.execute(
        select(CalendarEvent)
        .where(CalendarEvent.calendar_id.in_([c.id for c in calendars]))
        .order_by(CalendarEvent.start_at)
    )
    events = event_result.scalars().all()

    export = {
        "exported_at": datetime.now(UTC).isoformat(),
        "user": {
            "username": user.username,
            "email": user.email,
        },
        "calendars": [
            {
                "id": c.id,
                "name": c.name,
                "color": c.color,
                "is_visible": c.is_visible,
                "source": c.source,
            }
            for c in calendars
        ],
        "events": [
            {
                "id": e.id,
                "calendar_id": e.calendar_id,
                "title": e.title,
                "start_at": e.start_at.isoformat(),
                "end_at": e.end_at.isoformat(),
                "all_day": e.all_day,
                "rrule": e.rrule,
                "recurrence_interval": e.recurrence_interval,
                "recurrence_byday": e.recurrence_byday,
            }
            for e in events
        ],
    }

    filename = f"secondbrain-export-{datetime.now(UTC).strftime('%Y-%m-%d')}.json"
    response = JSONResponse(content=export)
    response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
