# 0066 — Fitness planned sessions + cardio overhaul (Phases 1–3)

Date: 2026-07-05
Status: accepted

## What changed

Implemented Phases 1–3 of the fitness/planned-sessions plan:

- **Migration 018** (`apps/api/alembic/versions/018_planned_sessions_cardio.py`): adds
  planned-session lifecycle columns (`status`, `scheduled_at`, `plan`) to `workout_sessions`,
  cardio fields (`distance_km`, `duration_min`, `pace`) to set entries, and backfills
  existing rows as `completed`.
- **Models + schemas** (`apps/api/app/models.py`): new columns with server-default
  `'completed'` so existing rows are backfilled without a data migration; Pydantic
  schemas extended for planned/cardio payloads.
- **Fitness API** (`apps/api/app/routes/fitness.py`): planned-session lifecycle
  (create planned → start → complete), cardio set entries, goals, body metrics,
  overview stats (feeling trend, volume/week, personal records, cardio pace stats).
- **Calendar hook** (`apps/api/app/routes/calendar.py`): creating a workout-typed event
  creates a planned session in the same transaction; deleting the event cleans up its
  un-started planned session. One-directional (backend-only, event → session) to avoid
  circular writes.
- **Notes links** (`apps/api/app/routes/notes.py`): `GET /events/{event_id}/links`
  returns linked nodes both directions (`LinkedNodeResponse`).
- **Frontend** (`apps/web/src/modules/fitness/*`, `EventEditor.tsx`, `TimeGrid.tsx`):
  fitness UI rework — SessionForm/LiveSession support planned sessions and cardio,
  new `BodyMetricForm`, `GoalsSection`, `ExerciseStats`, Overview landing graphs,
  fitness type cards in the event editor.

## Why

Planned workouts were previously rolled back (see 0063) because the event↔session sync
was bidirectional and fragile. This reintroduces the feature with a one-directional
backend hook and an explicit session lifecycle, plus first-class cardio tracking.

## Files touched

- `apps/api/alembic/versions/018_planned_sessions_cardio.py` — migration.
- `apps/api/app/models.py` — session status/plan columns, cardio set fields, schemas.
- `apps/api/app/routes/fitness.py` — lifecycle, cardio, goals, body metrics, stats.
- `apps/api/app/routes/calendar.py` — planned-session create/cleanup hook.
- `apps/api/app/routes/notes.py` — event links endpoint.
- `apps/web/src/modules/fitness/*` — UI overhaul (forms, live session, stats, goals).
- `apps/web/src/modules/calendar/EventEditor.tsx` / `TimeGrid.tsx` — fitness type cards.

## How the pieces connect

Calendar events of a workout type spawn a planned `WorkoutSession` (status `planned`).
Starting it from the fitness module flips it to `active`, completing it to `completed`;
`scheduled_at` is NULL once completed. Deleting the event only removes sessions that
never started. The frontend reads lifecycle state from the session, never infers it
from the calendar.

## How to modify this later

Keep the event→session hook one-directional; if session→event sync is ever needed,
add it as an explicit user action, not an implicit write. Cardio fields are nullable
on set entries — strength rows simply leave them NULL, so new modalities can follow
the same pattern without another migration of existing rows.
