import base64
import json
from datetime import UTC, date, datetime, timedelta
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_async_session
from app.dependencies import get_current_user
from app.models import File, FoodDailyExtras, Link, MealLog, User
from app.storage import download, remove

router = APIRouter(prefix="/api/food", tags=["food"])

# ── Pydantic Models ─────────────────────────────────────────────────────

MealType = Literal["breakfast", "lunch", "dinner", "snack"]
MealStatus = Literal["planned", "logged"]


class MealLogCreate(BaseModel):
    date: datetime
    meal_type: MealType = "breakfast"
    slot_index: int = Field(default=0, ge=0)
    status: MealStatus = "planned"
    scheduled_at: datetime | None = None
    notes: str | None = None
    photo_file_id: str | None = None
    calories: float | None = Field(default=None, ge=0)
    protein_g: float | None = Field(default=None, ge=0)
    carbs_g: float | None = Field(default=None, ge=0)
    fat_g: float | None = Field(default=None, ge=0)
    water_units: int = Field(default=0, ge=0)
    veg_units: int = Field(default=0, ge=0)
    fruit_units: int = Field(default=0, ge=0)
    ai_items: list[dict[str, object]] | None = None


class MealLogPatch(BaseModel):
    date: datetime | None = None
    meal_type: MealType | None = None
    slot_index: int | None = Field(default=None, ge=0)
    status: MealStatus | None = None
    scheduled_at: datetime | None = None
    notes: str | None = None
    photo_file_id: str | None = None
    calories: float | None = Field(default=None, ge=0)
    protein_g: float | None = Field(default=None, ge=0)
    carbs_g: float | None = Field(default=None, ge=0)
    fat_g: float | None = Field(default=None, ge=0)
    water_units: int | None = Field(default=None, ge=0)
    veg_units: int | None = Field(default=None, ge=0)
    fruit_units: int | None = Field(default=None, ge=0)
    ai_items: list[dict[str, object]] | None = None


class MealLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    date: datetime
    meal_type: str
    slot_index: int
    status: str
    scheduled_at: datetime | None
    logged_at: datetime | None
    photo_file_id: str | None
    calories: float | None
    protein_g: float | None
    carbs_g: float | None
    fat_g: float | None
    water_units: int
    veg_units: int
    fruit_units: int
    notes: str | None
    ai_items: list[dict[str, object]] | None
    created_at: datetime
    updated_at: datetime


class AnalyzeRequest(BaseModel):
    file_id: str


class DaySummary(BaseModel):
    date: str  # YYYY-MM-DD
    calories_consumed: float
    protein_consumed: float
    carbs_consumed: float
    fat_consumed: float
    water_units: int
    veg_units: int
    fruit_units: int
    extras_water_units: int = 0
    extras_veg_units: int = 0
    extras_fruit_units: int = 0
    meals_planned: int
    meals_logged: int
    meals: list[MealLogResponse]


class FoodSummary(BaseModel):
    days: list[DaySummary]


class ExtrasPatch(BaseModel):
    date: date
    water_units: int | None = Field(default=None, ge=0)
    veg_units: int | None = Field(default=None, ge=0)
    fruit_units: int | None = Field(default=None, ge=0)


class FoodDailyExtrasResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    date: date
    water_units: int
    veg_units: int
    fruit_units: int
    created_at: datetime
    updated_at: datetime


# ── AI prompt for /analyze ──────────────────────────────────────────────

_ANALYZE_PROMPT = (
    "Analyze this meal photo. Return JSON with: "
    "calories (int), protein_g (float), carbs_g (float), fat_g (float), "
    "water_units (int, glasses of water visible), "
    "veg_units (int, vegetable portions), "
    "fruit_units (int, fruit portions), "
    "items (array of {name, quantity, calories, protein, carbs, fat}). "
    "Only return valid JSON."
)


# ── Helper Functions ────────────────────────────────────────────────────


async def _owned_meal_log(log_id: str, user: User, session: AsyncSession) -> MealLog:
    """Fetch a meal log owned by the current user, or 404."""
    log = await session.scalar(
        select(MealLog).where(MealLog.id == log_id, MealLog.user_id == user.id)
    )
    if log is None:
        raise HTTPException(status_code=404, detail="Meal log not found")
    return log


def _start_of_day(dt: datetime) -> datetime:
    """Return the start of the day (midnight UTC) for the given datetime."""
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


# ── Meal Log Endpoints ──────────────────────────────────────────────────


