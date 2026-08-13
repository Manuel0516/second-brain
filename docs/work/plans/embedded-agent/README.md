# Embedded Agent — Implementation Plan (Mini-Hermes)

> Status: accepted · Date: 2026-08-13 · Owner: Hermes (orchestration) + gpt-sol (backend) + claude-sonnet (frontend)
> Scope: an AI agent embedded in the Second Brain backend that can read AND write life data
> through the app's own REST API, with Hermes-style memory + self-improving skills.

## 1. Goal

Turn the Second Brain AI chat (spec: `docs/product/AI_ASSISTANT_MODULE.md`) into a real agent:
a ReAct loop that calls **the app's own endpoints as tools**, streams the process to the UI,
confirms every write before committing, remembers durable facts, and saves reusable procedures
("skills") that make it better over time.

Model: `deepseek/deepseek-v4-flash` via OpenRouter (cheap, good tool calling). Provider
interface allows swapping later (Ollama local, etc.).

## 2. Architecture

```
apps/api/app/
  models.py                  + 6 new models (below)
  routes/ai.py               new router: settings, conversations, chat SSE, confirm/reject, undo
  modules/ai/
    __init__.py
    agent.py                 ReAct loop: build messages, call provider, dispatch tools, stream events
    tools.py                 tool registry: name → (schema, is_write, executor)
    executor.py              executes tools by calling the app's own REST API internally
    providers.py             ProviderProtocol + OpenRouterProvider (httpx, zero new deps)
    memory.py                memories + skills CRUD helpers
    prompts.py               system prompt builder (identity, memories, skills index, rules)
    sse.py                   SSE event helpers (plain StreamingResponse, no new deps)
  main.py                    + include_router(ai.router)
```

**Tool execution strategy — internal REST calls.** Every tool executor calls the app's own
HTTP API (the exact endpoints the UI uses) with a short-lived JWT minted server-side from the
user's identity (sign with the same `JWT_SECRET_KEY` + user `sub` format that `routes/auth.py`
uses — inspect `auth.py` and `app/security.py` first and reuse their token/claims shape).
Rationale: routes stay the single source of truth for validation + response models; zero logic
drift; the agent is literally "a client", matching `AI_ASSISTANT_MODULE.md` §1.

**Zero new Python dependencies.** httpx is already in `pyproject.toml`. No `openai` SDK.

## 3. Data model (6 new tables, all scoped to user_id)

| Model | Fields |
|---|---|
| `AIConversation` | id, user_id FK, title (auto from first user message, truncated ~60 chars), created_at, updated_at |
| `AIMessage` | id, conversation_id FK, role (`user`\|`assistant`\|`tool`), content Text\|null, tool_calls JSON, tool_results JSON, status (`complete`\|`awaiting_confirmation`\|`rejected`), created_at |
| `AISettings` | user_id (unique, singleton), provider (default `openrouter`), model_name (default `deepseek/deepseek-v4-flash`), api_key_ref Text\|null (Fernet-encrypted, same pattern as Google tokens), local_endpoint_url\|null, autonomy_level (default `ask_before_write`) |
| `AIMemory` | id, user_id, fact Text, created_at |
| `AISkill` | id, user_id, name (unique per user), content Text (markdown), created_at, updated_at |
| `AIAction` | id, user_id, conversation_id, tool (name), entity_type, entity_id, action (`create`\|`update`\|`delete`), preview JSON (human-readable args), undo_payload JSON, status (`pending`\|`executed`\|`rejected`\|`undone`), created_at |

IDs: string UUIDs matching the existing models' pattern. One Alembic migration
(`uv run alembic revision --autogenerate -m "ai assistant module"` in `apps/api/`), review the
generated file, `uv run alembic upgrade head`.

Where models already have a `created_by` column (e.g. `CalendarEvent.created_by`), AI-created
rows get `created_by="ai_assistant"`. Only tag where the column exists — do NOT add columns to
existing models unless trivial.

## 4. API contract (routes/ai.py, prefix `/api/ai`)

| Route | Purpose |
|---|---|
| `GET /api/ai/settings` | return AISettings (create default row on first access) |
| `PATCH /api/ai/settings` | update provider/model/autonomy_level (never the api_key via this route in v1) |
| `GET /api/ai/conversations` | list, ordered by updated_at desc |
| `POST /api/ai/conversations` | create (title optional; auto-title if missing) |
| `GET /api/ai/conversations/{id}` | conversation + all messages |
| `DELETE /api/ai/conversations/{id}` | 204 |
| `POST /api/ai/conversations/{id}/messages` | **SSE stream** — body `{content}`; runs the agent loop |
| `POST /api/ai/conversations/{id}/confirm` | body `{action_id}` — execute a pending write, resume loop |
| `POST /api/ai/conversations/{id}/reject` | body `{action_id}` — mark rejected, resume loop (model adapts) |
| `POST /api/ai/actions/{id}/undo` | undo an executed AIAction (restore/delete via undo_payload) |

All routes: `Depends(current_user)`, explicit Pydantic `response_model`, same conventions as
existing routers. SSO/cookies handled by the existing auth dependency.

