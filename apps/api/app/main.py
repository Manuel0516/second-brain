import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.exc import SQLAlchemyError

from app.config import get_settings
from app.database import async_session_factory, check_database
from app.models import Calendar, LoginAttempt, User
from app.routes import (
    admin,
    auth,
    calendar,
    databases,
    files,
    fitness,
    food,
    integrations,
    notes,
    settings,
)
from app.security import hash_password
from app.services import google_sync, ics_sync

logger = logging.getLogger(__name__)


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"


class ReadinessResponse(BaseModel):
    status: Literal["ready"] = "ready"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan: runs startup and shutdown tasks."""
    settings = get_settings()

    # ── Prod config guard ──────────────────────────────────────────────
    if settings.environment == "prod":
        issues: list[str] = []
        key = settings.jwt_secret_key
        if key == "your-secret-key-change-in-production":
            issues.append("jwt_secret_key is still the default value")
        elif len(key) < 32:
            issues.append("jwt_secret_key must be at least 32 characters long")

        if settings.initial_user_password == "changeme":
            issues.append("initial_user_password is still the default ('changeme')")

        db = settings.database_url
        if "localhost" in db or "127.0.0.1" in db:
            issues.append("database_url still points to localhost — must use a production database")

        if issues:
            msg = "Production configuration errors:\n  - " + "\n  - ".join(issues)
            raise RuntimeError(msg)

    # ── Startup tasks ──────────────────────────────────────────────────
    await ensure_initial_user()
    await cleanup_old_login_attempts()

    poller = asyncio.create_task(calendar_sync_loop())
    try:
        yield
    finally:
        poller.cancel()


app = FastAPI(title="Second Brain API", version="0.1.0", lifespan=lifespan)

# Include routers
app.include_router(auth.router)
app.include_router(calendar.router)
app.include_router(notes.router)
app.include_router(databases.router)
app.include_router(settings.router)
app.include_router(files.router)
app.include_router(fitness.router)
app.include_router(food.router)
app.include_router(admin.router)
app.include_router(integrations.router)


# ── Security headers middleware ─────────────────────────────────────────
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next: Any) -> Response:
    response: Response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse()


@app.get(
    "/api/ready",
    response_model=ReadinessResponse,
    responses={status.HTTP_503_SERVICE_UNAVAILABLE: {"description": "Database unavailable"}},
)
async def ready() -> ReadinessResponse:
    try:
        await check_database()
    except SQLAlchemyError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service unavailable",
        ) from error
    return ReadinessResponse()


async def ensure_initial_user() -> None:
    """Create initial user if no users exist."""
    async with async_session_factory() as session:
        result = await session.execute(select(User).limit(1))
        existing_user = result.scalar_one_or_none()

        if existing_user:
            return

        settings = get_settings()

        # Create initial user
        user = User(
            username=settings.initial_user_username,
            email=settings.initial_user_email,
            password_hash=hash_password(settings.initial_user_password),
            is_active=True,
            role="admin",
        )
        session.add(user)
        await session.flush()

        # Seed calendars
        default_calendar = Calendar(
            user_id=user.id,
            name="Default",
            color="#8B5CF6",  # Plum
            is_visible=True,
        )
        personal_calendar = Calendar(
            user_id=user.id,
            name="Personal",
            color="#FF6B35",  # Orange
            is_visible=True,
        )
        work_calendar = Calendar(
            user_id=user.id,
            name="Work",
            color="#004E89",  # Blue
            is_visible=True,
        )
        session.add_all([default_calendar, personal_calendar, work_calendar])

        await session.commit()


async def sync_due_calendars() -> None:
    """One polling pass: sync every Google/ICS calendar whose interval elapsed."""
    interval = get_settings().calendar_sync_interval_minutes
    cutoff = datetime.now(UTC) - timedelta(minutes=interval)
    async with async_session_factory() as session:
        due = await session.scalars(
            select(Calendar).where(
                Calendar.source.in_(["google", "ics"]),
                or_(Calendar.last_synced_at.is_(None), Calendar.last_synced_at < cutoff),
            )
        )
        for cal in due:
            try:
                if cal.source == "google":
                    await google_sync.sync_calendar(session, cal)
                else:
                    await ics_sync.sync_calendar(session, cal)
            except (google_sync.GoogleSyncError, ics_sync.IcsSyncError) as error:
                logger.warning("Calendar sync failed for %s: %s", cal.id, error)
                await session.rollback()


async def calendar_sync_loop() -> None:
    """Background poller for Google/ICS calendar sync. Cancelled on shutdown."""
    while True:
        await asyncio.sleep(60)
        try:
            await sync_due_calendars()
        except Exception:  # noqa: BLE001 — the loop must survive any sync error
            logger.exception("Calendar sync pass failed")


async def cleanup_old_login_attempts() -> None:
    """Clean up login attempts older than 30 days."""
    async with async_session_factory() as session:
        cutoff_date = datetime.now(UTC) - timedelta(days=30)
        result = await session.execute(
            select(LoginAttempt).where(LoginAttempt.attempted_at < cutoff_date)
        )
        old_attempts = result.scalars().all()

        for attempt in old_attempts:
            await session.delete(attempt)

        await session.commit()
