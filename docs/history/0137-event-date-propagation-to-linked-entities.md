# 0137 — Event date propagation to linked entities

Date: 2026-07-06
Status: accepted

## What changed

When a calendar event's date is changed (via edit or drag-to-move), the `date` field on linked planned WorkoutSession and MealLog records is now updated alongside `scheduled_at`.

Two places in `calendar.py` were modified:

1. **`patch_event` (non-recurring reschedule)** — was already updating `scheduled_at` but not `date`. Added `workout.date = event.start_at` and `meal.date = event.start_at`.

2. **`move_events` (drag-to-move)** — was not propagating date changes to linked entries at all. Added the same `scheduled_at` + `date` propagation loop for linked planned workouts and meals.

## Why

Previously, when the user moved a calendar event that had linked planned workouts or meals, only the `scheduled_at` field was updated in the `patch_event` path, and nothing was updated in the `move_events` (drag) path. The `date` field — which is the primary date used for display in the Fitness and Food modules — remained stale. This meant a dragged event would desync from its linked workout/meal date.

## Files touched

- `apps/api/app/routes/calendar.py` — Two additions:
  - Line 686: `workout.date = event.start_at` after the existing `scheduled_at` update in `patch_event`
  - Line 689: `meal.date = event.start_at` after the existing `scheduled_at` update in `patch_event`
  - Lines 712–718: New propagation block in `move_events` loop, updating both `scheduled_at` and `date` on linked planned workouts and meals

## How the pieces connect

The `Link` table connects events to workout sessions and meal logs with `relation="logged_from"`. Both `WorkoutSession.date` and `MealLog.date` are the authoritative date field for their respective module's UI (history, stats, week view). `scheduled_at` mirrors the linked event's `start_at` and is used for calendar alignment.

When the user edits or drags an event:
- `patch_event` handles PATCH /events/{id} (edit panel) — non-recurring events with `start_at` changed now correctly propagate `date` to linked entries
- `move_events` handles PATCH /events (drag) — now propagates `scheduled_at` and `date` to linked planned entries

Both paths only affect **planned** entries (status "planned"). Logged/completed workouts and meals are intentionally left alone — once a session is in progress or done, retroactively changing its date via event movement could lose real data.

## How to modify this later

To extend propagation to non-planned entries: modify `_linked_planned_sessions` and `_linked_planned_meals` (lines 285–334) to remove the `status == "planned"` filter, or add a separate function for all-linked-entries. Ensure the caller (either `patch_event` or `move_events`) has a clear intent flag before touching logged data.

To add propagation for new entity types (e.g. `body_metrics`): add a similar `_linked_planned_<type>` function and call it in both `patch_event`'s `"start_at" in values` branch and `move_events`'s loop body.