## 5. SSE protocol (chat endpoint)

`Content-Type: text/event-stream`, each event `data: <json>\n\n`. Sequence:

```
{type:"conversation", id, title}
{type:"text_delta", content}            # streamed final-text only (see §6)
{type:"tool_call", name, args}
{type:"tool_result", name, ok, summary} # ok: bool, summary: short string
{type:"confirm_required", action_id, tool, preview}
{type:"message_done", message_id}
{type:"error", message}
{type:"done"}
```

After `confirm_required` the stream **ends** (the loop is paused server-side). The client POSTs
`/confirm` or `/reject`; a NEW stream opens for the continuation. `message_done` fires when the
full assistant message is persisted; `done` closes. Errors mid-loop emit `error` then `done`.

## 6. Agent loop (modules/ai/agent.py)

```
POST /messages {content}
  → persist user AIMessage
  → build messages: system prompt + conversation history (exclude tool deltas > keep full)
  → loop (max 12 iterations):
      if a write action is pending from a previous turn → wait for /confirm (see §7)
      call provider (non-streaming) with tools
      no tool_calls → stream final text (streaming call), persist assistant msg, message_done, done
      tool_calls:
        all reads → execute, persist tool results, continue loop
        any write → stop: persist assistant msg (status awaiting_confirmation) + AIAction rows,
                    emit confirm_required for each, end stream
  → iteration cap exceeded → error event "too many steps"
```

**Provider strategy (robustness over cleverness):** tool-calling turns use NON-streaming
`chat/completions` requests (clean `tool_calls` in the JSON response — no chunk assembly
nightmare with raw httpx); only the final text turn streams (`stream: true`, accumulate deltas,
emit `text_delta`). OpenRouter base URL `https://openrouter.ai/api/v1`. Timeout 90s per call,
one retry on 429/5xx (small backoff). Tool results appended as `role:"tool"` messages with
`tool_call_id` matching the request (OpenAI-compatible format).

## 7. Write confirmation flow (the part that matters)

- Tool registry marks each tool `is_write: bool` (create/update/delete = write; everything else = read).
- Loop executes reads immediately. On the first write tool_call: persist the assistant message
  (tool_calls stored, status `awaiting_confirmation`), persist one `AIAction` (status `pending`)
  per write call with a human-readable `preview` (e.g. `Create event "Dentist" 2026-08-15 09:00`),
  emit `confirm_required`, END the stream. Nothing is executed yet.
- `POST /confirm {action_id}`: set status `executed`, execute the tool, capture `undo_payload`
  (pre-image: for create = the new row's id/fields; for update = prior values; for delete = the
  full deleted object), persist the tool result into the awaiting message, then **resume the
  loop** (provider call with the executed tool result appended) and stream the continuation.
- `POST /reject {action_id}`: status `rejected`, append a tool result `"user rejected this action"`,
  resume the loop so the model can adapt (e.g. "ok, skipping that").
- `POST /undo {action_id}`: only for `executed` actions; apply undo_payload (delete created rows,
  restore prior values, re-create deleted rows). Mark `undone`.
- `autonomy_level` in settings: v1 supports `ask_before_write` only (default). The other levels
  are future — do not implement behavior for them yet.

## 8. Tool registry v1 (tools.py)

Reads (is_write=false), each mapping to an internal REST call:
- `search_pages(query)` → GET `/api/pages/search?q=` · `get_page(id)` → GET `/api/pages/{id}` · `list_pages()` → GET `/api/pages`
- `get_events(start, end)` → GET `/api/events?start_at=&end_at=` (check the real query params in `routes/calendar.py`)
- `get_food_summary(date)` → GET `/api/food/summary?date=` · `get_food_logs(date)` → GET `/api/food/logs?date=`
- `get_fitness_overview()` → GET `/api/fitness/stats/overview`
- `list_exercises()` → GET `/api/fitness/exercises`
- `get_today()` → returns today's date + weekday (no HTTP; injected via tool, cheap)
- `get_app_summary()` → counts: pages, events next 7 days, food logs today, workouts this week (compose from the read endpoints above)
- `remember(fact)` → insert AIMemory · `recall()` → list all memories (concise)
- `list_skills()` · `load_skill(name)` · `save_skill(name, content)` · `delete_skill(name)` → AIMemory-style CRUD on AIMemory/AISkill

Writes (is_write=true, gated by confirmation):
- `create_page(title, content)` → POST `/api/pages` · `update_page(id, title?, content?)` → PATCH `/api/pages/{id}`
- `create_event(title, start_at, end_at, calendar_id?, description?)` → POST `/api/events` · `update_event(id, ...)` → PATCH `/api/events/{id}` · `delete_event(id)` → DELETE `/api/events/{id}`
- `create_link(source_id, target_id)` → POST `/api/links`
- `log_food(meal_type, name, calories?, date?)` → POST `/api/food/logs` (match the real MealLog fields in `routes/food.py`)
- `log_workout_session(exercise_id?, notes?)` → POST `/api/fitness/sessions` (match real fields)

