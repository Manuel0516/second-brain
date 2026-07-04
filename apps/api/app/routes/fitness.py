from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.dependencies import get_current_user
from app.models import (
    BodyMetric,
    Calendar,
    CalendarEvent,
    Exercise,
    Goal,
    Link,
    SetEntry,
    User,
    WorkoutSession,
)

router = APIRouter(prefix="/api", tags=["fitness"])

# ── Pydantic Models ─────────────────────────────────────────────────────


class ExerciseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    category: Literal["strength", "cardio", "mobility"] = "strength"
    unit: Literal["reps", "kg", "km", "min", "reps+weight"] = "reps"


class ExercisePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    category: Literal["strength", "cardio", "mobility"] | None = None
    unit: Literal["reps", "kg", "km", "min", "reps+weight"] | None = None


class ExerciseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    category: str
    unit: str
    created_at: datetime
    updated_at: datetime


class SessionCreate(BaseModel):
    date: datetime
    type: str = Field(min_length=1, max_length=255)
    notes: dict[str, object] | None = Field(
        default=None, description="Tiptap-compatible block JSON"
    )


class SessionPatch(BaseModel):
    date: datetime | None = None
    type: str | None = Field(default=None, min_length=1, max_length=255)
    notes: dict[str, object] | None = None


class SessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    date: datetime
    type: str
    notes: dict[str, object]
    created_at: datetime
    updated_at: datetime


class SetEntryCreate(BaseModel):
    exercise_id: str
    set_number: int = Field(ge=1)
    reps: int = Field(ge=0)
    # ponytail: DB stores weight as Integer; Pydantic accepts int for consistency.
    weight: int | None = Field(default=None, ge=0)
    rpe: int | None = Field(default=None, ge=1, le=10)
    notes: str | None = Field(default=None, max_length=500)


class SetEntryPatch(BaseModel):
    exercise_id: str | None = None
    set_number: int | None = Field(default=None, ge=1)
    reps: int | None = Field(default=None, ge=0)
    # ponytail: DB stores weight as Integer; Pydantic accepts int for consistency.
    weight: int | None = Field(default=None, ge=0)
    rpe: int | None = Field(default=None, ge=1, le=10)
    notes: str | None = Field(default=None, max_length=500)


class SetEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workout_session_id: str
    exercise_id: str
    set_number: int
    reps: int
    weight: int | None
    rpe: int | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class BodyMetricCreate(BaseModel):
    date: datetime
    weight: float | None = Field(default=None, ge=0)
    body_fat_pct: float | None = Field(default=None, ge=0, le=60)
    measurements: dict[str, object] = Field(default_factory=dict)


class BodyMetricPatch(BaseModel):
    date: datetime | None = None
    weight: float | None = Field(default=None, ge=0)
    body_fat_pct: float | None = Field(default=None, ge=0, le=60)
    measurements: dict[str, object] | None = None


class BodyMetricResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    date: datetime
    weight: float | None
    body_fat_pct: float | None
    measurements: dict[str, object]
    created_at: datetime
    updated_at: datetime


class GoalCreate(BaseModel):
    target_type: Literal["exercise_max", "exercise_reps", "body_metric"]
    exercise_id: str | None = Field(default=None)
    metric_key: str | None = Field(default=None)
    target_value: float = Field(gt=0)
    target_date: datetime | None = Field(default=None)


class GoalPatch(BaseModel):
    target_type: str | None = Field(default=None)
    exercise_id: str | None = Field(default=None)
    metric_key: str | None = Field(default=None)
    target_value: float | None = Field(default=None)
    target_date: datetime | None = Field(default=None)


class GoalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    target_type: str
    exercise_id: str | None
    metric_key: str | None
    target_value: float
    target_date: datetime | None
    current_value: float | None  # computed on read
    created_at: datetime
    updated_at: datetime


class ExerciseStats(BaseModel):
    exercise: ExerciseResponse
    personal_records: list[dict[str, object]]
    estimated_1rm: float | None
    volume_by_week: list[dict[str, object]]
    progression: list[dict[str, object]]


class BodyWeightStats(BaseModel):
    metrics: list[dict[str, object]]
    trend: float | None


# ── Helper Functions ────────────────────────────────────────────────────


async def _owned_goal(goal_id: str, user: User, session: AsyncSession) -> Goal:
    """Fetch a goal owned by the current user, or 404."""
    goal = await session.scalar(select(Goal).where(Goal.id == goal_id, Goal.user_id == user.id))
    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")
    return goal


