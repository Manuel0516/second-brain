# Plan: Google Calendar sync + Add calendar from URL (TimeEdit ICS)

## Context

The calendar module currently has full local CRUD (calendars + events + recurrence) but zero integrations. Two features are requested:

1. **Google Calendar sync** — connect a Google account via OAuth, pull its calendars' events in, and optionally (per Settings toggle, off by default) push local edits back to Google. Confirmed decisions: user already has OAuth Client ID/Secret for `.env`; default direction is **pull-only** with a Settings toggle to flip a Google calendar to two-way; **polling only** (15-min loop), no webhook.
2. **Add calendar from URL** — subscribe to a TimeEdit ICS feed URL (works for any public ICS feed): paste URL in the calendar sidebar, events import and refresh periodically. Read-only by nature.

The Sidebar already has a disabled "Import from Google Calendar" placeholder button and a working inline "Add calendar" form — both are the natural insertion points. `docs/work/NOW.md` lists "Google Calendar sync — Phase 1 completion" as next planned work.

## 1. Schema — migration `apps/api/alembic/versions/024_calendar_sync.py` (head is 023)

**`calendars`** new columns:
- `google_calendar_id String(255) NULL`
- `google_refresh_token Text NULL` — Fernet-encrypted
- `sync_token Text NULL` — Google incremental-sync cursor
- `sync_direction String(4) NOT NULL server_default='pull'` — `'pull' | 'push'` (app-layer enum, matching existing `source` string pattern)
- `ics_url Text NULL`
- `last_synced_at DateTime(tz) NULL`

Reuse existing `Calendar.source` (`"local"`) — add values `"google"` / `"ics"` (app-layer only, no DB enum).

**`calendar_events`** new columns:
- `external_id String(255) NULL` — Google event id OR ICS UID (one column, one purpose: "foreign system's stable id"); partial unique index `(calendar_id, external_id) WHERE external_id IS NOT NULL`
- `google_etag String(255) NULL`
- `source String(20) NOT NULL server_default='user'` — `'user' | 'google' | 'ics'`
- `last_synced_at DateTime(tz) NULL`

Matching `Mapped[...]` columns in `apps/api/app/models.py`. Update `docs/architecture/DATABASE.md` tables and `docs/product/CALENDAR_MODULE.md` §4 (polling-only deviation, `sync_direction` addition).

## 2. Dependencies (apps/api/pyproject.toml)

- `google-auth` + `google-auth-oauthlib` — OAuth flow + token refresh. **Not** `google-api-python-client` (heavy, sync-only, discovery boilerplate) — the 3–4 REST calls needed go through the already-installed `httpx`.
- `icalendar` — ICS parsing (also reused as the RRULE parser for Google recurrence strings).
- `recurring-ical-events` — timezone-aware RRULE/EXDATE expansion of ICS feeds over a date window (spec says "don't hand-roll rrule").
- `cryptography` — Fernet for refresh-token encryption (transitive dep of google-auth already; make explicit since directly imported).

No new frontend dependencies.

## 3. Config + encryption

`apps/api/app/config.py` `Settings` gains: `google_client_id`, `google_client_secret`, `google_redirect_uri` (e.g. `https://<host>/api/integrations/google/callback`), `google_token_encryption_key` (new Fernet key, sibling of `totp_encryption_key`).

`apps/api/app/security.py` gains `encrypt_token(raw)` / `decrypt_token(token)` using `cryptography.fernet.Fernet` — co-located with existing crypto helpers.

## 4. Backend: routes — new file `apps/api/app/routes/integrations.py`

Mounted in `main.py`. All authed via `Depends(current_user)` per existing pattern.

