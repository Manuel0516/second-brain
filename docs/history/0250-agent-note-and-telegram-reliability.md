# 0250 — Complete agent note reads and Telegram delivery reliability

Date: 2026-08-16
Status: accepted

## What changed

The agent now receives the complete JSON returned by `get_page` and the complete markdown
returned by `load_skill`, while the chat UI continues to display short tool-result chips.
`search_pages` filters out event results before returning ids, and the page tool guidance now
distinguishes full-note reads, in-place edits, and true append-only changes. The agent turn budget
increased from 12 to 24 provider/tool rounds.

Detached agent turns now retain a strong task reference and emit an SSE keepalive every 15 seconds,
so client/proxy idle timeouts cannot silently abandon a long provider call. If the enlarged step
budget is exhausted, the failure is persisted as an assistant message so Telegram recovery can
still retrieve it.

Telegram tool names are sent as plain text, Markdown parse failures retry without formatting, and
the dropped-stream recovery window increased from 60 to 240 seconds.

## Why

Two real grocery-offer conversations showed the agent treating a partial search snippet as a whole
Groceries note, repeatedly searching, trying event ids with `get_page`, exhausting its step budget,
and then appending duplicate items instead of editing the existing list. The Telegram bridge also
made completed turns look disconnected because tool names such as `search_pages` were sent using
unescaped Telegram Markdown, and long silent provider calls had no transport keepalive.

## Files touched

- `apps/api/app/modules/ai/agent.py` — doubled the turn budget, separated provider-facing tool
  content from UI summaries, persisted budget failures, retained detached tasks, and added SSE
  keepalives.
- `apps/api/app/modules/ai/tools.py` — returned complete page/skill content to the model, restricted
  page search results to pages, and clarified safe note-read/edit/append behavior.
- `apps/api/app/modules/ai/prompts.py` — made full-page reads mandatory before note answers or edits
  and made search snippets explicitly non-authoritative.
- `apps/bot/bot.py` — made tool-status delivery Markdown-safe, added a plain-text retry, and extended
  dropped-stream recovery.
- `apps/api/tests/test_ai.py` — covered a 30-item full-note read, complete skill loading, page-only
  search, more than 12 tool rounds, and SSE keepalives.
- `apps/bot/test_bot.py` — covered plain-text tool names and Markdown rejection fallback.

## How the pieces connect

The API tool executor keeps concise `summary` text for user-visible SSE chips and adds
`model_content` only when the provider needs lossless data. The agent loop places that full content
in the provider's tool message and persists it in tool history. With an authoritative `get_page`
result and page-only search ids, the model can update the original Tiptap document once instead of
searching around a truncated snippet. The detached worker continues independently of its HTTP
consumer; keepalive comments preserve the live stream, while the Telegram recovery poll remains a
longer fallback if the network genuinely drops.

## How to modify this later

Keep `summary` compact and put any lossless provider payload in `model_content`; do not expose full
note JSON in the visible tool chip. When adding page mutations, state whether they replace existing
content or add new blocks, and never direct in-place edits to `append_page_content`. Any future
Telegram message containing generated/tool text should be sent with `markdown=False` or allowed to
use `tg_send`'s plain-text retry. Tune `MAX_AGENT_STEPS`, `SSE_KEEPALIVE_SECONDS`, and
`RECOVERY_TIMEOUT_SECONDS` together if provider latency changes materially.
