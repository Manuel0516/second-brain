# AI Assistant Module — Deep Dive

## 1. The Core Idea: No New Backend, Just a New Client

Every module so far (`CALENDAR_MODULE.md`, `NOTES_MODULE.md`, `FINANCE_MODULE.md`,
`FITNESS_MODULE.md`, `FOOD_MODULE.md`) already exposes a clean REST API. The assistant
doesn't need bespoke logic per module — it's an LLM given a **tool definition per existing
endpoint**, deciding which calls to make based on what you ask it. This is the same shape as
how Claude itself works with tools, just scoped to your own data:

```
Tools exposed to the assistant (1:1 with existing endpoints):
  search_graph(query)              → semantic + keyword search across pages/events/transactions
  get_calendar(range)              → GET /events
  create_event(...) / update_event(...) / delete_event(...)
  create_page(...) / append_block(...)
  create_transaction(...)          → POST /finance/transactions
  get_finance_summary(period)      → GET /finance/summary
  log_workout(...) / log_food(...)
  get_fitness_stats(exercise) / get_food_summary(date)
  get_backlinks(item)              → GET /pages/{id}/backlinks
```

`search_graph` is where the Phase 5 semantic-search plan (pgvector embeddings over page/
event content, already in the roadmap) earns its keep — it's the retrieval step that lets
the assistant answer "what did I decide about the Studio X contract" without you having to
know which page that's on.

## 2. Data Model

```
AIConversation
  id, title (auto-summarized from first exchange), created_at, updated_at

AIMessage
  id, conversation_id FK, role: "user" | "assistant" | "tool"
  content, tool_calls jsonb, tool_results jsonb, created_at

AISettings   (singleton — single user)
  provider          "anthropic" | "openai" | "local"
  api_key_ref       string | null      # encrypted, for cloud providers
  local_endpoint_url string | null     # for a self-hosted model (e.g. Ollama, OpenAI-compatible)
  model_name        string
  autonomy_level    "ask_before_write" | "auto_low_risk" | "auto_all"
```

## 3. Safety Model — this is the part that actually matters

An agent that can "add, log, change things" across your entire life data needs the same
discipline Claude itself applies to write actions on your behalf: **reads execute freely,
writes get confirmed.**

- **Default (`ask_before_write`)**: any create/update/delete shows as a preview card in the
  chat — "I'll create this event: [details]. Confirm?" — before it actually commits. Same
  pattern as a coding agent showing a diff before applying it.
- **Looser levels** (`auto_low_risk`, `auto_all`) can be opted into later, per the trust you
  build with it — not the default.
- **Every AI-made change is tagged** `created_by: "ai_assistant"`, reusing the exact pattern
  already established for system-generated events (`system:fitness`, `system:finance`).
  This means anything the assistant does is visible, filterable, and attributable in the
  same UI you already use to see "oh, this event was auto-created" — never a silent edit
  indistinguishable from something you entered yourself.
- **Undo matters more here than anywhere else in the app** — worth a generic "revert this
  AI action" affordance directly on the confirmation/result card, not buried in a settings
  page.

## 4. Pluggable LLM Backend

```
Provider interface (apps/api/app/modules/ai/providers/):
  - AnthropicProvider   (Claude API, your own key)
  - OpenAIProvider      (GPT/Codex-style, your own key)
  - LocalProvider       (OpenAI-compatible endpoint — e.g. Ollama running on the VPS or
                          another machine on your network)
```

One interface, swapped via `AISettings.provider` in the Settings page (§ below) — no code
change needed to switch.

**Honest tradeoff worth stating plainly**: cloud providers (Claude, GPT) will be
meaningfully more reliable at *tool-calling* specifically — reliably picking the right tool,
getting arguments right, handling multi-step plans — than most models you can realistically
self-host on consumer-VPS-grade hardware. Local buys you "nothing about my life leaves my
server," which is a legitimate reason to want it, but it's a real quality tradeoff, not a
free win. Worth treating local as something to evaluate with your actual VPS specs once
this gets built, rather than assuming it's a drop-in equivalent.

## 5. Surfacing It in the UI

- A persistent entry point (floating button or `Cmd/Ctrl+K`-style invocation) rather than a
  page you have to navigate to — the whole point is it's available from wherever you are.
- Inline contextual actions inside the block editor (Notion-AI-style slash commands: "/ai
  summarize this page", "/ai turn this into a recurring event") as a lighter-weight
  complement to the full chat — same underlying tool-calling, just a smaller surface.

## 6. Relationship to the Original "Photo → Macros" Idea

This subsumes it rather than sitting alongside it: a vision-capable provider call + the
`log_food` tool *is* the photo-capture feature — not a separate system. Send a photo in the
assistant chat, it calls `log_food` with structured macros, same confirmation flow as any
other write action.
