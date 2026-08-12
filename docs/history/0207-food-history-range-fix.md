# 0207 — Restore complete Food history

Date: 2026-08-12
Status: accepted

## What changed

`GET /api/food/logs` now returns the complete meal-log history when no date range is supplied.
Explicit `from_date` and `to_date` filters remain unchanged.

## Why

The Food History page calls the endpoint without dates, but the endpoint silently defaulted to
the previous seven days. Older meals were still stored in PostgreSQL but disappeared from the
history UI.

## Files touched

- `apps/api/app/routes/food.py` — removes the misleading seven-day implicit filter.
- `apps/api/tests/test_food.py` — verifies an older logged meal is returned without a range.

## How the pieces connect

`apps/web/src/modules/food/History.tsx` calls `fetchMealLogs()` without dates and filters the
returned rows to logged meals. The API now supplies the complete source set for that history
view, while summary and explicitly ranged requests remain bounded by their callers.

## How to modify this later

If the history grows enough to need pagination, add an explicit cursor or page-size API and
update the History view together. Do not reintroduce a hidden date default because it makes old
data look deleted.
