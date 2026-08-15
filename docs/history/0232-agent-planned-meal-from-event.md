# 0232 — AI agent can link a planned meal to a new event (food parity with 0229)

Date: 2026-08-15
Status: accepted

## What changed

User report: on the Food overview page, meals linked/created by the AI agent never showed the
"Log meal"/"Edit note" buttons that manually-created meals get. Root cause traced to
`apps/web/src/modules/food/Overview.tsx` — those buttons only render for meals in the
"Planned meals" section (`meal.status === 'planned'`, lines ~55/264-283). Meals with
`status === 'logged'` render in a separate read-only "Logged meals" summary card with no
buttons (by design — that card is for meals already fully logged, editable instead via
`History.tsx`'s Edit/Delete buttons).

The agent's `log_food` tool (`apps/api/app/modules/ai/tools.py`) hardcodes
`"status": "logged"` on every meal it creates — there was no way for it to create a
`planned` meal at all. This is exactly the same bug already fixed for workouts in
[0229](0229-agent-planned-workout-from-event.md), which explicitly flagged food as the
deferred follow-up ("How to modify this later": *"If the agent should also be able to plan a
meal alongside an event the same way, add a `meal_type` param next to `workout_type`... only
the tool schema and `_request` mapping would need the same treatment"*). Implemented that:
`create_event` now also accepts an optional `meal_type` (breakfast/lunch/dinner/snack) that
maps to `connections.food.meal_type` in the POST body, reusing the same
`_create_linked_entries` calendar hook that already creates a `planned`, detail-free `MealLog`
linked to the event — the same connection `EventEditor.tsx` offers. `log_food`'s description
was reworded to match `log_workout_session`'s (0229) and `meal_type`'s guidance mirrors
`workout_type`'s (0231): it's label-only, the linked meal is always created with no
calories/macros filled in regardless of which meal_type is picked, so the model should just
pick one rather than asking.

## Why

User request: fix agent-created meal logs missing their action buttons on the Food overview
page. Traced to the meal never entering the `planned` state the UI's button-gating logic
requires — the food-side counterpart of the workout bug fixed in 0229, and the exact gap that
entry's own "how to modify this later" note predicted.

## Files touched

- `apps/api/app/modules/ai/tools.py` — `create_event`'s schema gained an optional
  `meal_type` enum property and description text (mirroring `workout_type`/0231's
  "don't ask, just pick a label" guidance); its request builder (`_request`) now builds a
  `connections` dict from whichever of `workout_type`/`meal_type` are present instead of only
  handling fitness. `log_food`'s description now states it always creates a `logged` meal and
  points at `create_event`'s `meal_type` for planning ahead.
- `apps/api/tests/test_ai.py` — added
  `test_create_event_with_meal_type_links_a_planned_meal`, asserting a `create_event` call with
  `meal_type` produces a `MealLog` with `status == "planned"`, `calories is None`, and a `Link`
  row connecting the new event to it.

## How the pieces connect

Same wiring as 0229: `create_event`'s `_request` branch is a thin pass-through to
`POST /api/events`'s existing `EventWrite`/`EventConnections`/`FoodConnection` Pydantic models
and the `_create_linked_entries` hook in `apps/api/app/routes/calendar.py` — no backend route
or model logic changed, only what the agent tool sends. `Overview.tsx`'s button gating on
`status === 'planned'` was correct and untouched; the fix ensures agent-created meals actually
reach that status instead of skipping straight to `logged`.

## How to modify this later

- Standalone planned meals (no calendar event) still aren't reachable from the agent — same gap
  noted for workouts in 0229. If needed, that's a `status`/blank-details param on `log_food`
  itself, not a `create_event` concern.
- If a third connection type gets exposed to the agent later (e.g. a finance connection), follow
  this same pattern: one optional param on `create_event`, one `connections.<key>` branch in
  `_request`, one "label-only, don't ask" line in the description, one regression test.