Tool schemas: OpenAI-style `{type:"function", function:{name, description, parameters}}`.
Descriptions must be explicit about required fields (check the Pydantic request models of each
route for required vs optional). Executor maps tool → (method, path, body-builder) and parses
the response into a short `summary` string. Keep tool results concise (<500 chars) — the model
reads them back.

No finance, admin, files, integrations, or Google tools in v1.

## 9. System prompt (prompts.py)

Sections: identity ("You are the assistant embedded in the user's Second Brain — their personal
life OS: calendar, notes, food, fitness"), current date/time (via `get_today`), ALL memories
(`remember`-ed facts, each on its own line), skills index (name + first line of each skill;
instruct: load the full skill with `load_skill` when relevant), tool rules (search before
answering from memory; prefer `search_pages` over guessing), **safety rule** (writes are
proposed and confirmed by the user — never claim a write happened before confirmation),
response style (concise, direct, no fluff; reply in the language the user writes in).

## 10. Memory & skills (the self-improvement DNA)

- `remember(fact)`: durable facts about the user/preferences ("user works out in kg", "user
  prefers Spanish for food logs"). Injected into every system prompt → shape all future turns.
- `save_skill(name, content)`: a short markdown procedure for a recurring task ("when asked
  about weekly calories: get_food_summary + sum per day"). Skills are indexed in the system
  prompt (name + first line); `load_skill` pulls full content when relevant.
- These mirror Hermes's `memory` + `skills` mechanisms in miniature. No auto-suggestions in v1.

## 11. Frontend (Phase 5 — claude-sonnet)

`apps/web/src/modules/assistant/`:
- `AssistantPanel.tsx` — global floating button (fixed, bottom-right, high z-index) opening a
  slide-over panel: conversation list (left) + chat (right). Mounted in the app shell so it is
  available from every page (spec §5: "persistent entry point, not a page").
- `useAssistantChat.ts` — SSE client: `fetch` + `ReadableStream` reader parsing `data:` lines
  (EventSource cannot POST). Handles all event types, exposes state: messages, streamingText,
  pendingConfirmations[], error.
- `ConfirmCard.tsx` — renders `confirm_required`: human-readable preview + **Apply** / **Reject**
  buttons; after apply, an **Undo** link (calls `/undo`).
- Register the module in the app shell/router per the existing module pattern (inspect how
  `modules/fitness` or `modules/notes` mount; follow `docs/design/STYLE_GUIDE.md` tokens —
  calendar page is the visual reference).

API client: extend the existing api client/axios pattern used by other modules. Vite dev proxy
for `/api` already exists (check `vite.config.ts`).

## 12. Verification gates

Backend (per repo AGENTS.md): `npm run check:api` green (ruff + mypy + pytest); alembic
`upgrade head` + `downgrade -1` clean; a CLI smoke script `apps/api/scripts/ai_smoke.py`
(run agent loop against the dev API with a real OpenRouter call: one read question, one
write-with-confirm flow) — MUST be runnable with `uv run python scripts/ai_smoke.py`.

Tests (pytest + aiosqlite, mirror existing test style): loop executes reads; write waits for
confirmation; confirm executes + resumes; reject adapts; memory/skills CRUD; settings singleton;
SSE endpoint returns expected event sequence (test with a FakeProvider — no network).

Frontend: `npm run check` green; panel mounts, chat streams, ConfirmCard flows, no console
errors. `apps/web/src/modules/assistant/AssistantPanel.test.tsx` basic mount test.

## 13. Phases

1. **Foundation** — models + migration + routes/ai.py CRUD + settings. Gate: check:api green.
2. **Agent core** — providers.py (httpx OpenRouter), prompts.py, agent.py loop, tools.py (meta
   tools only), smoke script with real call. Gate: smoke answers a question using tools.
3. **Read tools + memory/skills** — all read tools + remember/recall + skills. Gate: smoke
   "what did I log yesterday" works; memory persists across conversations.
4. **Writes + safety** — write tools, confirmation flow, confirm/reject/undo endpoints,
   created_by tagging. Gate: smoke confirms → creates → undoes; pytest green.
5. **Frontend** — AssistantPanel + useAssistantChat + ConfirmCard. Gate: browser end-to-end.
6. **Polish** (later, not now) — local provider, autonomy levels, slash commands, skill
   suggestions UI.

## 14. Out of scope (do NOT build)

Finance tools (no finance routes yet), admin/files/integrations tools, Anthropic/OpenAI
providers, pgvector semantic search, multi-user, auto-execute autonomy, voice, notifications,
undo UI beyond ConfirmCard, tool-call streaming assembly (non-streaming tool turns by design).

## 15. Conventions (bind)

- Repo root `AGENTS.md` + `apps/api/AGENTS.md` are law (ponytail, no deps, docs/history entries,
  `npm run check*`).
- **Do NOT commit, do NOT push, do NOT touch docker/prod** — leave the worktree dirty; the
  orchestrator merges and commits.
- Write a `docs/history/` entry (5-section format from AGENTS.md) for the module when done.
- Do not open unrelated files. Read specs before code. Ask one focused question max.
