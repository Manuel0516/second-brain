# 0220 — Tool summaries were dropping the entity id the model needs for follow-ups

Date: 2026-08-15
Status: accepted

## What changed

`0219` added a `list_calendars` tool so the agent could stop guessing calendar ids — but
the user still hit `API returned 404: {"detail":"Not found"}` on `create_event` right
after. Root cause, verified live: `tools.py::_summarize()` — the function that turns a
tool's raw API response into the text the model actually reads back — picked a `title`/
`name` label for any dict/list-of-dicts result and **discarded the `id` entirely**:

```python
labels = [str(item.get("title") or item.get("name") or item.get("id")) for item in data[:3]]
...
label = data.get("title") or data.get("name")
return str(label) if label else f"Done ({len(data)} field(s))."
```

So `list_calendars` really did run, but the model only ever saw `"4 result(s): Default,
Fitness, Personal, Work"` — the calendar *names*, never their ids. Calling `create_event`
right after, the model still had no real id to use and had to guess one again, hitting the
exact malformed-UUID path `0219` already found (now cleanly 404ing instead of 500ing, but
still failing). The same blind spot applied to **every** entity-returning tool result,
including `create_event`'s own success confirmation — a created event's summary was just
its title, never its id, which is exactly the id `create_link` needs for "link this event
to the gym session." This is arguably the deeper root cause behind the whole
create-then-link flow struggling across `0218`/`0219`.

Fixed in `_summarize()` (and its new `_entity_label()` helper): any entity with a `name`/
`title` **and** an `id` now renders as `"Name (the-real-id)"` in both list and single-object
summaries, so the model can read an id straight out of any tool result.

## Why

Direct user follow-up: adding `list_calendars` alone didn't fix the reported flow, because
its result — like every other entity-returning tool's result — never surfaced the id the
model actually needed next.

## Files touched

- `apps/api/app/modules/ai/tools.py` — `_entity_label()`; `_summarize()` uses it for both
  the list-of-dicts and single-dict branches instead of dropping `id`.
- `apps/api/tests/test_ai.py` — `list_calendars`'s summary contains the real calendar id;
  `create_event`'s summary contains the newly created event's id.

## How the pieces connect

`_summarize()` is the single choke point for every tool's `summary` string — `_call()`,
`get_app_summary`, `list_skills`, `recall`, and the self-management tools (`list_tools`)
all route through it, so this one fix applies uniformly everywhere an id-bearing entity
(or list of them) is returned, not just calendars/events.

## How to modify this later

If a tool's result entity uses a different id-like field name (not literally `id`), extend
`_entity_label` rather than adding a one-off branch elsewhere — keep entity-id visibility a
property of the shared summarizer, not something each tool has to remember to do itself.
