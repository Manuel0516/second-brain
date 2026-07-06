# 0133 — Trashed notes drop their event links; copy/paste duplicates linked workout/meal

Date: 2026-07-06
Status: accepted

## What changed

1. Moving a note to the trash (or permanently deleting it) now immediately deletes any `Link`
   rows connecting it to calendar events, instead of only cutting the link on permanent purge.
   Previously the link row stuck around until the 30-day auto-purge (or a manual permanent
   delete), so a trashed note could still surface as a stale "Linked" entry anywhere Links get
   read back out.
2. Copying and pasting a calendar event (`Cmd+C`/`Cmd+V` in the calendar grid, or the `/api/events/copy`
   endpoint) now also duplicates whatever workout session or meal log is linked to the source
   event. The pasted event gets its own new `WorkoutSession`/`MealLog` (status `planned`, scheduled
   at the paste target time, core fields copied — exercise `type`/`plan` for workouts;
   `meal_type`/macros/water/veg/fruit units for meals) and a fresh `Link` to it, rather than being
   a bare copy with no connection at all.

## Why

User report: notes that were deleted still showed up as a linked "note card" in the event editor
(the underlying `Link` row was never removed on trash, only on permanent delete). Separately, the
user asked that pasting a copied event should also duplicate its linked food/workout entry — "if a
food was linked then the new event should have a new food linked... the same for fitness."

## Files touched

- `apps/api/app/routes/notes.py` — extracted `_delete_page_links(ids, session)` out of
  `_purge_pages` (same delete, now a named, reusable step) and call it from `delete_page` (the
  trash route) right after setting `deleted_at`, so the link cut happens on trash, not just purge.
- `apps/api/app/routes/calendar.py` — added `_linked_workout_and_meal(session, event_id)`, which
  looks up whatever `workout_session`/`meal_log` is currently linked to an event via the
  `logged_from` relation, regardless of status. `copy_events` now calls it per source event and,
  when present, creates a new planned `WorkoutSession`/`MealLog` plus a `Link` from the pasted
  event to it — mirroring the existing `_create_linked_entries` convention used for recurring
  occurrences.

## How the pieces connect

Both fixes reuse existing conventions rather than adding new ones: link cleanup follows the same
delete-by-source-or-target-id pattern already used by `_purge_pages`/`_delete_event_links`, and the
copy-duplication follows the same "new planned entry + `logged_from` Link" shape that
`_create_linked_entries` already uses when a recurring event's connections are (re)created. No new
concepts were introduced — `_delete_page_links` is just the pre-existing purge logic pulled out to
a name so `delete_page` can call it too, and `_linked_workout_and_meal` is a direct query against
the same `Link` table `_linked_planned_sessions`/`_linked_planned_meals` already read, minus the
`status == "planned"` filter (copy needs to see logged sessions too, since those are exactly the
ones worth duplicating as a new planned repeat).

## How to modify this later

- If notes need their event links restored when un-trashed (`restore_page`), that's a deliberate
  omission here — the user asked for links to be removed on trash, not preserved for potential
  restore. Add that only if explicitly requested; it would need the pre-delete link snapshot
  kept somewhere, since `_delete_page_links` currently hard-deletes the rows.
- If pasted events should also duplicate `SetEntry` rows (actual logged sets) instead of just the
  session's `type`/`plan`, extend `copy_events`' workout branch — it currently intentionally leaves
  the new session as an empty "planned" shell, same as `_create_linked_entries` does for recurring
  occurrences.
