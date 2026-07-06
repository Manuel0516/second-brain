# 0138 — Google Calendar sync and ICS feed subscriptions

Date: 2026-07-06
Status: accepted

## What changed

The calendar module can now mirror external calendars:

1. **Google Calendar (two-way or read-only)** — OAuth connect flow, per-calendar sync toggle, incremental sync via `syncToken` with full-resync fallback on 410, and push of local edits for calendars set to `push` direction.
2. **ICS feed subscriptions (read-only)** — subscribe to any public/tokened ICS URL (university timetables, team schedules, holidays); a periodic poller refreshes events.
3. **Add-calendar from time edit** — the Sidebar "Add calendar" menu now offers "Import from Google Calendar", which navigates to the Settings integrations section and opens the calendar picker.

### Backend

- Migration `024_calendar_sync.py` — new columns on `calendars` (`source`, `google_calendar_id`, `sync_direction`, `sync_token`, `last_synced_at`, `external_id`, `ics_url`, `etag`) and on `calendar_events` (`external_id`, `external_etag`); new `google_accounts` table storing Fernet-encrypted OAuth tokens (`GOOGLE_TOKEN_ENCRYPTION_KEY`).
- `apps/api/app/services/google_sync.py` — OAuth code exchange/refresh, incremental pull (deletions via `status == "cancelled"`), conflict policy last-write-wins by `updated` timestamp, push of local changes for two-way calendars.
- `apps/api/app/services/ics_sync.py` — ICS fetch (`MAX_FEED_BYTES` cap), tolerant VEVENT parser (folded lines, `RRULE` subset, all-day handling), mirror-replace sync into a read-only calendar.
- `apps/api/app/routes/integrations.py` — `/api/integrations/google/*` (connect, callback, status, calendars list, per-calendar subscribe/unsubscribe, disconnect) and `/api/integrations/calendars` for ICS subscriptions; sync-now endpoints.
- Background poller in `main.py` lifespan — periodic incremental sync loop for Google and ICS calendars.

### Frontend

- `apps/web/src/modules/settings/CalendarIntegrations.tsx` — new Settings card: Google connect/disconnect, calendar picker with color + direction (`pull`/`push`/two-way), ICS feed subscribe form, synced-calendar list with sync-now/remove.
- `apps/web/src/modules/calendar/Sidebar.tsx` — synced calendars render with a source badge and read-only affordances (no delete for mirrored calendars); "Import from Google Calendar" menu entry.
- Shared `CalendarData` type extended with `source`, `sync_direction`, `last_synced_at`.

## Why

Users keep their real schedule in Google Calendar; without mirroring, this app's calendar is a silo. Read-only ICS covers the long tail (universities, sports teams) without OAuth.

## Key decisions

- **Tokens encrypted at rest** with Fernet; key comes from `GOOGLE_TOKEN_ENCRYPTION_KEY` env, never stored in DB.
- **Mirrored events are owned by the sync layer**: read-only calendars reject local edits with 403; two-way calendars queue pushes.
- **Conflict policy**: last-write-wins on the `updated` timestamp — simple, predictable, documented limitation.
- **OAuth redirect UX**: `?google=connected|error&reason=` query params on the Settings page; the page derives initial notice/error state from the URL once (lazy `useState`) and defers the picker open via `setTimeout` to satisfy `react-hooks/set-state-in-effect`.

## Files touched

- `apps/api/alembic/versions/024_calendar_sync.py`
- `apps/api/app/models.py`, `app/config.py`, `app/main.py`
- `apps/api/app/services/google_sync.py`, `app/services/ics_sync.py`
- `apps/api/app/routes/integrations.py`, `app/routes/calendar.py`
- `apps/web/src/modules/settings/CalendarIntegrations.tsx`, `CalendarSettings.tsx`
- `apps/web/src/modules/calendar/Sidebar.tsx`, `types.ts`, `lib/api.ts`
- `apps/web/src/modules/calendar/Sidebar.test.tsx` (MemoryRouter wrap)

## How to modify this later

- New providers (Outlook/CalDAV): follow the `google_sync.py` shape — a service module exposing `pull(calendar)` / `push(calendar)`, a provider value in `calendars.source`, and routes under `/api/integrations/<provider>/`.
- Recurrence coverage for ICS is a pragmatic subset (`FREQ`, `INTERVAL`, `COUNT`, `UNTIL`, `BYDAY` weekly); extend `_parse_rrule` in `ics_sync.py`.
- Poller cadence lives in config (`sync interval` settings); per-calendar override would go on the `calendars` row.

2026-07-06
