# 0256 — Stop the agent wiping notes, and why dev behaves differently from production

Date: 2026-08-16
Status: accepted

## What changed

`tools.execute` now refuses an `update_page` that would delete most of an existing
page. `PATCH /api/pages/{id}` assigns `content` wholesale (`setattr(page, key, value)`
in `patch_page`), so a model that sends only the blocks it was thinking about — or a
badly reconstructed document — silently destroys everything else, with no undo prompt
because the write itself "succeeded".

The guard reads the page first and compares extracted text length. If the page had
real content (≥200 chars) and the incoming document keeps less than half of it, the
write is refused and the model is told to use `append_page_content`, or to call
`get_page` and resend the complete document.

## Why

User report: "the agent editing the notes has soooo many problems… it cannot modify
notes, it just deletes everything." This is the mechanism behind that. The
append-only endpoint from 0243 exists precisely because reconstructing a doc is
error-prone, but `update_page` was still reachable and unguarded.

## Confirmations: checked, and they work

The same report suspected the confirmation flow. It was probed directly against the
running dev API: a pending `AIAction` + `awaiting_confirmation` message was staged for
**all 19 write tools** and `POST /conversations/{id}/confirm` was called for each.
Every one confirmed and applied. The apparent failures in the first pass were probe
artifacts, worth recording so this is not re-investigated:

- `"stream error"` lines all carried `"name": "probe_tool"` — that is the *resumed*
  agent turn calling a throwaway tool the probe itself had created, not the confirmed
  tool failing.
- `append_page_content` and `log_workout_session` 422s were the probe sending a string
  where the schema requires an array / an object. The tool schemas match the API
  contracts.
- `analyze_meal_log_photo` 502'd correctly on a non-existent meal-log id.

So the confirmation machinery is sound; the damage was happening *after* a successful
confirm, inside `update_page`.

## Why dev and production behave differently

**AI settings live in the database** (`ai_settings`), per user — provider, model,
autonomy level, and the feature toggles. Dev and production run **separate
databases**, so they are configured independently and nothing syncs them. Dev was on
`deepseek/deepseek-v4-flash`; a small fast model is far more likely to emit malformed
Tiptap JSON or a partial document, which is exactly what the destructive path above
punishes.

Anything that differs between the environments therefore comes from one of:

1. **`ai_settings` row** — model/provider/autonomy/toggles. The usual culprit.
2. **Applied migrations** — `alembic current` must match; a missing column surfaces as
   "Could not load AI settings" (as it did for `willys_offers_enabled` in 0254).
3. **Deployed code version** — production runs a built image; local dev runs the
   working tree via `npm run dev:api` with `--reload`, so local is usually ahead.

To compare, run in each environment:

```
uv run --directory apps/api alembic current
select provider, model_name, autonomy_level from ai_settings;
```

Aligning the `model_name` between the two is what makes agent behaviour comparable.
Note the dev `compose.dev.yaml` `api` container is **not** what serves dev requests —
`scripts/dev-start.sh` runs the API on the host — so a stale `secondbrain-api-1`
container can be ignored.

## Files touched

- `apps/api/app/modules/ai/tools.py` — `_doc_text()` (walks a Tiptap doc collecting
  text at any depth), `_LOSS_RATIO`/`_LOSS_FLOOR`, `_guard_content_loss()`, and the
  check at the top of the generic dispatch in `execute()`.
- `apps/api/tests/test_page_guard.py` — new. Refuses a destructive rewrite and leaves
  the page byte-identical; allows a genuine full-document edit; leaves short pages
  alone; `_doc_text` walks nested lists.

## How the pieces connect

The guard sits in `tools.execute`, so it covers every path that reaches `update_page`
— the auto-execute path in `agent.py`, the `/confirm` route, and any agent-created
spec tool — rather than only the one the report came through. It fails **open**: if
the page cannot be read (network blip, non-200), the write proceeds, because blocking
legitimate edits on an unrelated failure is worse than the rare miss.

`create_page` internally calls `update_page` to set initial content; that page is
empty at the time, so `_LOSS_FLOOR` lets it through untouched.

## How to modify this later

- **Guard is too strict / too loose**: `_LOSS_RATIO` (0.5) and `_LOSS_FLOOR` (200
  chars) in `tools.py`. Raising the floor exempts more small notes; lowering the ratio
  allows bigger deletions.
- **A genuine "clear this note" request is blocked**: that is deliberate — the refusal
  text tells the model to have the user do it in the app. If this should ever be
  allowed, add an explicit `confirm_delete: true` argument to `update_page` rather
  than weakening the ratio, so erasure is always intentional.
- **Same hazard elsewhere**: any future tool that replaces a whole document should
  reuse `_guard_content_loss`. `update_event` and friends patch individual fields and
  are not exposed to this.
