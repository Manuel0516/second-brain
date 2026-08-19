# 0257 — Create planned meals when editing existing events

Date: 2026-08-19
Status: accepted

## What changed

Adding a Food or Fitness connection while editing an existing non-recurring calendar event now
creates the planned target and its `logged_from` link.

## Why

The event creation route materialized linked Food and Fitness records, but the non-recurring
event PATCH route only stored the connection JSON. Editing an event could therefore appear to
save successfully without creating the planned record used by the Food or Fitness page.

## Files touched

- `apps/api/app/routes/calendar.py` — materializes one linked planned meal or workout when a
  one-off event receives a Food or Fitness connection during PATCH.
- `apps/api/tests/test_calendar.py` — verifies that adding Food or Fitness to an existing
  one-off event creates the planned target and its event link.

## How the pieces connect

The PATCH route now sends a one-occurrence list and the Food connection to the existing
`_create_linked_entries` helper, matching the non-recurring POST route. That helper creates the
`MealLog`/`WorkoutSession` and generic `Link` row in the same transaction as the event update.

## How to modify this later

Keep one-off connection materialization in the shared `_create_linked_entries` helper. If new
connection types are added, update that helper and extend the regression test for PATCH.