- `GET /api/integrations/google/connect` — build consent URL via `google_auth_oauthlib.flow.Flow` with `access_type=offline&prompt=consent`; CSRF `state` = `secrets.token_urlsafe` stored in a short-lived httpOnly cookie; respond `303` redirect (frontend uses a plain `<a>`, not fetch).
- `GET /api/integrations/google/callback?code=&state=` — validate state, exchange code, Fernet-encrypt refresh token, create the "Synced – Google Primary" calendar row (`source="google"`, `google_calendar_id="primary"`, `sync_direction="pull"`, Google-blue color) or update token on reconnect; kick initial sync as `asyncio.create_task` (don't block); `303` redirect back to the calendar/settings page with a success flag.
- `POST /api/integrations/google/disconnect` — clear `google_refresh_token`/`sync_token`/`google_calendar_id`; keep the calendar and already-synced events (deleting is a separate explicit `DELETE /calendars/{id}`).
- `POST /api/integrations/ics` — body `{name, color, ics_url}`; fetch + validate the feed parses (`422` otherwise); create calendar (`source="ics"`, direction forced `pull`); first import synchronously in-request. Removal = existing `DELETE /api/calendars/{id}` (nothing to revoke).

## 5. Backend: sync engine

**`apps/api/app/services/google_sync.py`** (first services module — justified: shared by polling loop, callback initial sync, and outgoing push from three event routes):
- `sync_google_calendar(session, calendar)` — dispatch initial vs incremental by presence of `sync_token`.
- Initial: `events.list` via httpx, window −1 month → +6 months, paginate, upsert all, store `nextSyncToken`. Incremental: `events.list?syncToken=`; on `410 Gone` clear token and re-run initial; `status:"cancelled"` items → delete.
- `_upsert_from_google(...)` — match by `(calendar_id, external_id)`; map summary/description/location/start/end/all-day/timezone. **Loop prevention**: skip incoming update when local `updated_at` > Google `updated` on a two-way calendar (last-write-wins, single user). Recurrence: `parse_google_rrule()` (via `icalendar`'s `vRecur`) splits FREQ/INTERVAL/BYDAY/COUNT/UNTIL into the app's existing `rrule`/`recurrence_*` columns; Google occurrence overrides (`recurringEventId` + `originalStartTime`) map onto the existing local override-row mechanism (`recurrence_parent_id` + `recurrence_overridden_at`).
- `push_local_event(...)` (two-way only) — one `_maybe_push(event)` hook at the end of `create_event`/`patch_event`/`delete_event` in `calendar.py`; guard `calendar.source == "google" and sync_direction == "push"`; best-effort `asyncio.create_task` (Google outage never blocks a local save; next poll reconciles); store returned id/etag.

**`apps/api/app/services/ics_sync.py`**:
- `refresh_ics_calendar(session, calendar)` — `httpx.get(ics_url)`, parse with `icalendar`, expand with `recurring_ical_events.of(ical).between(-1mo, +6mo)`, upsert occurrences as individual non-recurring rows keyed by `(calendar_id, external_id=UID[+occurrence suffix])`, `source="ics"`. No write-back ever.

**Polling** — in `main.py` `lifespan`: bare `asyncio.create_task` loop (`sleep 15*60` → `refresh_all_syncable_calendars(session)`), cancelled after `yield`. No apscheduler. The shared refresher iterates calendars with `source in ("google","ics")`, per-calendar try/except so one broken feed doesn't stop the rest.

## 6. Backend: calendar.py response changes

- `CalendarResponse` gains `source`, `sync_direction`, `last_synced_at`.
- `CalendarPatch` gains `sync_direction: Literal["pull","push"] | None`; `422` when patched on a non-Google calendar.
- Frontend type `apps/web/src/modules/calendar/types.ts` extended to match.

## 7. Frontend

**`apps/web/src/modules/calendar/Sidebar.tsx`**:
- Replace the disabled Google placeholder with a live `<a href="/api/integrations/google/connect">` (browser navigation, since it's a 303 redirect flow).
- "Add calendar from URL": extend the existing inline `.cal-card` add form with a `mode: 'color' | 'url'` toggle — URL mode swaps the color field for `<input type="url" required>` and posts to `/api/integrations/ics`. No new modal/component file.

**`apps/web/src/modules/settings/CalendarSettings.tsx`**:
- New `SettingsCard title="Google Calendar"` (per SETTINGS_MODULE.md): shows Not connected + connect link, or "Connected · last synced Xm ago", a "Also send my changes to Google" toggle (`PATCH /api/calendars/{id}` with `sync_direction`), and a Disconnect button (`POST /api/integrations/google/disconnect`). The direction toggle lives here only (next to connection status), not on every calendar's edit popover.

## 8. Verification

- `npm run check` (root) / `npm run check:api` — must pass.
- Manual OAuth: real `GOOGLE_CLIENT_ID/SECRET` in `.env`, click connect → consent → callback creates "Synced – Google Primary" and events appear in the pulled window.
- Manual ICS: paste a TimeEdit `https://...ics` URL, events appear; run the refresh twice, confirm no duplicate rows (upsert-by-external_id holds).
- Ponytail self-checks (small pytest file, no fixtures): `parse_google_rrule` assertions (BYDAY/COUNT/UNTIL variants); loop-prevention (newer local `updated_at` skips overwrite on two-way, overwrites on pull-only); ICS double-refresh produces no duplicates.
- Toggle two-way in Settings, edit an event locally, confirm it appears in Google.

## 9. Docs (mandatory)

- `docs/history/0xxx-google-calendar-and-ics-sync.md` entry (all five sections) + `CHANGELOG.md` index.
- `docs/architecture/DATABASE.md` — new columns.
- `docs/product/CALENDAR_MODULE.md` §4 — polling-only (no webhook), per-calendar `sync_direction`.

## Files

New: `apps/api/alembic/versions/024_calendar_sync.py`, `apps/api/app/routes/integrations.py`, `apps/api/app/services/google_sync.py`, `apps/api/app/services/ics_sync.py`, test file, history entry.
Modified: `apps/api/app/models.py`, `config.py`, `security.py`, `main.py`, `routes/calendar.py`, `pyproject.toml`, `apps/web/src/modules/calendar/Sidebar.tsx`, `types.ts`, `apps/web/src/modules/settings/CalendarSettings.tsx`, `docs/architecture/DATABASE.md`, `docs/product/CALENDAR_MODULE.md`, `docs/history/CHANGELOG.md`.

## Env vars to add to `.env`

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY` (a Fernet key — generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`).
