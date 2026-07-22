# 0149 — Recurring event links scoped by occurrence date

Date: 2026-07-22
Status: accepted

## What changed
The event editor's LINKED panel now shows only the food/fitness entry belonging to the
occurrence you opened, instead of every occurrence's entry across the whole series.

A recurring event stores one planned `MealLog`/`WorkoutSession` per occurrence (each with its
own `date`), but all of them are linked to the single parent `event.id`. Opening any one
occurrence therefore listed all of them (the reported "LINKED · 10" showing Breakfast for ten
consecutive days). The links endpoint now accepts an optional `on=<YYYY-MM-DD>` query param
that filters dated targets (`meal_log`, `workout_session`) to that day; pages/events are never
date-filtered. The editor passes the opened occurrence's UTC date for recurring events only.

## Why
User report: creating a repeated event that links food caused every repetition to show every
day's food. Each repetition should link only its own date's food/fitness page.

## Files touched
- `apps/api/app/routes/notes.py` — `get_event_links` gained an `on: date | None` query param
  and skips dated targets whose day != `on`. `_node_details` now returns the record's own day
  as a 5th tuple element (`date | None`) so the filter can compare without a second query;
  added `date` to the datetime import.
- `apps/web/src/modules/calendar/EventEditor.tsx` — computed `linksUrl` that appends
  `?on=<occurrence UTC date>` when the event is recurring, and used it in both the initial
  link fetch and `refreshLinks`; added `linksUrl` to the fetch effect's dependency array.
- `apps/api/tests/test_calendar.py` — `test_event_links_scoped_to_occurrence_date`: a 3-day
  daily series with a food connection returns 3 meal links unscoped and exactly 1 with `on`.

## How the pieces connect
Recurring occurrences are virtual: `expand_event` emits one `EventResponse` per occurrence, all
sharing the parent `event.id` but with occurrence-specific `start_at`. The editor opens on one
such occurrence and already knows its `start_at`. Because all datetime columns are
`DateTime(timezone=True)`, both the occurrence `start_at` and the per-occurrence meal `date`
derive from the same UTC instant, so `new Date(start_at).toISOString().slice(0,10)` on the
client equals `meal.date.date()` on the server — the filter matches exactly. The param is only
sent for recurring events, so non-recurring events keep their existing behavior untouched
(important because a manually linked, actually-logged meal is dated by `logged_at`, which the
event-date sync in `create_link` does not overwrite).

## How to modify this later
- To change which node types are date-scoped, edit the `node_type in {"workout_session",
  "meal_log"}` guard in `get_event_links` (notes.py).
- The day used for a target is `_node_details(...)[4]`, computed as `when.date()` where
  `when = logged_at or date` (meal) / `date or scheduled_at` (workout) — keep the filter's day
  source identical to the title's day source or the panel will hide items it still labels.
- To scope non-recurring events too, drop the `isRecurring` gate on `linksUrl` in
  `EventEditor.tsx` — but first confirm the `logged_at` vs synced-`date` mismatch above won't
  hide legitimately linked logged meals.
- If per-occurrence *manual* linking is ever needed, note that `create_link` syncs the target's
  date to the parent `event.start_at` (base occurrence), not the viewed occurrence.
