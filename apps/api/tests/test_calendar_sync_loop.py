from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app import main
from app.models import Calendar, User
from app.services import google_sync, ics_sync

pytestmark = pytest.mark.anyio


async def test_failed_calendar_sync_does_not_expire_the_next_calendar(
    test_engine: AsyncEngine,
    test_db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    google = Calendar(
        id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
        user_id=test_user.id,
        name="Broken Google",
        color="#123456",
        source="google",
        google_calendar_id="remote-google",
    )
    ics = Calendar(
        id="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2",
        user_id=test_user.id,
        name="Working ICS",
        color="#654321",
        source="ics",
        ics_url="https://example.com/calendar.ics",
    )
    test_db_session.add_all([google, ics])
    await test_db_session.commit()

    factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(main, "async_session_factory", factory)
    synced: list[str] = []

    async def fail_google(_session: AsyncSession, calendar: Calendar) -> dict[str, int]:
        synced.append(calendar.id)
        raise google_sync.GoogleSyncError("expected failure")

    async def sync_ics(session: AsyncSession, calendar: Calendar) -> dict[str, int]:
        synced.append(calendar.id)
        calendar.last_synced_at = datetime.now(UTC)
        await session.commit()
        return {"created": 0, "updated": 0, "deleted": 0, "pushed": 0}

    monkeypatch.setattr(google_sync, "sync_calendar", fail_google)
    monkeypatch.setattr(ics_sync, "sync_calendar", sync_ics)

    await main.sync_due_calendars()

    assert synced == [google.id, ics.id]
