# 0214 — Embedded assistant UX review fixes (rough edges A–M)

Date: 2026-08-15
Status: accepted

## What changed

Fixed the rough edges catalogued in `docs/work/plans/embedded-agent/UX_REVIEW_GUIDE.md`:

- **A — markdown rendering.** Assistant replies now render a small safe markdown subset
  (bold, inline code, code fences, bullet lists) as React elements instead of a raw
  `<div>{content}</div>`.
- **B — raw tool-summary dumps.** `tools.py` no longer returns `str(data)[:500]` Python
  dumps as tool/confirm-card summaries; a new `_summarize()` helper produces human-readable
  text (result counts + titles/names, or a single label for single-object results).
- **C — stuck "Working…" chips.** On a stream `error` event, any tool chip still showing
  "Working…" is now marked failed with "No result (stream error)".
- **D — historical empty replies.** Assistant messages with empty `content` render a
  "Reply lost — try asking again." placeholder instead of a blank bubble.
- **F — confirm card raw JSON.** The "Details" preview in `ConfirmCard` now renders a
  key/value list (`<dl>`) with human-formatted dates, falling back to the raw JSON `<pre>`
  only for non-object previews.
- **G — device approval expired-code wording.** Approval errors now append "— ask the bot
  for a fresh link."
- **I — Telegram markdown split.** The bot now strips markdown emphasis/code fences from
  LLM-generated answers before sending (`strip_markdown`) and sends them without
  `parse_mode`, so a 4096-char split can no longer leave unbalanced Telegram markdown
  entities.
- **J — no progress indicator on long turns.** The bot re-sends a Telegram "typing" action
  on every `tool_call` event during a turn, not just once at the start.
- **M — `/start` when already connected** now lists `/new` and `/login` instead of a bare
  one-line hint.

Edges E, H, K, L were verified against the guide's own "known-good" description and needed
no change: K's tool-line-before-answer ordering was already correct in `bot.py`; H's `next`
param survives the full login+TOTP round trip unchanged; E and L are explicitly marked
acceptable in the guide.

## Why

The user asked to implement the fixes catalogued in the UX review guide for the embedded
assistant (web panel, device approval, Telegram bot).

## Files touched

- `apps/api/app/modules/ai/tools.py` — added `_summarize()`; used it in `_call`,
  `recall`, `list_skills`, and `_response_tuple` instead of raw `str(data)[:500]`.
- `apps/web/src/modules/assistant/markdown.tsx` — new minimal markdown-to-React renderer
  (bold, inline code, code fences, bullet lists).
- `apps/web/src/modules/assistant/AssistantPanel.tsx` — `Message` renders assistant
  content through `renderMarkdown`; empty assistant messages show a "Reply lost" placeholder.
- `apps/web/src/modules/assistant/assistant.css` — styles for markdown blocks
  (`p`/`ul`/`code`/`pre`), the lost-reply placeholder, and the confirm-card `<dl>` details.
- `apps/web/src/modules/assistant/useAssistantChat.ts` — `error` event now marks pending
  tool chips as failed instead of leaving them stuck on "Working…".
- `apps/web/src/modules/assistant/ConfirmCard.tsx` — `previewEntries`/`formatValue` render
  a friendly key/value details list instead of raw `JSON.stringify`.
- `apps/web/src/pages/DeviceApprove.tsx` — error message appends a "fresh link" hint.
- `apps/bot/bot.py` — added `strip_markdown()`, applied it to LLM answers (sent without
  `parse_mode`), added a `tg_typing()` call on every `tool_call` event in both the message
  and confirm/reject callback loops, and expanded the already-connected `/start` reply
  with a command list.
- `apps/bot/test_bot.py` — new stdlib `unittest` checks for `strip_markdown` and
  `split_text` (the bot's two pure text-formatting functions).

## How the pieces connect

`tools.py::_call` (and the `list_skills`/`recall`/undo paths) feed the `summary` string
that both the web `tool_result` SSE event (rendered as a chip in `AssistantPanel.tsx`) and
the bot's `🔧` line consume — fixing it once in `_summarize()` fixes both surfaces, per the
root-cause-not-symptom rule. `useAssistantChat.ts` owns all chat SSE state; the new error
handler there is the single place tool-chip status is derived from stream events, so marking
stuck chips failed there covers every caller. In the bot, `strip_markdown` is applied
uniformly to both the initial-message flow and the confirm/reject continuation flow, since
both paths stream LLM-generated `text_delta` content that can end up split across the
4096-char Telegram limit.

## How to modify this later

- The markdown renderer in `markdown.tsx` intentionally supports only bold/code/lists —
  extend the two regexes in `renderInline` (and the block-level `while` loop) if italics or
  headings are needed later; it builds React elements directly (no `dangerouslySetInnerHTML`),
  keep it that way.
- `_summarize()` in `tools.py` is a generic heuristic (title/name field, else field count) —
  if a specific tool needs a bespoke summary, add a branch in `execute()` before it falls
  through to `_call()`, the same pattern `get_today`/`remember` already use.
- `strip_markdown()` in `bot.py` is deliberately lossy (drops emphasis rather than
  preserving it across chunks) — if Telegram formatting is wanted back, split before
  stripping and track open/close markers across chunk boundaries instead.
