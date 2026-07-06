# 0123 — Food module: history refresh + week graph fixes

Date: 2026-07-06
Status: accepted

## What changed

Three fixes in the Food module's sidebar week bars and History component:

1. **History refresh after edit save**: when a meal is edited/saved via the MealLogModal (opened from History), the History list now reloads automatically without a page refresh.
2. **Week graph 7-day fix**: the timezone bug that caused 8 bars (Sun→Sun) is fixed by sending UTC-midnight ISO strings to the backend instead of calling `.toISOString()` on local Date objects.
3. **Week graph respects `week_start`**: the sidebar "This week" bars now start on the user's preferred day (monday or sunday from settings).
4. **Brighter filled segments**: `.food-week-bar-segment.filled` now uses `var(--food-accent)` (full amber) instead of `var(--food-accent-tint)` (faint).

## Why

- User request: History list should update automatically after editing a meal.
- Timezone bug: in UTC+2, local midnight Monday becomes Sunday 22:00 UTC, causing the backend to include Sunday → 8 bars total.
- The `week_start` setting was ignored for week bars.
- Filled segments were too dim to distinguish from empty ones.

## Files touched

- `apps/web/src/modules/food/Food.tsx` — added `refreshKey` state (incremented on save, passed to History), renamed `mondayFor` → `weekStartFor` (respects `settings.week_start`), updated `loadWeek` to send UTC-midnight datetime strings, renamed `viewedMonday` → `viewedWeekStart`.
- `apps/web/src/modules/food/History.tsx` — added optional `refreshKey` prop, changed `useEffect([])` to `useEffect([refreshKey])` so meals reload when the key increments.
- `apps/web/src/modules/food/food.css` — changed `.food-week-bar-segment.filled` background from `var(--food-accent-tint)` to `var(--food-accent)`.

## How the pieces connect

- `Food` owns the `refreshKey` state. When `MealLogModal.onSaved` or `History.onSaved` fires (after a meal is edited or deleted), `loadWeek()` refreshes the sidebar/summary AND `setRefreshKey(k => k + 1)` increments the key.
- `History` receives `refreshKey` as a prop. Its `useEffect` now depends on `refreshKey`, so when `Food` increments it, `History` re-runs `loadMeals()` — fetching fresh meal data from the API.
- The timezone fix: instead of `monday.toISOString()` (which converts local midnight to UTC, potentially shifting the date), we construct `YYYY-MM-DDT00:00:00.000Z` from the local date parts — keeping the date at UTC midnight.
- The `weekStartFor` function dynamically computes days since the week start day based on `settings.week_start`, replacing the old hardcoded `(dayOfWeek + 6) % 7` (always Monday).

## How to modify this later

- To change the refresh trigger: find `setRefreshKey` calls in `Food.tsx` (lines ~812, ~825). Add more callbacks where needed.
- To change the week start logic: edit `weekStartFor` in `Food.tsx` (line ~140). The `settings.week_start` key is typed as `'monday' | 'sunday'` in `SettingsContext`.
- To change bar appearance: edit `.food-week-bar-segment.filled` in `food.css` (line ~203).
- To change the date range sent to the backend: edit `loadWeek` in `Food.tsx` (line ~152). The `fromStr`/`toStr` format is `YYYY-MM-DDT00:00:00.000Z` — keep the `T00:00:00.000Z` / `T23:59:59.999Z` suffix to avoid timezone issues.