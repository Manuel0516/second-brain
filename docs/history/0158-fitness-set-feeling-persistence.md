# 0158 — Fix fitness set feeling persistence

Date: 2026-07-22
Status: accepted

## What changed

The fitness set creation endpoint now saves the submitted per-set feeling value. Added an API
regression test that creates a set with a feeling and verifies the same value is returned by the
workout history endpoint.

## Why

Completed workouts showed an empty feeling in Fitness history even when the user selected one
during the live session. The frontend submitted the value, but the API left it out when building
the database row, so it was discarded before history loaded it again.

## Files touched

- `apps/api/app/routes/fitness.py` — maps the validated `feeling` request field onto new
  `SetEntry` rows.
- `apps/api/tests/test_fitness.py` — covers feeling persistence across set creation and history
  retrieval.
- `docs/history/0158-fitness-set-feeling-persistence.md` — records the fix and its data flow.
- `docs/history/CHANGELOG.md` — indexes this history entry.

## How the pieces connect

The live fitness UI sends each selected feeling to the set creation endpoint. FastAPI validates
it as a value from 1 through 5, stores it on `SetEntry.feeling`, and includes it when the history
view fetches the session's sets. The existing history component uses that returned value to mark
the corresponding feeling circle as selected.

## How to modify this later

Keep `SetEntryCreate`, the `SetEntry` constructor in `create_set_entry`, `SetEntryResponse`, and
the frontend `SetEntry` type aligned when adding or renaming per-set fields. Extend
`test_created_set_preserves_feeling` so a create-and-fetch round trip catches any dropped field.
