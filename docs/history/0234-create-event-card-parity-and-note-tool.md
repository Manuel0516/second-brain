# 0234 — Agent always uses the create-event card's own options, never create+link

Date: 2026-08-15
Status: accepted

## What changed

Standing instruction from the user: whenever the agent creates an event with something linked
to it (a workout, a meal, a note/page — finance intentionally excluded, see below), it must
always go through `create_event`'s own toggle-equivalent options — mirroring exactly what the
calendar UI's "create event" card offers — instead of creating the linked item separately and
then calling `create_link`. 0229/0231/0232 already did this for workouts and meals
(`workout_type`/`meal_type`); this closes the last gap (notes) and fixes the one place that was
still actively steering the agent toward the old create+link pattern.

- Added a new tool, `create_event_note` (`POST /api/events/{event_id}/note`) — wraps the same
  endpoint the calendar UI's Notes toggle uses: creates a page (in `parent_page_id` if given,
  defaulting the title to the event's own title) and links it to the event with relation
  `"note"` in one call, reusing an existing linked note instead of duplicating it. Previously
  the agent had no access to this endpoint at all and could only fall back to
  `create_page` + `create_link` — losing the title/folder defaults and needing an extra call.
- Expanded `create_event`'s schema with the rest of the card's real fields the agent had no
  access to: `icon`, `location`, `link`, `all_day`, `reminder_minutes`, and full recurrence
  (`rrule`, `recurrence_interval`, `recurrence_byday`, `recurrence_count`/`recurrence_until`).
  These all pass straight through to the existing `EventWrite` model — no backend change
  needed, the route already accepted them, the agent just never knew about them.
- Rewrote `create_event`'s description to state upfront that it's "the single entry point for
  any 'event + linked X' request" and to document workout/meal/note handling together instead
  of workout_type's guidance living alone.
- Reworded `create_link`'s description: it's now explicitly for linking two items that already
  exist independently of each other, with a direct pointer to `create_event`'s options/
  `create_event_note` for the workout/meal/note cases, instead of using an event-to-workout
  link as its example (which is now the wrong pattern).
- Fixed the system prompt (`prompts.py`) — it previously told the model outright to "create
  both, then call create_link" for exactly this scenario ("e.g. an event to a workout
  session"), which is what was steering the agent into the old three-call pattern in the first
  place. Now points at `create_event`'s options and `create_event_note` instead.
- `finance` is deliberately NOT exposed as a `create_event` connection: `EventConnections.
  finance`/`FinanceConnection` exist as Pydantic models and the calendar UI has a toggle for
  them, but grepping the whole backend shows nothing ever reads `connections.finance` to
  create an actual transaction — there's no finance module/route in this repo yet. Exposing it
  to the agent would silently do nothing useful, so it's left out until finance is real.

## Why

User request: standing instruction that "event + linked page/workout/meal" must always go
through the create-event card's own options, never separate creation + a manual link — and
that the agent should have full knowledge of everything that card can do.

## Files touched

- `apps/api/app/modules/ai/tools.py` — new `create_event_note` `Tool` entry, `_request`
  branch, `risk_for` (low, alongside `create_page`/`create_event`), and `undo` (reuses
  `_delete_page`, same as `create_page`'s undo). `create_event`'s schema gained
  `icon`/`location`/`link`/`all_day`/`reminder_minutes`/recurrence fields. `create_event` and
  `create_link`'s descriptions rewritten as described above.
- `apps/api/app/modules/ai/agent.py` — `_entity_type` gained an explicit
  `create_event_note` → `"page"` case (checked before the generic `"event" in name` check,
  which would otherwise have misclassified it as an event since the tool name contains
  "event").
- `apps/api/app/modules/ai/prompts.py` — replaced the "create both, then call create_link"
  system-prompt line with guidance pointing at `create_event`'s options/`create_event_note`.
- `apps/api/tests/test_ai.py` — added `test_create_event_note_creates_and_links_a_page`
  (asserts the page is created with the event's title and linked with relation `"note"`);
  extended `test_tool_schemas_match_content_and_route_requirements` to assert the new
  `create_event` properties and `create_event_note`'s required field are present.

## How the pieces connect

`create_event_note`'s `_request` branch is a thin pass-through to the pre-existing
`POST /api/events/{event_id}/note` route (`apps/api/app/routes/notes.py`) — the same route
`EventEditor.tsx`'s "Create a new note" action calls after saving an event with the Notes
toggle on. No backend route or model changed; this entry is entirely about what the agent tool
layer exposes and how its descriptions steer the model, following the exact pattern 0229/0231/
0232 established for workouts and meals.

## How to modify this later

- If finance becomes a real module with an actual transaction-creating route, add a
  `finance_*` set of params to `create_event` following the same pattern (one param cluster,
  one `_request` branch building `connections.finance`, one description paragraph, one test) —
  don't build it against the current stub `FinanceConnection` model until something reads it.
- `create_event_note` intentionally doesn't expose `force_new` (create a second note even if
  one is already linked) — the UI's own "+ new note" affordance uses it for a rare multi-note
  case. Add it as an optional param only if an agent workflow actually needs duplicate notes on
  one event.
