"""Calendar integrations: Google OAuth + calendar sync, ICS subscriptions.

The OAuth callback is browser-driven (no Authorization header), so identity
travels in the signed `state` JWT. The exchanged refresh token is parked in an
in-memory pending store until the user picks which calendars to sync; it is
persisted (Fernet-encrypted) on each created Calendar row.
"""

from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field, HttpUrl, field_validator
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_async_session
from app.dependencies import get_current_user
from app.models import Calendar, CalendarEvent, User
from app.routes.calendar import HEX, _delete_event_links, owned_calendar
from app.security import decode_jwt, encrypt_google_token, generate_jwt
from app.services import google_sync, ics_sync

router = APIRouter(prefix="/api/integrations", tags=["integrations"])

# user_id -> (refresh_token, expires_at). Single-process app; a restart just
# means the user re-runs the connect flow.
_pending_tokens: dict[str, tuple[str, datetime]] = {}
PENDING_TTL_MINUTES = 10


def _stash_pending(user_id: str, refresh_token: str) -> None:
    now = datetime.now(UTC)
    expired = [uid for uid, (_, exp) in _pending_tokens.items() if exp < now]
    for uid in expired:
        del _pending_tokens[uid]
    _pending_tokens[user_id] = (refresh_token, now + timedelta(minutes=PENDING_TTL_MINUTES))


def _pending_token(user_id: str) -> str | None:
    entry = _pending_tokens.get(user_id)
    if entry is None or entry[1] < datetime.now(UTC):
        _pending_tokens.pop(user_id, None)
        return None
    return entry[0]


async def _google_calendars(session: AsyncSession, user: User) -> list[Calendar]:
    rows = await session.scalars(
        select(Calendar).where(Calendar.user_id == user.id, Calendar.source == "google")
    )
    return list(rows)


async def _refresh_token_for(session: AsyncSession, user: User) -> str | None:
    """A usable refresh token: pending from a fresh connect, else a stored one."""
    pending = _pending_token(user.id)
    if pending:
        return pending
    from app.security import decrypt_google_token

    for calendar in await _google_calendars(session, user):
        token = decrypt_google_token(calendar.google_refresh_token or "")
        if token:
            return token
    return None


def _frontend_redirect(**params: str) -> RedirectResponse:
    settings = get_settings()
    query = urlencode(params)
    return RedirectResponse(
        url=f"{settings.frontend_url}/settings?{query}", status_code=status.HTTP_303_SEE_OTHER
    )


# ── Schemas ──────────────────────────────────────────────────────────────


class ConnectResponse(BaseModel):
    auth_url: str


class GoogleStatusResponse(BaseModel):
    configured: bool
    connected: bool
    pending: bool
    calendar_count: int


class RemoteCalendar(BaseModel):
    id: str
    name: str
    color: str
    primary: bool
    already_synced: bool


class GoogleCalendarPick(BaseModel):
    id: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=255)
    color: str = Field(pattern=HEX)


class AddGoogleCalendars(BaseModel):
    calendars: list[GoogleCalendarPick] = Field(min_length=1, max_length=50)
    sync_direction: str = Field(default="pull", pattern="^(pull|push)$")


class SyncDirectionPatch(BaseModel):
    sync_direction: str = Field(pattern="^(pull|push)$")


class AddIcsCalendar(BaseModel):
    url: HttpUrl
    name: str = Field(min_length=1, max_length=255)
    color: str = Field(pattern=HEX)

    @field_validator("name")
    @classmethod
    def non_empty_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("name must not be blank")
        return value.strip()


class SyncResult(BaseModel):
    created: int
    updated: int
    deleted: int
    pushed: int
    last_synced_at: datetime | None


class SyncedCalendarResponse(BaseModel):
    id: str
    name: str
    color: str
    is_visible: bool
    source: str
    sync_direction: str
    ics_url: str | None
    google_calendar_id: str | None
    last_synced_at: datetime | None


def _synced_response(calendar: Calendar) -> SyncedCalendarResponse:
    return SyncedCalendarResponse(
        id=calendar.id,
        name=calendar.name,
        color=calendar.color,
        is_visible=calendar.is_visible,
        source=calendar.source,
        sync_direction=calendar.sync_direction,
        ics_url=calendar.ics_url,
        google_calendar_id=calendar.google_calendar_id,
        last_synced_at=calendar.last_synced_at,
    )


# ── Google OAuth flow ────────────────────────────────────────────────────


@router.post("/google/connect", response_model=ConnectResponse)
async def google_connect(user: User = Depends(get_current_user)) -> ConnectResponse:
    if not google_sync.is_configured():
        raise HTTPException(status_code=503, detail="Google integration is not configured")
    state = generate_jwt(user.id, "google_oauth", expires_in_minutes=10)
    return ConnectResponse(auth_url=google_sync.build_auth_url(state))


@router.get("/google/callback", include_in_schema=False)
async def google_callback(state: str = "", code: str = "", error: str = "") -> RedirectResponse:
    payload = decode_jwt(state)
    if payload.get("type") != "google_oauth" or not payload.get("user_id"):
        return _frontend_redirect(google="error", reason="invalid_state")
    if error or not code:
        return _frontend_redirect(google="error", reason=error or "missing_code")
    try:
        refresh_token = await google_sync.exchange_code(code)
    except google_sync.GoogleSyncError:
        return _frontend_redirect(google="error", reason="token_exchange_failed")
    _stash_pending(payload["user_id"], refresh_token)
    return _frontend_redirect(google="connected")