async def _owned_exercise(exercise_id: str, user: User, session: AsyncSession) -> Exercise:
    """Fetch an exercise owned by the current user, or 404."""
    exercise = await session.scalar(
        select(Exercise).where(Exercise.id == exercise_id, Exercise.user_id == user.id)
    )
    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return exercise


async def _owned_workout_session(
    workout_session_id: str, user: User, session: AsyncSession
) -> WorkoutSession:
    ws = await session.scalar(
        select(WorkoutSession).where(
            WorkoutSession.id == workout_session_id, WorkoutSession.user_id == user.id
        )
    )
    if ws is None:
        raise HTTPException(status_code=404, detail="Workout session not found")
    return ws


async def _owned_body_metric(metric_id: str, user: User, session: AsyncSession) -> BodyMetric:
    metric = await session.scalar(
        select(BodyMetric).where(BodyMetric.id == metric_id, BodyMetric.user_id == user.id)
    )
    if metric is None:
        raise HTTPException(status_code=404, detail="Body metric not found")
    return metric


async def _find_or_create_fitness_calendar(user: User, session: AsyncSession) -> Calendar:
    """Find the 'Fitness' calendar for this user, or create one."""
    cal = await session.scalar(
        select(Calendar).where(
            Calendar.user_id == user.id,
            Calendar.name == "Fitness",
            Calendar.source == "local",
        )
    )
    if cal:
        return cal
    cal = Calendar(
        user_id=user.id,
        name="Fitness",
        color="#22d3ee",  # cyan — the app accent color
        is_visible=True,
        source="local",
    )
    session.add(cal)
    await session.flush()
    return cal


# ── Goals ──────────────────────────────────────────────────────────────


