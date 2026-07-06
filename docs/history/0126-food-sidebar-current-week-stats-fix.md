# 0126 — Food sidebar always shows current week + stats fix + planned meals ordering

Date: 2026-07-06
Status: accepted

## What changed

1. **Sidebar always shows current week's data**: Split the single `summary` state in `Food.tsx` into `viewedWeekSummary` (for Overview/Stats tabs) and `currentWeekSummary` (for the sidebar). `loadWeek()` now fetches both summaries in parallel via `Promise.all`. The sidebar (calorie ring, macros, water/veg/fruit cards, week bars, body weight) always reads from `currentWeekSummary`, which is always loaded for `weekOffset=0` (the current week). The Overview and Stats tabs receive `viewedWeekSummary`, which reflects the user's selected week.

2. **Stats graphs show with 1+ days of data**: In `Stats.tsx`, removed the `d.date <= todayStr` filter that hid future days, and changed `hasDays` from `days.length > 1` to `days.length > 0`. Graphs now render even when only a single day has data.

3. **Planned meals ordered sooner-to-later**: In `Overview.tsx`, added a sort on `allPlannedMeals` by `scheduled_at` (falling back to `date`) ascending, so planned meals appear in chronological order.

## Why

- Bug: navigating to a past/future week emptied the sidebar because `summary` only contained the viewed week's data.
- Bug: `hasDays = days.length > 1` prevented stats graphs from rendering when only 1 day had data.
- UX: planned meals were in arbitrary order, making it hard to see what's coming up next.

## Files touched

- `apps/web/src/modules/food/Food.tsx` — split `summary` into `viewedWeekSummary` + `currentWeekSummary`; `loadWeek` fetches both; sidebar reads from `currentWeekSummary`; Overview/Stats receive `viewedWeekSummary`.
- `apps/web/src/modules/food/Stats.tsx` — removed `d.date <= todayStr` filter; changed `hasDays` threshold from `> 1` to `> 0`.
- `apps/web/src/modules/food/Overview.tsx` — added sort on `allPlannedMeals` by `scheduled_at`/`date` ascending.

## How the pieces connect

`Food.tsx` is the parent component that owns all state. The sidebar is rendered inline in `Food.tsx`'s JSX, while Overview and Stats are child components that receive summary data via props. By splitting the summary into two independent fetches (current week always, viewed week on demand), the sidebar decouples from the week navigation. The water/veg/fruit handlers call `loadWeek()` which refreshes both summaries, keeping the sidebar in sync after mutations.

## How to modify this later

- To add a new sidebar card that needs current-week data: read from `currentWeekSummary` (not `viewedWeekSummary`).
- To add a new tab that needs the viewed week's data: pass `viewedWeekSummary` as a prop.
- If `loadWeek` becomes too heavy with both fetches, consider only fetching `currentWeekSummary` on mount and refreshing it after mutations, rather than on every `loadWeek` call.