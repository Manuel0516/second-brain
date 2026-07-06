"""ICS feed subscriptions — fetch, parse, and mirror into a read-only calendar.

No parser dependency: the subset of RFC 5545 we consume (VEVENT with
DTSTART/DTEND/SUMMARY/DESCRIPTION/LOCATION/UID and simple RRULEs) is small
enough to unfold and split by hand. Feeds are replace-style: events present
locally but missing from the feed are removed on each sync.
"""

from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Calendar, CalendarEvent
from app.services.google_sync import fingerprint

MAX_FEED_BYTES = 5 * 1024 * 1024
MAX_EVENTS = 2000
FREQUENCIES = {"DAILY", "WEEKLY", "MONTHLY", "YEARLY"}
WEEKDAYS = {"MO", "TU", "WE", "TH", "FR", "SA", "SU"}


class IcsSyncError(Exception):
    """Raised when an ICS feed cannot be fetched or parsed."""


async def fetch_feed(url: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            response = await client.get(url)
    except httpx.HTTPError as error:
        raise IcsSyncError("Could not fetch ICS feed") from error
    if response.status_code != 200:
        raise IcsSyncError(f"ICS feed returned HTTP {response.status_code}")
    if len(response.content) > MAX_FEED_BYTES:
        raise IcsSyncError("ICS feed is too large")
    text = response.text
    if "BEGIN:VCALENDAR" not in text:
        raise IcsSyncError("URL does not look like an ICS feed")
    return text


def _unfold(text: str) -> list[str]:
    """RFC 5545 line unfolding: a line starting with space/tab continues the previous."""
    lines: list[str] = []
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw[:1] in (" ", "\t") and lines:
            lines[-1] += raw[1:]
        elif raw:
            lines.append(raw)
    return lines


def _split_prop(line: str) -> tuple[str, dict[str, str], str] | None:
    """ "DTSTART;TZID=Europe/Stockholm:20250101T100000" -> (name, params, value)."""
    head, sep, value = line.partition(":")
    if not sep:
        return None
    parts = head.split(";")
    name = parts[0].upper()
    params: dict[str, str] = {}
    for param in parts[1:]:
        key, _, val = param.partition("=")
        params[key.upper()] = val
    return name, params, value


def _unescape(value: str) -> str:
    return (
        value.replace("\\n", "\n")
        .replace("\\N", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
    )


def _parse_dt(value: str, params: dict[str, str]) -> tuple[datetime | None, bool]:
    """ICS date/date-time -> (aware datetime, all_day)."""
    value = value.strip()
    if params.get("VALUE") == "DATE" or (len(value) == 8 and value.isdigit()):
        try:
            day = datetime.strptime(value, "%Y%m%d").replace(tzinfo=UTC)
        except ValueError:
            return None, False
        return day, True
    utc = value.endswith("Z")
    raw = value.rstrip("Z")
    try:
        parsed = datetime.strptime(raw, "%Y%m%dT%H%M%S")
    except ValueError:
        return None, False
    if utc:
        return parsed.replace(tzinfo=UTC), False
    tzid = params.get("TZID")
    if tzid:
        try:
            return parsed.replace(tzinfo=ZoneInfo(tzid)), False
        except ZoneInfoNotFoundError:
            pass
    return parsed.replace(tzinfo=UTC), False


def _parse_rrule(value: str) -> dict[str, Any]:
    """Map simple RRULEs onto the local recurrence model; skip anything exotic."""
    fields: dict[str, str] = {}
    for chunk in value.split(";"):
        key, _, val = chunk.partition("=")
        fields[key.upper()] = val
    freq = fields.get("FREQ", "").upper()
    if freq not in FREQUENCIES:
        return {}
    out: dict[str, Any] = {"rrule": freq}
    try:
        out["recurrence_interval"] = max(1, min(365, int(fields.get("INTERVAL", "1"))))
    except ValueError:
        out["recurrence_interval"] = 1
    byday = [d for d in fields.get("BYDAY", "").split(",") if d in WEEKDAYS]
    out["recurrence_byday"] = byday
    if "COUNT" in fields:
        try:
            out["recurrence_count"] = max(1, min(730, int(fields["COUNT"])))
        except ValueError:
            pass
    elif "UNTIL" in fields:
        until, _ = _parse_dt(fields["UNTIL"], {})
        if until:
            out["recurrence_until"] = until
    return out


def parse_events(text: str) -> list[dict[str, Any]]:
    """VEVENT blocks -> dicts matching CalendarEvent columns."""
    events: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for line in _unfold(text):
        upper = line.upper()
        if upper == "BEGIN:VEVENT":
            current = {}
            continue
        if upper == "END:VEVENT":
            if current is not None and _finalize(current):
                events.append(current)
                if len(events) >= MAX_EVENTS:
                    break
            current = None
            continue
        if current is None:
            continue
        prop = _split_prop(line)
        if prop is None:
            continue
        name, params, value = prop
        if name == "UID":
            current["external_id"] = value.strip()[:255]
        elif name == "SUMMARY":
            current["title"] = _unescape(value).strip()[:255] or "(no title)"
        elif name == "DESCRIPTION":
            current["description"] = _unescape(value) or None
        elif name == "LOCATION":
            current["location"] = _unescape(value).strip()[:255] or None
        elif name == "URL":
            current["link"] = value.strip()[:2048] or None
        elif name == "DTSTART":
            current["start_at"], current["all_day"] = _parse_dt(value, params)
            current["timezone"] = params.get("TZID", "UTC")
        elif name == "DTEND":
            current["end_at"], _ = _parse_dt(value, params)
        elif name == "RRULE":
            current.update(_parse_rrule(value))
    return events


def _finalize(event: dict[str, Any]) -> bool:
    """Fill defaults and reject events without usable times."""
    start = event.get("start_at")
    if start is None:
        return False
    if event.get("end_at") is None:
        default_span = timedelta(days=1) if event.get("all_day") else timedelta(hours=1)
        event["end_at"] = start + default_span
    if event["end_at"] <= start:
        event["end_at"] = start + timedelta(hours=1)
    event.setdefault("title", "(no title)")
    event.setdefault("all_day", False)
    event.setdefault("timezone", "UTC")
    if not event.get("external_id"):
        event["external_id"] = fingerprint(f"{event['title']}|{start.isoformat()}")
    return True


async def sync_calendar(session: AsyncSession, calendar: Calendar) -> dict[str, int]:
    """Mirror the feed into the calendar: upsert by UID, remove missing rows."""
    if calendar.source != "ics" or not calendar.ics_url:
        raise IcsSyncError("Not an ICS calendar")
    text = await fetch_feed(calendar.ics_url)
    remote = parse_events(text)
    now = datetime.now(UTC)

    rows = await session.scalars(
        select(CalendarEvent).where(CalendarEvent.calendar_id == calendar.id)
    )
    by_external = {row.external_id: row for row in rows if row.external_id}

    created = updated = 0
    seen: set[str] = set()
    fields = (
        "title",
        "description",
        "location",
        "link",
        "start_at",
        "end_at",
        "all_day",
        "timezone",
        "rrule",
        "recurrence_interval",
        "recurrence_byday",
        "recurrence_count",
        "recurrence_until",
    )
    for item in remote:
        uid = item["external_id"]
        if uid in seen:
            continue
        seen.add(uid)
        row = by_external.get(uid)
        if row is None:
            row = CalendarEvent(
                calendar_id=calendar.id,
                external_id=uid,
                source="ics",
                created_by="sync",
                last_synced_at=now,
            )
            for key in fields:
                if key in item:
                    setattr(row, key, item[key])
            session.add(row)
            created += 1
        else:
            for key in fields:
                if key in item and getattr(row, key) != item[key]:
                    setattr(row, key, item[key])
            row.last_synced_at = now
            updated += 1

    deleted = 0
    for uid, row in by_external.items():
        if uid not in seen and row.source == "ics":
            await session.delete(row)
            deleted += 1

    calendar.last_synced_at = now
    await session.commit()
    return {"created": created, "updated": updated, "deleted": deleted, "pushed": 0}
