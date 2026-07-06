# 0063 — Planned workout link rollback

Date: 2026-07-05
Status: accepted

## What changed

Removed the unfinished planned-workout API, planned-event reuse field, and the event editor's
automatic Fitness-state inference from workout links. The existing completed-workout calendar
event behavior remains unchanged.

## Why

The calendar-to-fitness linking design needs to be reconsidered before this additional behavior
is shipped.

## Files touched

- `apps/api/app/routes/fitness.py` — removed planned-workout schemas, endpoints, ownership lookup, and planned-event reuse.
- `apps/web/src/modules/calendar/EventEditor.tsx` — stopped interpreting workout-session links as editor Fitness state.
- `docs/work/plans/FITNESS_FOOD_MODULE_PLAN.md` — returned Phase 3 to an inactive, undecided state.

## How the pieces connect

Workout session creation still follows the established flow that creates a Fitness calendar
event and a `logged_from` link. The removed layer had attempted to treat an existing calendar
event as a planned workout and reuse it when the session was logged.

## How to modify this later

Redesign Phase 3 first, then update the session API and event editor together. Decide explicitly
whether planning is represented by a calendar, a link, or fitness-owned data before adding UI.
