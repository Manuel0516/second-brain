# 0129 — Configurable stats graph lookback range (Fitness + Food)

Date: 2026-07-06
Status: accepted

## What changed

Added two independent settings controlling how far back the stats graphs look:

- **Fitness → Stats**: `fitness_stats_range_days` (default 90) — drives the Overview tab's
  body-weight/top-exercise/feeling-trend graphs, and the per-exercise deep-dive stats view.
- **Food → Stats**: `food_stats_range_days` (default 90) — drives the Food module's Stats tab
  macro/water/veg/fruit and body-weight graphs.

Both are exposed as a `Segmented` control (1 week / 1 month / 3 months / 6 months / 1 year) in
their respective settings pages, and the two values are independent of each other.

## Why

User request: "Add in the settings an option for me to choose how long back the graphs go. Add
that option for the foods statics and for the fitness statictics, (they could be different)."

## Files touched

- `apps/api/app/models.py` — added `fitness_stats_range_days` and `food_stats_range_days`
  (`Mapped[int]`, default 90, `server_default="90"`) to `UserSettings`.
- `apps/api/alembic/versions/023_stats_range_days.py` — new migration adding both columns.
- `apps/api/app/routes/settings.py` — added both fields to `SettingsResponse`, `SettingsPatch`
  (`ge=7, le=365`, matching the existing backend stats endpoints' bounds), and
  `_settings_to_response`.
- `apps/web/src/context/SettingsContext.tsx` — added both fields to `UserSettings` and
  `DEFAULTS` (90 each).
- `apps/web/src/modules/settings/FitnessSettings.tsx` — new "Stats" `SettingsCard` with a
  `Segmented` range picker for `fitness_stats_range_days`.
- `apps/web/src/modules/settings/FoodSettings.tsx` — new "Stats" `SettingsCard` with a
  `Segmented` range picker for `food_stats_range_days`.
- `apps/web/src/modules/fitness/api.ts` — `fetchExerciseStats` and `fetchBodyWeightStats` now
  accept an optional `days` param (mirroring the existing `fetchStatsOverview(days)`), forwarded
  as the `?days=` query param to their already-`days`-aware backend endpoints.
- `apps/web/src/modules/fitness/Overview.tsx` — reads `settings.fitness_stats_range_days` and
  threads it into all three fetches (`fetchStatsOverview`, `fetchBodyWeightStats`,
  `fetchExerciseStats`); the per-exercise stats cache is now keyed by `${exerciseId}:${days}` so
  switching the range setting invalidates stale cached graphs instead of reusing them.
- `apps/web/src/modules/fitness/ExerciseStats.tsx` — its raw `fetch('/api/fitness/stats/exercise/...')`
  now appends `?days=${statsDays}` and the previously hardcoded "Last 90 days" label is now
  `statsRangeLabel(statsDays)` (maps the five range values to human labels, falls back to
  "N days" for any other value).
- `apps/web/src/modules/food/Stats.tsx` — its two independent fetches (`fetchBodyWeightStats`,
  the food history `fetchSummary` window) now use `settings.food_stats_range_days` instead of a
  hardcoded `30`-day window.
- `docs/architecture/DATABASE.md` — documented both new columns and migration 023.

## How the pieces connect

Both fitness and food already had backend `days`-based query parameters on their stats endpoints
(`/api/fitness/stats/{exercise,body-weight,overview}` all accept `days`, `ge=7`); the food summary
endpoint accepts an arbitrary `from_date`/`to_date` window. This task only needed to (a) persist a
user-chosen `days` value per module in `UserSettings`, and (b) thread that value into the
frontend fetch call sites that previously hardcoded `90` (fitness) or `30` (food). No new
concepts were introduced — each stats-graph component already owned its own data-fetching
`useEffect`; the settings value was simply added to each effect's dependency array so changing
the setting triggers a refetch with the new range.

## How to modify this later

- To add another range option (e.g. "2 years"), add the value to the `options`/`labels` arrays in
  both `FitnessSettings.tsx`/`FoodSettings.tsx` and to `RANGE_LABELS` in `ExerciseStats.tsx`, and
  raise the `le=365` bound in `SettingsPatch` (`settings.py`) plus the `le=730`/`le=365` bounds on
  the relevant backend stats endpoints in `apps/api/app/routes/fitness.py` if the new value
  exceeds them.
- If a future graph surface is added to either module, read the matching setting via
  `useSettings()` and pass it into whatever fetch function backs that graph — follow the pattern
  in `Overview.tsx`/`Stats.tsx` rather than hardcoding a new default.
