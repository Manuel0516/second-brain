"""Google Calendar sync — OAuth token exchange, pull (incremental) and push.

Tokens are stored per synced calendar (Fernet-encrypted, see security.py).
Pull uses Google's incremental sync tokens with singleEvents=true, so recurring
Google events arrive pre-expanded and are stored as individual rows. Push (for
sync_direction="push") writes locally created/updated events back to Google.
"""

import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Calendar, CalendarEvent
from app.security import decrypt_google_token

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_API = "https://www.googleapis.com/calendar/v3"
SCOPE = "https://www.googleapis.com/auth/calendar"

# Full (non-incremental) pulls are windowed; incremental syncs cover everything.
FULL_SYNC_LOOKBACK_DAYS = 365
# Safety valve against infinite pagination only — a full pull of a busy calendar
# needs to finish (250 events/page), otherwise no nextSyncToken is ever stored.
MAX_PAGES = 400


class GoogleSyncError(Exception):
    """Raised when talking to Google fails in a way the caller should surface."""


def is_configured() -> bool:
    settings = get_settings()
    return bool(
        settings.google_client_id
        and settings.google_client_secret
        and settings.google_token_encryption_key
    )


def build_auth_url(state: str) -> str:
    settings = get_settings()
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def exchange_code(code: str) -> str:
    """Exchange an OAuth authorization code for a refresh token."""
    settings = get_settings()
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
    if response.status_code != 200:
        raise GoogleSyncError("Google token exchange failed")
    refresh_token = response.json().get("refresh_token")
    if not refresh_token:
        raise GoogleSyncError("Google did not return a refresh token")
    return str(refresh_token)


async def get_access_token(refresh_token: str) -> str:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "refresh_token": refresh_token,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "grant_type": "refresh_token",
            },
        )
    if response.status_code != 200:
        raise GoogleSyncError("Google token refresh failed — reconnect Google")
    return str(response.json()["access_token"])


async def list_remote_calendars(access_token: str) -> list[dict[str, Any]]:
    """The user's Google calendar list: id, name, color, primary flag."""
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            f"{GOOGLE_API}/users/me/calendarList",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"maxResults": 250},
        )
    if response.status_code != 200:
        raise GoogleSyncError("Could not list Google calendars")
    items = response.json().get("items", [])
    return [
        {
            "id": item["id"],
            "name": item.get("summary", "(unnamed)"),
            "color": _normalize_color(item.get("backgroundColor")),
            "primary": bool(item.get("primary")),
        }
        for item in items
    ]


def _normalize_color(value: str | None) -> str:
    if value and len(value) == 7 and value.startswith("#"):
        return value
    return "#4285F4"


def _parse_gdt(value: dict[str, Any] | None) -> tuple[datetime | None, bool]:
    """Google start/end object -> (datetime, all_day)."""
    if not value:
        return None, False
    if "dateTime" in value:
        return datetime.fromisoformat(value["dateTime"].replace("Z", "+00:00")), False
    if "date" in value:
        return datetime.fromisoformat(value["date"]).replace(tzinfo=UTC), True
    return None, False


def _event_key(item: dict[str, Any]) -> str:
    """Stable id for an expanded instance (id already unique per instance)."""
    return str(item["id"])


def _apply_remote(event: CalendarEvent, item: dict[str, Any], now: datetime) -> bool:
    """Copy Google fields onto a local row. Returns False if times are unusable."""
    start_at, all_day = _parse_gdt(item.get("start"))
    end_at, _ = _parse_gdt(item.get("end"))
    if start_at is None or end_at is None or end_at <= start_at:
        return False
    event.title = (item.get("summary") or "(no title)")[:255]
    event.description = item.get("description")
    event.location = (item.get("location") or None) and str(item["location"])[:255]
    event.link = (item.get("htmlLink") or None) and str(item["htmlLink"])[:2048]
    event.start_at = start_at
    event.end_at = end_at
    event.all_day = all_day
    event.timezone = (item.get("start") or {}).get("timeZone") or "UTC"
    event.google_etag = item.get("etag")
    event.source = "google"
    event.created_by = "sync"
    event.last_synced_at = now
    return True


def _push_body(event: CalendarEvent) -> dict[str, Any]:
    if event.all_day:
        start: dict[str, Any] = {"date": event.start_at.date().isoformat()}
        end: dict[str, Any] = {"date": event.end_at.date().isoformat()}
    else:
        start = {"dateTime": event.start_at.isoformat(), "timeZone": event.timezone or "UTC"}
        end = {"dateTime": event.end_at.isoformat(), "timeZone": event.timezone or "UTC"}
    return {
        "summary": event.title,
        "description": event.description or "",
        "location": event.location or "",
        "start": start,
        "end": end,
    }