@router.get("/logs", response_model=list[MealLogResponse])
async def list_meal_logs(
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[MealLog]:
    """List meal logs. Defaults to the trailing 7 days."""
    query = select(MealLog).where(MealLog.user_id == user.id)
    if from_date is not None:
        query = query.where(MealLog.date >= from_date)
    else:
        query = query.where(MealLog.date >= datetime.now(UTC) - timedelta(days=7))
    if to_date is not None:
        query = query.where(MealLog.date <= to_date)
    result = await session.scalars(query.order_by(MealLog.date.desc()))
    return list(result)


@router.post("/logs", response_model=MealLogResponse, status_code=status.HTTP_201_CREATED)
async def create_meal_log(
    data: MealLogCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> MealLog:
    """Create a meal log. If status is 'logged' and logged_at is null, set it to now."""
    logged_at = None
    if data.status == "logged":
        logged_at = datetime.now(UTC)

    log = MealLog(
        user_id=user.id,
        date=data.date,
        meal_type=data.meal_type,
        slot_index=data.slot_index,
        status=data.status,
        scheduled_at=data.scheduled_at,
        logged_at=logged_at,
        notes=data.notes,
        photo_file_id=data.photo_file_id,
        calories=data.calories,
        protein_g=data.protein_g,
        carbs_g=data.carbs_g,
        fat_g=data.fat_g,
        water_units=data.water_units,
        veg_units=data.veg_units,
        fruit_units=data.fruit_units,
        ai_items=data.ai_items,
    )
    session.add(log)
    await session.commit()
    await session.refresh(log)
    return log


@router.patch("/logs/{log_id}", response_model=MealLogResponse)
async def update_meal_log(
    log_id: str,
    data: MealLogPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> MealLog:
    """Update a meal log. If status is set to 'logged' and logged_at is null, set it to now."""
    log = await _owned_meal_log(log_id, user, session)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(log, key, value)
    if log.status == "logged" and log.logged_at is None:
        log.logged_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(log)
    return log


@router.delete("/logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meal_log(
    log_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> None:
    """Delete a meal log, its photo file, and any Link rows pointing to it."""
    log = await _owned_meal_log(log_id, user, session)
    photo_file_id = log.photo_file_id

    # Delete Link rows where target_type="meal_log" and target_id=log_id
    await session.execute(
        delete(Link).where(
            Link.target_type == "meal_log",
            Link.target_id == log_id,
        )
    )

    # Delete the log before the file it references — MealLog.photo_file_id has
    # no ORM relationship() to File, so SQLAlchemy won't reorder these deletes
    # itself, and Postgres rejects deleting a still-referenced file row.
    await session.delete(log)

    if photo_file_id is not None:
        try:
            remove(user.id, photo_file_id)
        except Exception:
            pass  # ponytail: orphan-sweep — MinIO may be down
        file_row = await session.get(File, photo_file_id)
        if file_row is not None:
            await session.delete(file_row)

    await session.commit()


# ── AI Photo Analysis ───────────────────────────────────────────────────


@router.post("/logs/{log_id}/analyze", response_model=MealLogResponse)
async def analyze_meal_photo(
    log_id: str,
    body: AnalyzeRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> MealLog:
    """Analyze a meal photo via OpenRouter vision model and populate the meal log.

    Fetches the image from MinIO, sends it to OpenRouter with a structured
    prompt, parses the JSON response, and writes nutrition data onto the log.
    The log is NOT modified if the API call or parsing fails.
    """
    settings = get_settings()
    if not settings.openrouter_api_key:
        raise HTTPException(
            status_code=400,
            detail="OPENROUTER_API_KEY is not configured",
        )

    log = await _owned_meal_log(log_id, user, session)

    # Fetch image bytes from MinIO
    try:
        image_bytes, content_type = download(user.id, body.file_id)
    except Exception as err:
        raise HTTPException(status_code=404, detail="File not found in storage") from err

    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    data_uri = f"data:{content_type};base64,{image_b64}"

    # Call OpenRouter
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.openrouter_model,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": _ANALYZE_PROMPT},
                                {
                                    "type": "image_url",
                                    "image_url": {"url": data_uri},
                                },
                            ],
                        }
                    ],
                },
            )
            if response.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"OpenRouter API returned status {response.status_code}",
                )
            body_json = response.json()
    except httpx.RequestError as err:
        raise HTTPException(status_code=502, detail="Failed to reach OpenRouter API") from err
    except HTTPException:
        raise  # re-raise our own HTTPExceptions
    except Exception as err:
        raise HTTPException(status_code=502, detail="Unexpected error calling OpenRouter") from err

    # Parse the AI response
    try:
        content = body_json["choices"][0]["message"]["content"]
        # Strip markdown code fences if present
        if content.startswith("```"):
            content = content.split("\n", 1)[-1]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
        parsed = json.loads(content)
    except (KeyError, IndexError, json.JSONDecodeError) as err:
        raise HTTPException(status_code=502, detail="Failed to parse AI response") from err

    # Write parsed data onto the meal log
    log.calories = parsed.get("calories")
    log.protein_g = parsed.get("protein_g")
    log.carbs_g = parsed.get("carbs_g")
    log.fat_g = parsed.get("fat_g")
    log.water_units = parsed.get("water_units", 0)
    log.veg_units = parsed.get("veg_units", 0)
    log.fruit_units = parsed.get("fruit_units", 0)
    log.ai_items = parsed.get("items")
    log.photo_file_id = body.file_id
    log.status = "logged"
    log.logged_at = datetime.now(UTC)

    await session.commit()
    await session.refresh(log)
    return log


