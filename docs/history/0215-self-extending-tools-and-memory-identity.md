# 0215 — Self-extending spec tools, bot photo ingestion, memory identity & growth

Date: 2026-08-15
Status: accepted

## What changed

Implemented Phase 7 and Phase 8 of `docs/work/plans/embedded-agent/README.md` §15–16:

**Phase 7 — self-extending spec tools + bot photo ingestion**
- New `AITool` model/table: agent-visible tools declared as specs (`method`, `path`,
  `args`) executed by a generic runner (`modules/ai/spec_tools.py`) — never arbitrary code.
  Every spec is validated at create time against the app's own registered routes
  (`spec_tools.validate_spec`), so a spec can only ever call an endpoint that already exists.
- Nine seed specs (`source="system"`): eight fitness/food reads (`workout_session_detail`,
  `workout_session_sets`, `recent_workouts`, `exercise_stats`, `body_weight_stats`,
  `body_metrics`, `meal_logs`, `get_fitness_goals`) and one write (`set_meal_log_status`,
  with a fixed-revert undo).
- Five self-management tools the agent can call on itself: `list_tools`, `create_tool`
  (gated — validates the spec, source="agent"), `update_tool`, `enable_tool`, `disable_tool`.
- `tools.schemas_for(session, user_id)` replaces the static `tools.schemas()` at the agent
  loop's call sites — merges hardcoded + this user's enabled spec tools, and returns an
  `is_write` map `agent.py` now dispatches from instead of the static `BY_NAME` lookup.
- Bot photo ingestion: `apps/bot/bot.py` gets a stdlib multipart/form-data encoder
  (`api_upload_file`), downloads a Telegram photo, uploads it to the existing `/api/files`
  endpoint, and feeds a synthesized `[Photo attached — file_id=...]` message into the
  existing text pipeline — no new SSE/confirm path. `log_food` gained an optional
  `photo_file_ids` arg (the create-meal-log endpoint already accepted the field); a new
  `analyze_meal_log_photo(id)` tool runs the existing vision-based nutrition analysis.
- **Deviation from the written plan (checked against live code):** the plan's "endpoint gap"
  requiring a new `PUT` meal-log route was stale — `PATCH /api/food/logs/{id}` and
  `POST /api/food/logs` already accept `photo_file_ids`. No new route was added.

**Phase 8 — identity & growth**
- `AIMemory.category` column (`fact`|`profile`|`preference`|`correction`, default `fact`).
  `remember(fact, category)` validates/falls back to `fact`; a new gated `forget(fact|category)`
  deletes one entry or a whole category; a new `profile()` read tool renders "what I know
  about you" grouped by category.
- `prompts.py::build_system_prompt` now renders a categorized "About {username}" block
  (profile/preference/correction first, then the 20 most recent `fact` entries), a
  learning-loop instruction (call `remember(..., category=...)` for durable facts/preferences
  and corrections, acknowledging corrections visibly), a thin-profile seeding instruction
  (at most one profile-building question per conversation while identity entries < 5, only
  after checking existing data), and an "(agent-created)" untrusted-description warning when
  any agent-created tool is enabled.
- Memory consolidation is a seeded `AISkill` (`memory-consolidation`), not a new tool — the
  agent loads it on a manual "review your memory" nudge and executes the procedure with the
  existing `remember`/`forget` tools.
- **Deviations from the written plan, decided with the user:** `remember`/`recall`/`profile()`
  stay ungated (matches the already-shipped low-friction behavior and the existing
  `test_memory_and_skills_are_durable_across_conversations` test) — only `forget` and the
  Phase 7 self-management tools are gated writes. Consolidation is the seeded-skill approach
  above, not a dedicated `consolidate_memory()` tool with LLM-in-tool-execution plumbing, and
  there is no bot cron scheduler — the nudge is manual only.

## Why

The user's own accepted plan (written 2026-08-13) called for the agent to extend its own
tool registry safely (declarative specs, not code) and to build a durable, categorized
model of the user so answers compound in quality over time. Both phases were scoped and
two ambiguous points (memory-write gating, consolidation mechanism) were resolved with the
user toward the lower-new-surface-area option before implementation.

