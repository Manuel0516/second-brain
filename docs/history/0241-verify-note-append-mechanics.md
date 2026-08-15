# 0241 — Verified the "add a section without losing existing content" note pattern

Date: 2026-08-15
Status: accepted

## What changed

User asked me to check that the full recurring-Willys-check prompt actually works, including
the part that adds a new dated section to their grocery/shopping-list note without wiping the
rest of it. Re-verified `web_fetch`'s Willys steps against the live site again (still works,
222 products, confirmed store). For the note-append half, checked `update_page`'s route
(`PagePatch.content`) and confirmed it's a **full replacement** field, not a server-side merge
— so "add a section, keep the rest" only works if the agent itself does `get_page` (read
current content) → construct new Tiptap JSON with the new section prepended to the existing
blocks → `update_page` (write the merged result) — nothing in this app's plain HTTP API does
that automatically.

There was no test proving that round trip actually preserves original content when done this
way, so added one: create a page with existing content, `get_page` it, prepend a new
section client-side (the exact shape the agent should produce), `update_page` with the merged
doc, then `get_page` again and assert both the original text and the new section are present.

Also checked the user's actual local dev database directly — it currently has zero pages (a
fresh/seed instance, not their populated production data, which this sandbox has no access to)
— so I could not confirm a "grocery/shopping list" note already exists there. That's something
only checkable from their real deployed instance, not from here.

## Why

User request: verify the full step-by-step prompt (web_fetch the offers, summarize, then find
and update their grocery note) actually works before they rely on it.

## Files touched

- `apps/api/tests/test_ai.py` — added
  `test_get_page_then_update_page_prepends_without_losing_existing_content`, proving the
  get→merge→update pattern preserves prior content while adding new content, using
  `tools.execute` directly (same path the agent's tool calls go through).

## How the pieces connect

This test documents and guards the exact mechanic the recurring-Willys-check prompt depends on
for its "don't overwrite the note" instruction — if `update_page`'s route ever changes shape
(e.g. gains a real patch/append mode, or the content field's semantics change), this test is
the thing that would need updating, and its docstring is where a future reader finds out why
the prompt's wording insists on "read existing content first."

## How to modify this later

- If losing note content to an LLM-constructed full-replacement `update_page` call ever
  actually happens in practice (a bad merge, not this test's synthetic-but-correct one), the
  fix is a real append-only endpoint/mode on the pages route — not something to solve by
  tightening tool-description prose further, since the model has to correctly round-trip
  Tiptap JSON either way.
- I could not confirm whether the user's real production notes already contain a grocery/
  shopping-list page — that data isn't reachable from this dev sandbox. If the agent can't find
  one when asked, it should say so and ask whether to create one, not silently give up or
  invent a page.
