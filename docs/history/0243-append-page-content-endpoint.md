# 0243 — A real append-only note endpoint, replacing the get-merge-update dance

Date: 2026-08-15
Status: accepted

## What changed

0241 proved that "add a section to a note without losing what's there" only worked if the
agent itself did `get_page` → reconstruct the full Tiptap document → `update_page`, since
`update_page`'s `content` field is a full replacement, not a patch. That's real
reconstruction work an LLM has to get exactly right every single time, with no server-side
safety net if it doesn't. User said they'd be using this pattern often (repeated grocery-offer
checks feeding into one running note) and asked for a real "update note" primitive instead of
relying on the model redoing that JSON surgery correctly every time.

Added `POST /api/pages/{page_id}/append` — takes just the new Tiptap block(s) and a
`position` (`"start"` or `"end"`, default `"end"`), and does the merge server-side: reads the
page's current `content.content` array, splices the new blocks in at the requested end, writes
it back. The caller never sees or reconstructs the existing document at all, so there's no way
to get the merge wrong.

Wired it up as a new agent tool, `append_page_content`, alongside the existing `update_page`
(kept as-is, for genuine full-content replacement/rewrite requests) and `create_page`.
`update_page`'s description now explicitly redirects to `append_page_content` for "add a
section" style requests, naming the exact failure mode it replaces. `append_page_content`
supports undo the same way `update_page` does — `preimage` snapshots the page's content via
`get_page` before the call, and `undo` restores it with a plain `content` PATCH.

## Why

User request: a dedicated "add to a note" capability, expecting to use it often (their
recurring grocery-deal-checking routine feeds a shopping list note), instead of relying on the
model to correctly re-derive the whole document every time.

## Files touched

- `apps/api/app/routes/notes.py` — new `PageAppendContent` request model (`content: list[dict]`,
  1-200 items; `position: "start" | "end"`) and `POST /api/pages/{page_id}/append` route.
  Reuses `_editable_page` (same ownership/role check as `patch_page`), `_sync_mentions` (so
  `@mention` nodes in the new blocks still get linked), and the same
  `note_connections.send_others(...)` live-collaboration broadcast pattern as `patch_page`.
  Treats a page's default empty `{"type": "doc", "content": []}` as zero existing blocks
  rather than an edge case, since that's every brand-new page's starting state.
- `apps/api/app/modules/ai/tools.py` — new `append_page_content` `Tool` entry; `_request`
  branch (`POST .../append`); `preimage`'s `read_name` map and `undo`'s restore branch both
  extended to cover it (identical mechanism to `update_page`'s, since undoing either one means
  restoring the page's prior `content`). `update_page`'s description rewritten to point at
  `append_page_content` for additive edits and name why (no server-side merge, don't
  reconstruct it yourself).
- `apps/api/tests/test_notes.py` — `test_append_content_adds_blocks_without_touching_existing_ones`
  (position "end" then "start", ordering, cross-user 404, empty-content 422) and
  `test_append_content_on_a_brand_new_empty_page` (the empty-array edge case above).
- `apps/api/tests/test_ai.py` — `test_append_page_content_tool_adds_blocks_and_can_be_undone`
  (tool dispatch + undo round-trip); extended the schema-shape test for the new tool.

## How the pieces connect

Same authorization/collaboration path as every other page mutation in this file — nothing
about trust boundaries or live-editing changed, only that the merge itself now happens in one
server-side transaction instead of being round-tripped through the caller. The AI agent's
`append_page_content` tool is a thin pass-through (`_request`'s branch) to this route, same
pattern as every other tool in `tools.py`.

## How to modify this later

- `position` is binary (`start`/`end`) — if a future need calls for inserting at an arbitrary
  index (e.g. "after the second heading"), that's a new `position: {"after_block_index": n}`
  variant on the same endpoint, not a new route.
- The 200-block cap on one append call is arbitrary headroom, not a measured limit — raise it
  in `PageAppendContent` if a real use case needs more in one call.
- `update_page` was deliberately left able to fully replace `content` — some requests
  genuinely mean "rewrite this note," and taking that away would just move the problem
  (the model would have to fake a full rewrite via many single-block appends instead).