# ── Summary ─────────────────────────────────────────────────────────────


@router.get("/summary", response_model=FoodSummary)
async def food_summary(
    from_date: datetime = Query(...),
    to_date: datetime = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> FoodSummary:
    """Per-day aggregates for the given date range.

    Combines meal_log totals with food_daily_extras for each day.
    """
    # Fetch all meal logs in range
    logs = (
        await session.scalars(
            select(MealLog)
            .where(
                MealLog.user_id == user.id,
                MealLog.date >= from_date,
                MealLog.date <= to_date,
            )
            .order_by(MealLog.date.desc())
        )
    ).all()

    # Fetch all extras in range
    extras = (
        await session.scalars(
            select(FoodDailyExtras).where(
                FoodDailyExtras.user_id == user.id,
                FoodDailyExtras.date >= from_date.date(),
                FoodDailyExtras.date <= to_date.date(),
            )
        )
    ).all()
    extras_by_date: dict[str, FoodDailyExtras] = {e.date.isoformat(): e for e in extras}

    # Group logs by date
    logs_by_date: dict[str, list[MealLog]] = {}
    for log in logs:
        day_key = log.date.date().isoformat()
        logs_by_date.setdefault(day_key, []).append(log)

    # Build day summaries for every day in range
    days: list[DaySummary] = []
    current = from_date.date()
    end = to_date.date()
    while current <= end:
        day_key = current.isoformat()
        day_logs = logs_by_date.get(day_key, [])
        day_extras = extras_by_date.get(day_key)

        calories = sum((ml.calories or 0) for ml in day_logs)
        protein = sum((ml.protein_g or 0) for ml in day_logs)
        carbs = sum((ml.carbs_g or 0) for ml in day_logs)
        fat = sum((ml.fat_g or 0) for ml in day_logs)
        water = sum(ml.water_units for ml in day_logs)
        veg = sum(ml.veg_units for ml in day_logs)
        fruit = sum(ml.fruit_units for ml in day_logs)

        if day_extras is not None:
            water += day_extras.water_units
            veg += day_extras.veg_units
            fruit += day_extras.fruit_units

        planned = sum(1 for ml in day_logs if ml.status == "planned")
        logged = sum(1 for ml in day_logs if ml.status == "logged")

        days.append(
            DaySummary(
                date=day_key,
                calories_consumed=calories,
                protein_consumed=protein,
                carbs_consumed=carbs,
                fat_consumed=fat,
                water_units=water,
                veg_units=veg,
                fruit_units=fruit,
                extras_water_units=day_extras.water_units if day_extras else 0,
                extras_veg_units=day_extras.veg_units if day_extras else 0,
                extras_fruit_units=day_extras.fruit_units if day_extras else 0,
                meals_planned=planned,
                meals_logged=logged,
                meals=[MealLogResponse.model_validate(ml) for ml in day_logs],
            )
        )
        current += timedelta(days=1)

    return FoodSummary(days=days)


# ── Daily Extras ────────────────────────────────────────────────────────


@router.patch("/extras", response_model=FoodDailyExtrasResponse)
async def upsert_daily_extras(
    data: ExtrasPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> FoodDailyExtras:
    """Upsert daily extras (water, veg, fruit). Creates or updates the row for the given date."""
    existing = await session.scalar(
        select(FoodDailyExtras).where(
            FoodDailyExtras.user_id == user.id,
            FoodDailyExtras.date == data.date,
        )
    )

    if existing is not None:
        if data.water_units is not None:
            existing.water_units = data.water_units
        if data.veg_units is not None:
            existing.veg_units = data.veg_units
        if data.fruit_units is not None:
            existing.fruit_units = data.fruit_units
        await session.commit()
        await session.refresh(existing)
        return existing

    extras = FoodDailyExtras(
        user_id=user.id,
        date=data.date,
        water_units=data.water_units or 0,
        veg_units=data.veg_units or 0,
        fruit_units=data.fruit_units or 0,
    )
    session.add(extras)
    await session.commit()
    await session.refresh(extras)
    return extras