@router.get("/fitness/goals", response_model=list[GoalResponse])
async def list_goals(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[GoalResponse]:
    """List all goals for the current user, with computed current_value."""
    goals = (
        await session.scalars(
            select(Goal)
            .where(Goal.user_id == user.id)
            .order_by(Goal.target_type, Goal.created_at.desc())
        )
    ).all()

    result = []
    for goal in goals:
        current = None
        try:
            if goal.target_type == "exercise_max" and goal.exercise_id:
                # Max weight for this exercise
                row = await session.scalar(
                    select(func.max(SetEntry.weight)).where(
                        SetEntry.exercise_id == goal.exercise_id,
                        SetEntry.weight.isnot(None),
                    )
                )
                current = float(row) if row is not None else None
            elif goal.target_type == "exercise_reps" and goal.exercise_id:
                # Max reps for this exercise
                row = await session.scalar(
                    select(func.max(SetEntry.reps)).where(
                        SetEntry.exercise_id == goal.exercise_id,
                    )
                )
                current = float(row) if row is not None else None
            elif goal.target_type == "body_metric" and goal.metric_key:
                # Latest body metric value for the key
                if goal.metric_key == "weight":
                    metric = await session.scalar(
                        select(BodyMetric)
                        .where(
                            BodyMetric.user_id == user.id,
                            BodyMetric.weight.isnot(None),
                        )
                        .order_by(BodyMetric.date.desc())
                        .limit(1)
                    )
                    current = float(metric.weight) if metric and metric.weight is not None else None
        except Exception:
            current = None  # ponytail: fail gracefully

        result.append(
            GoalResponse(
                id=goal.id,
                target_type=goal.target_type,
                exercise_id=goal.exercise_id,
                metric_key=goal.metric_key,
                target_value=goal.target_value,
                target_date=goal.target_date,
                current_value=current,
                created_at=goal.created_at,
                updated_at=goal.updated_at,
            )
        )
    return result


@router.post("/fitness/goals", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
async def create_goal(
    data: GoalCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> GoalResponse:
    goal = Goal(
        user_id=user.id,
        target_type=data.target_type,
        exercise_id=data.exercise_id,
        metric_key=data.metric_key,
        target_value=data.target_value,
        target_date=data.target_date,
    )
    session.add(goal)
    await session.commit()
    await session.refresh(goal)
    return GoalResponse(
        id=goal.id,
        target_type=goal.target_type,
        exercise_id=goal.exercise_id,
        metric_key=goal.metric_key,
        target_value=goal.target_value,
        target_date=goal.target_date,
        current_value=None,
        created_at=goal.created_at,
        updated_at=goal.updated_at,
    )


@router.patch("/fitness/goals/{goal_id}", response_model=GoalResponse)
async def update_goal(
    goal_id: str,
    data: GoalPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> GoalResponse:
    goal = await _owned_goal(goal_id, user, session)
    for field in ("target_type", "exercise_id", "metric_key", "target_value", "target_date"):
        val = getattr(data, field, None)
        if val is not None:
            setattr(goal, field, val)
    await session.commit()
    await session.refresh(goal)
    return GoalResponse(
        id=goal.id,
        target_type=goal.target_type,
        exercise_id=goal.exercise_id,
        metric_key=goal.metric_key,
        target_value=goal.target_value,
        target_date=goal.target_date,
        current_value=None,
        created_at=goal.created_at,
        updated_at=goal.updated_at,
    )


@router.delete("/fitness/goals/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(
    goal_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> None:
    goal = await _owned_goal(goal_id, user, session)
    await session.delete(goal)
    await session.commit()


# ── Statistics ──────────────────────────────────────────────────────────


@router.get("/fitness/stats/exercise/{exercise_id}", response_model=ExerciseStats)
async def exercise_stats(
    exercise_id: str,
    days: int = Query(default=90, ge=7, le=730),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ExerciseStats:
    """PR history, estimated 1RM, weekly volume, and progression for an exercise."""
    exercise = await _owned_exercise(exercise_id, user, session)

    cutoff = datetime.now(UTC) - timedelta(days=days)

    # Single joined query — avoids N+1 on WorkoutSession lookups
    rows = (
        await session.execute(
            select(SetEntry, WorkoutSession.date)
            .join(WorkoutSession, SetEntry.workout_session_id == WorkoutSession.id)
            .where(
                SetEntry.exercise_id == exercise_id,
                WorkoutSession.user_id == user.id,
                WorkoutSession.date >= cutoff,
            )
            .order_by(WorkoutSession.date.asc(), SetEntry.set_number.asc())
        )
    ).all()

    # ── Personal records: max weight per rep count ──
    reps_map: dict[int, dict[str, object]] = {}
    for entry, date in rows:
        r = entry.reps or 0
        w = entry.weight or 0
        if r <= 0 or w <= 0:
            continue
        date_str = date.isoformat()[:10] if date else ""
        if r not in reps_map or w > float(reps_map[r].get("max_weight", 0)):  # type: ignore[arg-type]
            reps_map[r] = {"reps": r, "max_weight": w, "date": date_str}

    prs = sorted(reps_map.values(), key=lambda x: x["reps"])  # type: ignore[arg-type, return-value]

    # ── Estimated 1RM using Epley formula: weight × (1 + reps/30) ──
    best_1rm = None
    for entry, _ in rows:
        if not entry.weight or not entry.reps or entry.reps <= 0:
            continue
        epley = entry.weight * (1 + entry.reps / 30)
        if best_1rm is None or epley > best_1rm:
            best_1rm = round(epley, 1)

    # ── Volume by week ──
    week_map: dict[str, dict[str, object]] = {}
    session_weeks: dict[str, set[str]] = {}
    for entry, date in rows:
        if date is None:
            continue
        iso = date.isocalendar()
        week_key = f"{iso[0]}-W{iso[1]:02d}"
        if week_key not in week_map:
            week_map[week_key] = {"week": week_key, "total_volume": 0, "session_count": 0}
        vol = (entry.reps or 0) * (entry.weight or 0)
        week_map[week_key]["total_volume"] = (
            float(week_map[week_key].get("total_volume", 0)) + vol  # type: ignore[arg-type]
        )
        if week_key not in session_weeks:
            session_weeks[week_key] = set()
        session_weeks[week_key].add(entry.workout_session_id)

    for wk, sids in session_weeks.items():
        if wk in week_map:
            week_map[wk]["session_count"] = len(sids)

    volume_data = sorted(week_map.values(), key=lambda x: str(x["week"]))

    # ── Progression per day ──
    day_map: dict[str, dict[str, object]] = {}
    for entry, date in rows:
        if date is None:
            continue
        d = date.isoformat()[:10]
        if d not in day_map:
            day_map[d] = {"date": d, "max_weight": 0, "max_reps": 0}
        if (entry.weight or 0) > float(day_map[d].get("max_weight", 0)):  # type: ignore[arg-type]
            day_map[d]["max_weight"] = float(entry.weight or 0)
        if (entry.reps or 0) > int(day_map[d].get("max_reps", 0)):  # type: ignore[call-overload]
            day_map[d]["max_reps"] = int(entry.reps or 0)

    progression = sorted(day_map.values(), key=lambda x: str(x["date"]))

    return ExerciseStats(
        exercise=ExerciseResponse.model_validate(exercise),
        personal_records=prs,
        estimated_1rm=best_1rm,
        volume_by_week=volume_data,
        progression=progression,
    )


@router.get("/fitness/stats/body-weight", response_model=BodyWeightStats)
async def body_weight_stats(
    days: int = Query(default=90, ge=7, le=730),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> BodyWeightStats:
    """Body weight trend with 7-day moving average."""
    cutoff = datetime.now(UTC) - timedelta(days=days)

    metrics = (
        await session.scalars(
            select(BodyMetric)
            .where(
                BodyMetric.user_id == user.id,
                BodyMetric.date >= cutoff,
            )
            .order_by(BodyMetric.date.asc())
        )
    ).all()

    metric_list = [
        {
            "date": m.date.isoformat()[:10] if m.date else "",
            "weight": m.weight,
            "body_fat_pct": m.body_fat_pct,
        }
        for m in metrics
    ]

    # 7-day moving average
    trend = None
    weights = [m.weight for m in metrics if m.weight is not None]
    if len(weights) >= 7:
        trend = round(sum(weights[-7:]) / 7, 1)
    elif len(weights) > 0:
        trend = round(sum(weights) / len(weights), 1)

    return BodyWeightStats(metrics=metric_list, trend=trend)


# ── Exercise Endpoints ──────────────────────────────────────────────────


@router.get("/fitness/exercises", response_model=list[ExerciseResponse])
async def list_exercises(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[Exercise]:
    result = await session.scalars(
        select(Exercise)
        .where(Exercise.user_id == user.id)
        .order_by(Exercise.category, Exercise.name)
    )
    return list(result)


@router.post("/fitness/exercises", response_model=ExerciseResponse, status_code=201)
async def create_exercise(
    data: ExerciseCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Exercise:
    exercise = Exercise(user_id=user.id, name=data.name, category=data.category, unit=data.unit)
    session.add(exercise)
    await session.commit()
    await session.refresh(exercise)
    return exercise


@router.patch("/fitness/exercises/{exercise_id}", response_model=ExerciseResponse)
async def patch_exercise(
    exercise_id: str,
    data: ExercisePatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Exercise:
    exercise = await _owned_exercise(exercise_id, user, session)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(exercise, key, value)
    await session.commit()
    await session.refresh(exercise)
    return exercise


@router.delete("/fitness/exercises/{exercise_id}", status_code=204)
async def delete_exercise(
    exercise_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    exercise = await _owned_exercise(exercise_id, user, session)
    existing = await session.scalar(
        select(SetEntry).where(SetEntry.exercise_id == exercise.id).limit(1)
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="Exercise is used by set entries")
    await session.delete(exercise)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Workout Session Endpoints ───────────────────────────────────────────


@router.get("/fitness/sessions", response_model=list[SessionResponse])
async def list_sessions(
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[WorkoutSession]:
    query = select(WorkoutSession).where(WorkoutSession.user_id == user.id)
    if from_date is not None:
        query = query.where(WorkoutSession.date >= from_date)
    else:
        query = query.where(WorkoutSession.date >= datetime.now(UTC) - timedelta(days=30))
    if to_date is not None:
        query = query.where(WorkoutSession.date <= to_date)
    result = await session.scalars(
        query.order_by(WorkoutSession.date.desc(), WorkoutSession.created_at.desc())
    )
    return list(result)


@router.post("/fitness/sessions", response_model=SessionResponse, status_code=201)
async def create_session(
    data: SessionCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> WorkoutSession:
    ws = WorkoutSession(
        user_id=user.id,
        date=data.date,
        type=data.type,
        notes=data.notes or {},
    )
    session.add(ws)
    await session.flush()

    # ── Calendar integration ──
    fitness_cal = await _find_or_create_fitness_calendar(user, session)
    start_of_day = datetime(data.date.year, data.date.month, data.date.day, tzinfo=UTC)
    event = CalendarEvent(
        calendar_id=fitness_cal.id,
        title=f"Workout: {data.type}",
        start_at=start_of_day,
        end_at=start_of_day + timedelta(hours=1),
        created_by="system:fitness",
    )
    session.add(event)
    await session.flush()

    link = Link(
        source_type="event",
        source_id=event.id,
        target_type="workout_session",
        target_id=ws.id,
        relation="logged_from",
    )
    session.add(link)

    await session.commit()
    await session.refresh(ws)
    return ws


@router.get("/fitness/sessions/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> WorkoutSession:
    return await _owned_workout_session(session_id, user, session)


@router.patch("/fitness/sessions/{session_id}", response_model=SessionResponse)
async def patch_session(
    session_id: str,
    data: SessionPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> WorkoutSession:
    ws = await _owned_workout_session(session_id, user, session)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(ws, key, value)
    await session.commit()
    await session.refresh(ws)
    return ws


@router.delete("/fitness/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    ws = await _owned_workout_session(session_id, user, session)

    # Find and delete linked calendar event
    link = await session.scalar(
        select(Link).where(
            Link.source_type == "event",
            Link.target_type == "workout_session",
            Link.target_id == ws.id,
            Link.relation == "logged_from",
        )
    )
    if link is not None:
        await session.delete(link)
        event = await session.get(CalendarEvent, link.source_id)
        if event is not None:
            await session.delete(event)

    # Delete all set entries for this session
    await session.execute(delete(SetEntry).where(SetEntry.workout_session_id == ws.id))

    await session.delete(ws)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Set Entry Endpoints ─────────────────────────────────────────────────


@router.get("/fitness/sessions/{session_id}/sets", response_model=list[SetEntryResponse])
async def list_set_entries(
    session_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[SetEntry]:
    await _owned_workout_session(session_id, user, session)
    result = await session.scalars(
        select(SetEntry)
        .where(SetEntry.workout_session_id == session_id)
        .order_by(SetEntry.set_number)
    )
    return list(result)


@router.post(
    "/fitness/sessions/{session_id}/sets", response_model=SetEntryResponse, status_code=201
)
async def create_set_entry(
    session_id: str,
    data: SetEntryCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> SetEntry:
    await _owned_workout_session(session_id, user, session)
    await _owned_exercise(data.exercise_id, user, session)
    entry = SetEntry(
        workout_session_id=session_id,
        exercise_id=data.exercise_id,
        set_number=data.set_number,
        reps=data.reps,
        weight=data.weight,
        rpe=data.rpe,
        notes=data.notes,
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry


@router.patch("/fitness/sessions/{session_id}/sets/{set_id}", response_model=SetEntryResponse)
async def patch_set_entry(
    session_id: str,
    set_id: str,
    data: SetEntryPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> SetEntry:
    await _owned_workout_session(session_id, user, session)
    entry = await session.scalar(
        select(SetEntry).where(SetEntry.id == set_id, SetEntry.workout_session_id == session_id)
    )
    if entry is None:
        raise HTTPException(status_code=404, detail="Set entry not found")
    if data.exercise_id is not None:
        await _owned_exercise(data.exercise_id, user, session)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(entry, key, value)
    await session.commit()
    await session.refresh(entry)
    return entry


@router.delete("/fitness/sessions/{session_id}/sets/{set_id}", status_code=204)
async def delete_set_entry(
    session_id: str,
    set_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    await _owned_workout_session(session_id, user, session)
    entry = await session.scalar(
        select(SetEntry).where(SetEntry.id == set_id, SetEntry.workout_session_id == session_id)
    )
    if entry is None:
        raise HTTPException(status_code=404, detail="Set entry not found")
    await session.delete(entry)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Body Metric Endpoints ───────────────────────────────────────────────


@router.get("/fitness/body-metrics", response_model=list[BodyMetricResponse])
async def list_body_metrics(
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[BodyMetric]:
    query = select(BodyMetric).where(BodyMetric.user_id == user.id)
    if from_date is not None:
        query = query.where(BodyMetric.date >= from_date)
    else:
        query = query.where(BodyMetric.date >= datetime.now(UTC) - timedelta(days=90))
    if to_date is not None:
        query = query.where(BodyMetric.date <= to_date)
    result = await session.scalars(query.order_by(BodyMetric.date.desc()))
    return list(result)


@router.post("/fitness/body-metrics", response_model=BodyMetricResponse, status_code=201)
async def create_body_metric(
    data: BodyMetricCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> BodyMetric:
    metric = BodyMetric(
        user_id=user.id,
        date=data.date,
        weight=data.weight,
        body_fat_pct=data.body_fat_pct,
        measurements=data.measurements,
    )
    session.add(metric)
    await session.commit()
    await session.refresh(metric)
    return metric


@router.patch("/fitness/body-metrics/{metric_id}", response_model=BodyMetricResponse)
async def patch_body_metric(
    metric_id: str,
    data: BodyMetricPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> BodyMetric:
    metric = await _owned_body_metric(metric_id, user, session)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(metric, key, value)
    await session.commit()
    await session.refresh(metric)
    return metric


@router.delete("/fitness/body-metrics/{metric_id}", status_code=204)
async def delete_body_metric(
    metric_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    metric = await _owned_body_metric(metric_id, user, session)
    await session.delete(metric)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
