# 0153 — Multi-photo analysis calendar-sync greenlet fix

Date: 2026-07-22
Status: accepted

## What changed

The calendar polling pass now discovers due calendar IDs first and syncs every calendar in its
own async database session. Multi-photo meal analysis also moves each synchronous MinIO download
to a worker thread instead of blocking the event loop.

## Why

When one calendar sync failed, rolling back its shared session expired every other loaded
`Calendar`. Reading the next expired calendar attribute attempted asynchronous PostgreSQL I/O from
a synchronous ORM attribute loader and raised `sqlalchemy.exc.MissingGreenlet`. Multiple image
downloads made the event-loop contention more visible while analyzing meals.

## Files touched

- `apps/api/app/main.py` — isolates calendar sync transactions by calendar and avoids reading ORM
  objects after another calendar's rollback.
- `apps/api/app/routes/food.py` — runs blocking MinIO downloads outside the async event loop.
- `apps/api/tests/test_calendar_sync_loop.py` — proves a failed Google sync does not prevent the
  next ICS calendar from syncing.

## How the pieces connect

The polling pass now closes its discovery session before opening one session per due calendar.
Expected provider failures roll back only that calendar's transaction. Meal analysis continues to
preserve photo order while awaiting each storage download through `asyncio.to_thread`, leaving the
event loop available for database and background-sync work.

## How to modify this later

Keep per-calendar session isolation if the poller gains more providers or retry behavior. Do not
reuse ORM instances across rollback boundaries. Storage SDK calls are synchronous; any additional
blocking storage work added to async Food routes should use the same thread-offload pattern.