## Files touched

- `apps/api/app/models.py` — `AITool` model; `AIMemory.category` column.
- `apps/api/alembic/versions/030_ai_tools.py`, `031_ai_memory_category.py` — new migrations.
- `apps/api/app/modules/ai/spec_tools.py` — new: seed specs, spec validation/execution/undo,
  self-seeding.
- `apps/api/app/modules/ai/tools.py` — `schemas_for`; spec-tool dispatch fallback in
  `execute`/`undo`; new hardcoded tools (`forget`, `profile`, `list_tools`, `create_tool`,
  `update_tool`, `enable_tool`, `disable_tool`, `analyze_meal_log_photo`); `log_food` gains
  `photo_file_ids`.
- `apps/api/app/modules/ai/memory.py` — categorized `remember`/`forget`/`profile`; seeded
  `memory-consolidation` skill content.
- `apps/api/app/modules/ai/agent.py` — dispatches via `schemas_for`'s `is_write` map instead
  of the static `BY_NAME` lookup; `_entity_type` covers new tool names.
- `apps/api/app/modules/ai/prompts.py` — categorized "About" block, learning-loop and
  seeding instructions, agent-created-tool warning, photo-attachment instruction.
- `apps/bot/bot.py` — `api_upload_file`, `_multipart_body`, `tg_download_file`,
  `handle_photo`; wired into `handle_update`.
- `apps/api/tests/test_ai.py` — 10 new tests covering seeded/created spec tools (read, write,
  undo, validation, disabled), categorized memory, gated `forget`, the categorized prompt
  block, and the consolidation-skill smoke test.
- `apps/bot/test_bot.py` — multipart encoder test.
- `docs/architecture/DATABASE.md` — `ai_tools`/`ai_memories.category` documented; migration
  history rows 030/031.

## How the pieces connect

`tools.schemas_for()` is the single per-turn entrypoint `agent.py` calls before each
`provider.complete()`: it lazily seeds a user's default `AITool` rows and the
`memory-consolidation` skill (same lazy-singleton pattern as `AISettings`), then returns
hardcoded + enabled-spec-tool schemas plus a combined `is_write` map. Dispatch in
`tools.execute()`/`tools.undo()` checks the hardcoded `BY_NAME` first and falls back to an
`AITool` row lookup by `(user_id, name)` for anything else — so `routes/ai.py`'s
confirm/reject/undo endpoints needed **no changes**, since they already call
`tools.preimage`/`tools.execute`/`tools.undo` generically by tool name. The bot's photo flow
reuses `handle_message` entirely (typing indicator, tool-call loop, confirm keyboard) by
synthesizing ordinary text — the agent's only new capability is knowing (via the system
prompt) that `[Photo attached — file_id=...]` maps to `log_food`'s `photo_file_ids`.

## How to modify this later

- Add a new seeded spec tool: append to `spec_tools.SEED_SPECS` — verify the path against a
  real route in `routes/*.py` first, `ensure_seeded` only inserts once per user (existing
  users won't retroactively get new seeds; bump to a per-seed check if that's ever needed).
- Add a new self-management tool: follow the `list_tools`/`create_tool`/... branch in
  `tools.execute()` — keep write-capable ones gated (`is_write=True` in the `Tool(...)` entry).
- The spec engine's binding rule: args matching a `{placeholder}` in `path` go into the URL;
  everything else becomes a query string (GET/DELETE) or JSON body (POST/PUT/PATCH) — mirrors
  the hardcoded `tools.py::_request` dispatcher. Spec-tool undo is fixed-revert only (declared
  via `spec["undo"]`, no prior-state capture) — extend `spec_tools.preimage` (doesn't exist
  yet) if a future spec tool needs restore-to-prior-value undo.
- Memory categories are a fixed tuple (`_CATEGORIES` in `memory.py`) — adding a category means
  updating that tuple, `prompts.py::_IDENTITY_LABELS` if it should render in the "About" block,
  and the `remember`/`forget` tool schemas' `enum` list in `tools.py`.