@router.get("/google/status", response_model=GoogleStatusResponse)
async def google_status(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> GoogleStatusResponse:
    calendars = await _google_calendars(session, user)
    return GoogleStatusResponse(
        configured=google_sync.is_configured(),
        connected=bool(calendars) or _pending_token(user.id) is not None,
        pending=_pending_token(user.id) is not None,
        calendar_count=len(calendars),
    )


@router.get("/google/calendars", response_model=list[RemoteCalendar])
async def list_google_calendars(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[RemoteCalendar]:
    refresh_token = await _refresh_token_for(session, user)
    if refresh_token is None:
        raise HTTPException(status_code=409, detail="Google account is not connected")
    try:
        access_token = await google_sync.get_access_token(refresh_token)
        remote = await google_sync.list_remote_calendars(access_token)
    except google_sync.GoogleSyncError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    synced_ids = {c.google_calendar_id for c in await _google_calendars(session, user)}
    return [RemoteCalendar(**item, already_synced=item["id"] in synced_ids) for item in remote]


@router.post("/google/calendars", response_model=list[SyncedCalendarResponse], status_code=201)
async def add_google_calendars(
    data: AddGoogleCalendars,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[SyncedCalendarResponse]:
    refresh_token = await _refresh_token_for(session, user)
    if refresh_token is None:
        raise HTTPException(status_code=409, detail="Google account is not connected")
    synced_ids = {c.google_calendar_id for c in await _google_calendars(session, user)}
    encrypted = encrypt_google_token(refresh_token)
    created: list[Calendar] = []
    for pick in data.calendars:
        if pick.id in synced_ids:
            continue
        calendar = Calendar(
            user_id=user.id,
            name=pick.name.strip(),
            color=pick.color,
            is_visible=True,
            source="google",
            google_calendar_id=pick.id,
            google_refresh_token=encrypted,
            sync_direction=data.sync_direction,
        )
        session.add(calendar)
        created.append(calendar)
    if not created:
        raise HTTPException(status_code=409, detail="All selected calendars are already synced")
    await session.commit()
    for calendar in created:
        await session.refresh(calendar)
        try:
            await google_sync.sync_calendar(session, calendar)
        except google_sync.GoogleSyncError:
            pass  # initial sync is best-effort; the poller retries
    return [_synced_response(calendar) for calendar in created]


@router.post("/google/disconnect", status_code=204)
async def google_disconnect(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    """Remove all Google calendars, their mirrored events, and pending tokens."""
    _pending_tokens.pop(user.id, None)
    for calendar in await _google_calendars(session, user):
        event_ids = list(
            await session.scalars(
                select(CalendarEvent.id).where(CalendarEvent.calendar_id == calendar.id)
            )
        )
        await _delete_event_links(session, event_ids)
        await session.execute(delete(CalendarEvent).where(CalendarEvent.calendar_id == calendar.id))
        await session.delete(calendar)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── ICS subscriptions ────────────────────────────────────────────────────


@router.post("/ics", response_model=SyncedCalendarResponse, status_code=201)
async def add_ics_calendar(
    data: AddIcsCalendar,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> SyncedCalendarResponse:
    url = str(data.url)
    existing = await session.scalar(
        select(Calendar).where(Calendar.user_id == user.id, Calendar.ics_url == url)
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="This ICS feed is already subscribed")
    # Validate the feed before persisting anything.
    try:
        ics_sync.parse_events(await ics_sync.fetch_feed(url))
    except ics_sync.IcsSyncError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    calendar = Calendar(
        user_id=user.id,
        name=data.name,
        color=data.color,
        is_visible=True,
        source="ics",
        ics_url=url,
    )
    session.add(calendar)
    await session.commit()
    await session.refresh(calendar)
    try:
        await ics_sync.sync_calendar(session, calendar)
    except ics_sync.IcsSyncError:
        pass  # poller retries
    await session.refresh(calendar)
    return _synced_response(calendar)


# ── Shared synced-calendar management ────────────────────────────────────


@router.post("/calendars/{calendar_id}/sync", response_model=SyncResult)
async def sync_now(
    calendar_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> SyncResult:
    calendar = await owned_calendar(calendar_id, user, session)
    try:
        if calendar.source == "google":
            counts = await google_sync.sync_calendar(session, calendar)
        elif calendar.source == "ics":
            counts = await ics_sync.sync_calendar(session, calendar)
        else:
            raise HTTPException(status_code=409, detail="Calendar is not synced")
    except (google_sync.GoogleSyncError, ics_sync.IcsSyncError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return SyncResult(**counts, last_synced_at=calendar.last_synced_at)


@router.patch("/calendars/{calendar_id}", response_model=SyncedCalendarResponse)
async def patch_synced_calendar(
    calendar_id: str,
    data: SyncDirectionPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> SyncedCalendarResponse:
    calendar = await owned_calendar(calendar_id, user, session)
    if calendar.source != "google":
        raise HTTPException(status_code=409, detail="Only Google calendars support two-way sync")
    calendar.sync_direction = data.sync_direction
    await session.commit()
    await session.refresh(calendar)
    return _synced_response(calendar)


@router.delete("/calendars/{calendar_id}", status_code=204)
async def remove_synced_calendar(
    calendar_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    """Unsubscribe a synced calendar and drop its mirrored events."""
    calendar = await owned_calendar(calendar_id, user, session)
    if calendar.source == "local":
        raise HTTPException(status_code=409, detail="Use the calendar API for local calendars")
    event_ids = list(
        await session.scalars(
            select(CalendarEvent.id).where(CalendarEvent.calendar_id == calendar.id)
        )
    )
    await _delete_event_links(session, event_ids)
    await session.execute(delete(CalendarEvent).where(CalendarEvent.calendar_id == calendar.id))
    await session.delete(calendar)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
