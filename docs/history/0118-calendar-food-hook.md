# 0118 — Calendar food hook + FoodConnection simplification

Date: 2026-07-06
Status: accepted

## What changed
- Simplified `FoodConnection` Pydantic model from 7 fields (name, quantity, unit, calories, protein, carbs, fat) to 2 fields (meal_type, notes) per Phase 2 of the Food Page Plan.
- Added `_linked_planned_meals` helper function that mirrors `_linked_planned_sessions` — queries the `links` table for `meal_log` rows linked to events via `logged_from` relation, filtered to `status == "planned"`.
- Added food hook in `POST /events`: when `connections.food` is set, creates a `MealLog` row (status=planned, scheduled_at=event.start_at) and a `Link` row (event → meal_log, relation=logged_from).
- Added food sync in `PATCH /events`: when `start_at` changes, reschedules all linked planned meals to match the new event start.
- Added food cleanup in `DELETE /events`: un-schedules linked planned meals (sets `scheduled_at = None`) for both `scope="all"` and `scope="this"` deletion paths.
- Added `MealLog` to the imports from `app.models`.

## Why
The calendar→food hook mirrors the existing calendar→fitness hook exactly. When a user creates a calendar event with a food connection, a planned meal log is automatically created and linked. This is Phase 1 of the Food Page Plan — the backend hook that the Food page frontend will later consume to display planned meals.

The FoodConnection simplification (Phase 2) removes the old detailed nutrition fields that were never used in practice. The calendar event only needs to know the meal type and optional notes; actual nutrition data comes from the AI photo analysis flow.

## Files touched
- `apps/api/app/routes/calendar.py` — the only file changed:
  - Line 12: added `MealLog` to imports
  - Lines 76-78: simplified `FoodConnection` model
  - Lines 312-334: added `_linked_planned_meals` helper
  - Lines 563-585: added food hook in POST /events
  - Lines 637-639: added food rescheduling in PATCH /events
  - Lines 732-733: added food cleanup in DELETE "all" scope
  - Lines 758-759: added food cleanup in DELETE "this" scope

## How the pieces connect
The food hook follows the exact same pattern as the fitness hook:
1. **POST**: Event creation → flush to get event.id → create MealLog + Link
2. **PATCH**: Event rescheduling → find linked planned meals via `_linked_planned_meals` → update `scheduled_at`
3. **DELETE**: Event deletion → find linked planned meals → set `scheduled_at = None` (keeps the meal row, just un-schedules it)

The `_linked_planned_meals` helper queries the generic `links` table for `source_type="event"` → `target_type="meal_log"` with `relation="logged_from"`, then filters to only `status="planned"` meals. This ensures active/logged meals are never touched by calendar operations.

## How to modify this later
- To add more fields to the food connection (e.g., slot_index), extend `FoodConnection` and update the `MealLog(...)` constructor in the POST hook.
- To change the link relation name, update all three occurrences of `"logged_from"` in the helper and the POST hook.
- The pattern is identical to fitness — if you need to change behavior for both, change both hooks in parallel.
- The `_linked_planned_meals` helper is used in three places (POST rescheduling, DELETE all, DELETE this) — any query changes only need to happen in one place.