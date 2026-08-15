# 0229 — AI agent can link a planned (not started) workout to a new event in one call

Date: 2026-08-15
Status: accepted

## What changed

The AI agent had no way to create a "planned" workout session — `log_workout_session` always
hardcoded `status: "completed"` on the row it POSTs to `/api/fitness/sessions`, with no
`status` param exposed at all. Asked to schedule a future gym session "without a plan, to
finish at the gym," the agent could only: create the event, call `log_workout_session`
(silently forcing it to `completed`), then `create_link` the two — producing a workout that
looked already-finished instead of a `planned` one waiting to be started, exactly the bug the
user reported ("it is already in the started state"). Retrying the request, the agent looped
on `discover_capabilities`/`list_tools` hunting for a way to express "planned" that didn't
exist, burned its tool-call budget, and hit the "I made too many tool calls without finishing"
guard in `agent.py`.

The app already has the right primitive for this: `create_event`'s `connections.fitness` field
(`FitnessConnection`, `apps/api/app/routes/calendar.py`) atomically creates the event plus a
linked `planned` `WorkoutSession` with no exercises — it's what `EventEditor.tsx` uses. The
agent's `create_event` tool just never exposed it. Added an optional `workout_type` param to
`create_event`'s schema; when set, the tool's request builder now sends
`connections: {fitness: {workout_type: ...}}` in the POST body instead of a bare event, reusing
that existing hook. Also reworded both tools' descriptions so the model reaches for
`create_event(workout_type=...)` to plan a future workout and reserves `log_workout_session`
for logging one that already happened.

## Why

User request, reproduced from the linked chat transcript: planning a workout ahead of a gym
visit left the session already `active`/`completed` instead of `planned`, and the agent's
second attempt at the same request looped until it hit the tool-call ceiling instead of finding
a working path.

## Files touched

- `apps/api/app/modules/ai/tools.py` — `create_event`'s schema gained an optional
  `workout_type: string` property and an updated description; its request builder
  (`_request`) now pops `workout_type` out of the args and nests it into
  `connections.fitness.workout_type` on the POST body when present. `log_workout_session`'s
  description now explicitly says it always creates a `completed` session and points at
  `create_event`'s `workout_type` for planning ahead.
- `apps/api/tests/test_ai.py` — added
  `test_create_event_with_workout_type_links_a_planned_session`, asserting a `create_event`
  call with `workout_type` produces a `WorkoutSession` with `status == "planned"`,
  `plan is None`, and a `Link` row connecting the new event to it.

## How the pieces connect

`create_event`'s request builder in `tools.py` now targets the same `POST /api/events` route
and `EventWrite`/`EventConnections`/`FitnessConnection` Pydantic models the calendar UI already
uses — no new backend logic was added. The event-creation route's existing
`_create_linked_entries` hook (`apps/api/app/routes/calendar.py`) does the actual work of
inserting the `planned` `WorkoutSession` and the `Link` between it and the event; the agent
tool is just a thinner pass-through to that hook instead of the manual
create+log+link sequence it used before.

## How to modify this later

- If the agent should also be able to plan a meal alongside an event the same way, add a
  `meal_type` param next to `workout_type` following the identical pattern — `EventConnections`
  already supports `food` on the backend, only the tool schema and `_request` mapping would
  need the same treatment.
- `log_workout_session` still has no way to create a `planned` session directly (only via a
  linked event). If a future request needs a standalone planned session with no calendar event,
  that's a new `status`/`plan` param on `log_workout_session` itself rather than routing
  everything through `create_event`.
