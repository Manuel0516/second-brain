# 0107 — Fitness settings page

Date: 2026-07-06
Status: accepted

## What changed

Added a Fitness settings page (`/settings/fitness`) with four new user-configurable
fitness settings: rest timer duration (seconds), auto-start rest timer (bool), weight
unit (kg/lb), and a weekly session-count target. Wired all four into the live behavior
of the Fitness module.

## Why

The Fitness module hardcoded a 90-second rest timer that always auto-started, always
displayed/entered weight in kg, and had no way to set a weekly training-volume goal.
The Settings shell already had a reserved, disabled nav slot for `/settings/fitness`.

## Files touched

- `apps/api/app/models.py` — added `fitness_rest_seconds`, `fitness_auto_start_rest`,
  `fitness_weight_unit`, `fitness_weekly_session_target` columns to `UserSettings`.
- `apps/api/alembic/versions/019_fitness_settings.py` — migration adding the four columns
  with server defaults (90, true, "kg", null).
- `apps/api/app/routes/settings.py` — exposed the four fields on `SettingsResponse` and
  `SettingsPatch` (bounded: rest seconds 10-600, weekly target 0-14, unit literal kg/lb).
- `apps/api/app/routes/fitness.py` — added `sessions_this_week` to `OverviewStats`,
  computed as completed sessions since the current ISO week's Monday.
- `apps/web/src/components/ToggleRow.tsx` — new shared component, extracted from
  duplicated copies in `GeneralSettings.tsx` and `CalendarSettings.tsx` (now imported by
  both plus `FitnessSettings.tsx`).
- `apps/web/src/context/SettingsContext.tsx` — added the four fields to `UserSettings`
  and `DEFAULTS`.
- `apps/web/src/modules/settings/FitnessSettings.tsx` — new settings page: "Rest timer"
  (seconds input + auto-start toggle), "Units" (kg/lb `Segmented`), "Weekly target"
  (number input, empty = off).
- `apps/web/src/modules/settings/SettingsLayout.tsx` — enabled the `fitness` nav entry.
- `apps/web/src/App.tsx` — added the `/settings/fitness` route.
- `apps/web/src/modules/fitness/units.ts` — new `toDisplayWeight`/`fromDisplayWeight`
  helpers; kg is the canonical storage unit everywhere, conversion happens only at the
  display/input boundary.
- `apps/web/src/modules/fitness/LiveSession.tsx` — rest timer duration and auto-start
  now read from settings; shows a manual "Start rest timer" button when auto-start is
  off; weight column header uses the configured unit.
- `apps/web/src/modules/fitness/RestTimer.tsx` — rest duration label reads `restTotal`
  instead of a hardcoded "90 seconds".
- `apps/web/src/modules/fitness/Fitness.tsx` — session-finish weight input converts to
  kg before persisting; last body-metric weight and trend display convert to the
  configured unit.
- `apps/web/src/modules/fitness/BodyMetricForm.tsx` — weight input placeholder and
  submit-time conversion use the configured unit.
- `apps/web/src/modules/fitness/Overview.tsx` — weight metric trend/tooltip and the
  top-exercise progression chart convert to the configured unit; new "Weekly sessions"
  progress card (only rendered when a weekly target is set) using the new
  `sessions_this_week` stat.
- `apps/web/src/modules/fitness/ExerciseStats.tsx` — estimated 1RM, best set, PR table,
  weekly volume chart/header, and max-weight-over-time chart/header all convert to the
  configured unit.
- `apps/web/src/modules/fitness/LogPastModal.tsx` — weight input label and submit-time
  conversion use the configured unit.
- `apps/web/src/modules/fitness/api.ts` — added `sessions_this_week` to the
  `OverviewStats` type.
- `apps/web/src/modules/fitness/LiveSession.test.tsx`,
  `apps/web/src/modules/fitness/__smoke.test.tsx` — wrapped renders in
  `SettingsProvider` (now required since `LiveSession`/`Fitness` call `useSettings()`).

## How the pieces connect

Settings live in the single flat `user_settings` table, same pattern as every other
setting in the app — no per-module nesting. The frontend `SettingsProvider` fetches
this once and exposes it via `useSettings()`; `FitnessSettings.tsx` patches it live
(no Save button, same pattern as `GeneralSettings.tsx`). Every fitness screen that
displays or accepts a weight value reads `settings.fitness_weight_unit` and threads it
through `toDisplayWeight`/`fromDisplayWeight` — the database and API never see
anything but kg. The weekly target is a plain setting compared against a new
`sessions_this_week` stat computed the same way the existing `sessions_last_30_days`
window is computed.

## How to modify this later

- To add another fitness setting: add the column + migration + `SettingsResponse`/
  `SettingsPatch` field on the backend, then the `UserSettings` interface/`DEFAULTS` and
  a control in `FitnessSettings.tsx` on the frontend.
- To convert a new weight display: import `toDisplayWeight`/`fromDisplayWeight` from
  `apps/web/src/modules/fitness/units.ts` — never hardcode "kg" as a label, always read
  `settings.fitness_weight_unit`.
- The "Previous: 80×8" performance hints (`buildPreviousLookup`/`formatSetSummary` in
  `Fitness.tsx`) intentionally still show raw kg-based numbers unlabeled — converting
  those would require threading the unit through both functions and every caller; left
  out of scope since they never render a "kg"/"lb" suffix today.
