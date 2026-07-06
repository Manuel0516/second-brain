# 0127 — Calendar bulk delete, per-occurrence recurring links, Food polish

Date: 2026-07-06
Status: accepted

## What changed

Six targeted fixes across calendar and Food, plus OpenRouter env var scaffolding:

1. **Calendar bulk delete** — selecting multiple events (or occurrences) and pressing
   `Delete`/`Backspace` now deletes all of them in one action instead of requiring one-by-one
   deletion via the event editor.
2. **Recurring events create one linked entry per occurrence** — a recurring event with a
   fitness or food connection now creates a separate `WorkoutSession`/`MealLog` for every
   occurrence in the series (capped at 366), not a single entry tied to the parent's start
   time. Editing a recurring event's connections or recurrence rule regenerates its planned
   linked entries from scratch; logged/active/completed entries are never touched. No backfill
   for events created before this change.
3. **Food: log-meal date input** — the "Log meal" modal now has a date field so a meal can be
   logged against any day, not just today.
4. **Food Overview: shows logged meals for the viewed week** — past weeks with logged (but no
   planned) meals now show those meals instead of the "No planned meals" empty state.
5. **Food Stats: graphs stop at today** — macro/water/veg/fruit graphs no longer plot zeroed
   future days when viewing the current or a future week.
6. **Food Overview: note edits refresh immediately** — editing a logged/planned meal's note no
   longer requires a page reload to see the saved text.
7. **OpenRouter env vars documented** — `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` added to
   `.env` and `.env.example` (key left blank; user adds their own). `config.py` already
   defaulted `OPENROUTER_MODEL` to `google/gemini-2.5-flash`, a cheap vision-capable model —
   no code change needed there.

## Why

User-reported gaps: no way to bulk-delete calendar events, recurring events with fitness/food
links only ever created one linked entry for the whole series instead of one per occurrence,
the log-meal flow couldn't target a past date, past weeks with only logged meals showed a
misleading empty state, Stats graphs extended into the future, and note edits silently failed
to refresh on screen. The OpenRouter env vars were needed to enable the existing AI meal-photo
analysis feature.

## Files touched

- `apps/api/app/routes/calendar.py` — added `_create_linked_entries()` (creates one
  `WorkoutSession`/`MealLog` + `Link` per occurrence datetime) and `MAX_LINKED_OCCURRENCES = 366`
  cap; `create_event` now passes `_occurrence_starts()` output (or a single-element list for
  non-recurring events) instead of always creating exactly one linked entry; `patch_event` now
  detects when connections or any recurrence field (including `start_at`) changed on a recurring
  event, deletes existing planned linked entries + their `logged_from` links, and regenerates
  them fresh — non-recurring reschedules keep the old single-entry move behavior.
- `apps/web/src/modules/calendar/TimeGrid.tsx` — added `deleteSelectedEvents()` (deletes each
  selected occurrence via `DELETE /api/events/{id}` with `scope=this&occurrence_start=...` for
  recurring occurrences or no scope for standalone events, via `Promise.all`) and a
  `Delete`/`Backspace` case in the existing keydown handler alongside the pre-existing
  copy/paste shortcuts.
- `apps/web/src/modules/food/MealLogModal.tsx` — added `mealDate` state (defaults to today,
  locked when editing an existing planned meal) and a `<input type="date">` field; both
  `createMealLog` call sites and the `updateMealLog` save call now use `mealDate` instead of a
  hardcoded `today`.
- `apps/web/src/modules/food/Overview.tsx` — added `allLoggedMeals` collection (mirrors the
  existing `allPlannedMeals` pattern, filtered to `status === 'logged'`) rendered as a read-only
  "Logged meals" section; the empty state now only shows when both lists are empty; added
  `onSaved` prop, called from `handleSaveNote` after a successful `updateMealLog` so the parent
  refetches and the new note appears immediately.
- `apps/web/src/modules/food/Food.tsx` — passes `onSaved={() => loadWeek()}` to `<Overview>`.
- `apps/web/src/modules/food/Stats.tsx` — added a `localDateStr()` helper and filters
  `summary.days` to `d.date <= todayStr` before building the `DayPoint[]` used by all four
  macro/water/veg/fruit graphs. The weight series is untouched (it only ever contains real
  logged entries).
- `.env`, `.env.example` — added `OPENROUTER_API_KEY=` (blank) and
  `OPENROUTER_MODEL=google/gemini-2.5-flash`.

## How the pieces connect

Calendar occurrences are virtual — only the parent `CalendarEvent` row exists in the DB for a
recurring series (plus any single-occurrence override rows created via `scope=this` edits).
`_occurrence_starts()` is the single source of truth for turning a parent event's rrule into a
list of real occurrence datetimes (used both by `expand_event()` for read-time display and now
by `_create_linked_entries()` for materializing linked fitness/food rows). Linked entries are
always `status="planned"` and connected back to the parent event via a `Link` row
(`source_type="event"`, `relation="logged_from"`) — `_linked_planned_sessions`/
`_linked_planned_meals` filter strictly to `status == "planned"`, so regeneration on patch never
touches a meal/workout the user already logged or completed. The frontend's bulk delete reuses
the exact same per-occurrence delete semantics the single-event editor already used
(`scope=this&occurrence_start=...` for a recurring occurrence), just looped over the current
multi-selection instead of a single event.

## How to modify this later

- To raise the 366-occurrence cap, change `MAX_LINKED_OCCURRENCES` in `calendar.py` — a
  materialized cap is deliberate for open-ended series; a background top-up job would be the
  next step if a longer horizon is ever needed.
- To add fitness/food link generation for copy-pasted events too (currently `copy_events`
  duplicates the `connections` JSON but does not create new linked `WorkoutSession`/`MealLog`
  rows for the copies), call `_create_linked_entries()` from `copy_events` the same way
  `create_event` does.
- Bulk delete has no dedicated backend endpoint — it fans out `Promise.all` calls to the
  existing single-event `DELETE /api/events/{id}` route. If bulk operations grow more complex,
  consider a bulk endpoint mirroring `move_events`/`copy_events`.
