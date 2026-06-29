from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.config import get_settings
from app.database import async_session_factory, check_database
from app.models import Calendar, LoginAttempt, User
from app.routes import auth, calendar, settings
from app.security import hash_password


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"


class ReadinessResponse(BaseModel):
    status: Literal["ready"] = "ready"


app = FastAPI(title="Second Brain API", version="0.1.0")

# Include routers
app.include_router(auth.router)
app.include_router(calendar.router)
app.include_router(settings.router)


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


@app.on_event("startup")
async def startup() -> None:
    """Run startup tasks."""
    await ensure_initial_user()
    await cleanup_old_login_attempts()
