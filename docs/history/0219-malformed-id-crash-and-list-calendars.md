# 0219 — Fix the real create_event 500: malformed-UUID crash + missing list_calendars tool

Date: 2026-08-15
Status: accepted

## What changed

`0218` fixed `create_link`'s hardcoded types, but the user's follow-up report showed the
*same* "API returned 500: Internal Server Error" now coming from a `create_event`
confirmation instead. Root cause, confirmed by reproducing directly against the real
Postgres dev database:

- The agent had **no tool to discover real calendar ids** — `create_event`'s only clue was
  a `calendar_id` string parameter with no way to look one up. Facing a brand-new
  conversation with no prior calendar id in context, the model guessed one.
- A guessed id is essentially never a valid UUID. `session.get(Calendar, calendar_id)`
  (`routes/calendar.py::readable_calendar`, reached via `writable_calendar` in
  `create_event`) binds that string straight into a UUID-typed Postgres column — Postgres
  rejects malformed UUID text at the wire level (`psycopg.errors.InvalidTextRepresentation:
  invalid input syntax for type uuid`), which surfaces as an **unhandled** `DBAPIError`,
  i.e. a raw 500. Confirmed live: `session.get(Calendar, "not-a-real-uuid")` against the
  real dev DB raises exactly this.
- This is invisible to the test suite, which runs on SQLite — SQLAlchemy's UUID type is
  lenient there and just returns "not found" cleanly. The bug only exists on the
  Postgres-backed dev/prod stack, which is why it wasn't caught before shipping.

Two fixes, addressing both the trigger and the crash:

1. **New `list_calendars` read tool** (`GET /api/calendars`) so the agent can look up real
   calendar ids instead of guessing. `create_event`'s tool description and the system
   prompt's `create_link` note both spell out "never guess an id — use `list_calendars` /
   the ids a tool result already gave you."
2. **Global `DBAPIError` exception handler** in `main.py`: any malformed-UUID-format
   database error now returns a clean `404 {"detail": "Not found"}` instead of crashing.
   This protects *every* route that looks up a user/agent-supplied id, not just calendars —
   the same crash was structurally possible anywhere an id string reaches a UUID column
   unvalidated. Any other unhandled `DBAPIError` still 500s with a generic message (never
   leaks the raw DB error, per `apps/api/AGENTS.md`).

Verified live against the real dev Postgres database (not just the SQLite test suite): the
exact request that used to 500 (`POST /api/events` with a bogus `calendar_id`) now returns
a clean 404.

## Why

Direct user bug report, reproduced and root-caused rather than guessed at.

## Files touched

- `apps/api/app/main.py` — `malformed_id_handler` exception handler for `DBAPIError`.
- `apps/api/app/modules/ai/tools.py` — new `list_calendars` tool; `create_event`'s
  description now tells the model to use it instead of guessing.
- `apps/api/tests/test_ai.py` — `list_calendars` returns the user's real calendars.

## How the pieces connect

The exception handler is a safety net for *any* route, not specific to calendars —
`create_link`'s node lookups, `update_event`/`delete_event`'s event id, and any future
agent tool that takes an id all funnel through `session.get`/`select(...).where(Model.id ==
...)` against UUID-typed columns, all exposed to the same crash class. `list_calendars` is
the targeted prevention for the one path actually observed failing; the exception handler
is the general containment so the *next* undiscovered instance of this pattern degrades to
a clean 404 instead of a crash.

## How to modify this later

If a future agent tool needs another id the model can't already infer from a prior tool
result (e.g. exercise ids, page ids for linking), give it a `list_*`/`search_*` read tool
the same way — don't rely on the model guessing. The `malformed_id_handler` matches on the
Postgres error string; if the DB driver or Postgres version ever changes that message,
update the match in `main.py` (a broader fallback would be to catch `DBAPIError` generally
and always 404, but that would also mask genuine data-shape bugs as false 404s — the string
match keeps the net narrow on purpose).
