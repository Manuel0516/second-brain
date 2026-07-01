# 0005 — Settings module implementation

Date: 2026-06-29
Status: accepted

## What changed

Added a full `/settings` area with General and Calendar pages. User preferences (theme,
timezone, emoji/color presets, default calendar) are now persisted in the database and used
throughout the app. Username was added to the User model.

## Why

Hardcoded presets in EventEditor.tsx were replaced with user-editable saved settings. The
settings area also gives the app a consistent place for all future configuration.

## Files touched

- `apps/api/app/models.py` — `UserSettings` table added; `username` column added to `User`
- `apps/api/app/routes/settings.py` — GET + PATCH /settings (lazy-creates row on first write)
- `apps/api/alembic/versions/003_user_settings.py` — UserSettings migration
- `apps/api/alembic/versions/002_username.py` — username backfill migration
- `apps/web/src/context/SettingsContext.tsx` — fetches settings on mount, exposes via context
- `apps/web/src/modules/settings/GeneralSettings.tsx` — theme, timezone, week start, time format
- `apps/web/src/modules/settings/CalendarSettings.tsx` — default calendar, duration, presets
- `apps/web/src/modules/calendar/EventEditor.tsx` — now reads icon/color presets from settings
- `apps/web/src/pages/Calendar.tsx` — new events use `settings.default_calendar_id`
- `apps/web/src/styles.css` — settings nav, settings card styles

## How the pieces connect

`SettingsContext.tsx` is mounted at the app root in `main.tsx`. It fetches
`GET /api/settings` on mount and provides the result via `useSettings()` hook. Any
component that needs settings reads from this context — no prop drilling.

The `UserSettings` table uses `user_id` as its primary key (one-to-one with `User`).
The GET endpoint returns sensible defaults if no row exists yet (lazy creation pattern).
The PATCH endpoint uses `INSERT ... ON CONFLICT DO UPDATE` to upsert.

`EventEditor.tsx` calls `useSettings()` to get `favorite_emojis` and `favorite_colors`
for the icon and color picker presets. These are no longer hardcoded constants.

`Calendar.tsx` reads `settings.default_calendar_id` when creating a new event:
```typescript
const calId = settings.default_calendar_id ?? calendars[0]?.id
```

## How to modify this later

- **Add a new setting field:** add column to `UserSettings` in `models.py`, create a
  migration, add it to the GET response Pydantic model and PATCH handler in
  `routes/settings.py`, add UI in the relevant settings component.
- **Add a new settings page:** add a new component in `modules/settings/`, add a sidebar
  nav entry in the settings layout, add a route in `App.tsx`.
- **Change the default value for a setting:** change the `default=` in the SQLAlchemy
  column definition in `models.py` AND update the fallback in the GET handler for users
  with no row yet.
- **Access settings in a new component:** `const { settings } = useSettings()` — that's it.