async def _push_local_changes(
    session: AsyncSession, calendar: Calendar, access_token: str, now: datetime
) -> int:
    """Write locally created/edited events to Google (sync_direction="push").

    Only rows with source="user" are pushed; rows mirrored from Google keep
    Google as their source of truth. Local deletes are not tombstoned, so they
    are not propagated — documented limitation.
    """
    pushed = 0
    headers = {"Authorization": f"Bearer {access_token}"}
    rows = await session.scalars(
        select(CalendarEvent).where(
            CalendarEvent.calendar_id == calendar.id,
            CalendarEvent.source == "user",
            CalendarEvent.rrule.is_(None),  # recurring local events are not pushed
        )
    )
    async with httpx.AsyncClient(timeout=15) as client:
        for event in rows:
            needs_update = (
                event.external_id is not None
                and event.last_synced_at is not None
                and event.updated_at > event.last_synced_at
            )
            if event.external_id is None:
                response = await client.post(
                    f"{GOOGLE_API}/calendars/{calendar.google_calendar_id}/events",
                    headers=headers,
                    json=_push_body(event),
                )
                if response.status_code == 200:
                    event.external_id = response.json()["id"]
                    event.google_etag = response.json().get("etag")
                    event.last_synced_at = now
                    pushed += 1
            elif needs_update:
                response = await client.patch(
                    f"{GOOGLE_API}/calendars/{calendar.google_calendar_id}"
                    f"/events/{event.external_id}",
                    headers=headers,
                    json=_push_body(event),
                )
                if response.status_code == 200:
                    event.google_etag = response.json().get("etag")
                    event.last_synced_at = now
                    pushed += 1
    return pushed


async def sync_calendar(session: AsyncSession, calendar: Calendar) -> dict[str, int]:
    """Pull remote changes into a Google-backed calendar (and push if two-way).

    Incremental when a sync token is stored; falls back to a windowed full pull
    when the token is missing or expired (HTTP 410).
    """
    if calendar.source != "google" or not calendar.google_calendar_id:
        raise GoogleSyncError("Not a Google calendar")
    refresh_token = decrypt_google_token(calendar.google_refresh_token or "")
    if not refresh_token:
        raise GoogleSyncError("Stored Google token is invalid — reconnect Google")
    access_token = await get_access_token(refresh_token)
    now = datetime.now(UTC)

    pushed = 0
    if calendar.sync_direction == "push":
        pushed = await _push_local_changes(session, calendar, access_token, now)

    headers = {"Authorization": f"Bearer {access_token}"}
    base_params: dict[str, Any] = {"singleEvents": "true", "maxResults": 250}
    if calendar.sync_token:
        query_params = {**base_params, "syncToken": calendar.sync_token}
    else:
        time_min = (now - timedelta(days=FULL_SYNC_LOOKBACK_DAYS)).isoformat()
        query_params = {**base_params, "timeMin": time_min}
    params = query_params

    created = updated = deleted = 0
    next_sync_token: str | None = None
    url = f"{GOOGLE_API}/calendars/{calendar.google_calendar_id}/events"

    existing_rows = await session.scalars(
        select(CalendarEvent).where(
            CalendarEvent.calendar_id == calendar.id,
            CalendarEvent.external_id.is_not(None),
        )
    )
    by_external = {e.external_id: e for e in existing_rows}

    async with httpx.AsyncClient(timeout=30) as client:
        for _ in range(MAX_PAGES):
            response = await client.get(url, headers=headers, params=params)
            if response.status_code == 410:
                # Sync token expired: wipe mirrored rows and restart with a full pull.
                calendar.sync_token = None
                await session.execute(
                    delete(CalendarEvent).where(
                        CalendarEvent.calendar_id == calendar.id,
                        CalendarEvent.source == "google",
                    )
                )
                await session.flush()
                by_external = {k: v for k, v in by_external.items() if v.source != "google"}
                time_min = (now - timedelta(days=FULL_SYNC_LOOKBACK_DAYS)).isoformat()
                query_params = {**base_params, "timeMin": time_min}
                params = query_params
                deleted = 0
                continue
            if response.status_code != 200:
                raise GoogleSyncError("Google events request failed")
            payload = response.json()
            for item in payload.get("items", []):
                key = _event_key(item)
                if item.get("status") == "cancelled":
                    row = by_external.pop(key, None)
                    if row is not None and row.source == "google":
                        await session.delete(row)
                        deleted += 1
                    continue
                row = by_external.get(key)
                if row is None:
                    row = CalendarEvent(calendar_id=calendar.id, external_id=key)
                    if _apply_remote(row, item, now):
                        session.add(row)
                        by_external[key] = row
                        created += 1
                elif row.source == "google" and _apply_remote(row, item, now):
                    updated += 1
            if payload.get("nextPageToken"):
                # Google requires the original query params alongside pageToken;
                # dropping timeMin here silently widened the pull to all history.
                params = {**query_params, "pageToken": payload["nextPageToken"]}
                continue
            next_sync_token = payload.get("nextSyncToken")
            break
        else:
            # Loop exhausted MAX_PAGES without a nextSyncToken: the snapshot is
            # incomplete. Abort instead of committing a truncated mirror.
            raise GoogleSyncError(
                f"Google pull for calendar {calendar.id} exceeded {MAX_PAGES} pages"
            )

    if next_sync_token:
        calendar.sync_token = next_sync_token
    calendar.last_synced_at = now
    await session.commit()
    return {"created": created, "updated": updated, "deleted": deleted, "pushed": pushed}


def fingerprint(value: str) -> str:
    """Short stable id for values that need to fit external_id (255 chars)."""
    return hashlib.sha256(value.encode()).hexdigest()
