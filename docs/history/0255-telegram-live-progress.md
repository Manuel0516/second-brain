# 0255 — Telegram bot: live progress instead of a retrospective tool list

Date: 2026-08-16
Status: accepted

## What changed

The Telegram bot now shows what it is working on **while** it works, instead of
after it finishes. New `Progress` class in `apps/bot/bot.py`:

- **Typing stays alive.** A daemon thread re-sends `sendChatAction` every 4s for
  the whole turn. Previously typing was only sent when a tool *started*, and
  Telegram clears it after ~5s — so any tool slower than that (the Willys sweep is
  ~11s cold) left the chat completely silent.
- **One status message, edited in place.** `🔧 willys_offers…` is posted as soon as
  the first tool starts and edited as more run, losing the ellipsis when the turn
  ends. Previously the tool list was accumulated and sent only *after* the whole
  turn, telling the user what the bot *had* been doing long after it mattered.

## Why

User report: the bot "was having a lot of problems with the messages, replies,
the sending what is the bot working on". The progress feedback was the concrete
defect — the rest of the send path (markdown fallback, 4096-char splitting,
`strip_markdown`) was already hardened in 0246/0250 and needed no change.

This matters more now that `willys_offers` (0253) exists: its cold sweep takes
~11s inside a single tool call, which was the worst case for the old behaviour.

## Does this work at all through Telegram? (yes — and why)

Tools execute **server-side** in `tools.execute`; the bot is a thin SSE client
that renders events. The bot authenticates as the user via the device flow, so
`user_id` is the same as in the web app, which means the same `AISettings` gating
applies — `willys_offers` and any agent-created tool behave identically in
Telegram and the browser. Write confirmations already arrive as inline keyboards
and secure fields already hand off to the web app.

The ordering that makes this fix work: `agent.py` yields `event("tool_call", …)`
**before** awaiting `tools.execute(…)`, so the bot learns the tool name up front
and can show it during the wait rather than after.

## Files touched

- `apps/bot/bot.py` — added `threading` import, `TYPING_REFRESH_SECONDS`, the
  `Progress` class, and split `deliver_events` into a thin wrapper that starts/stops
  progress plus `_deliver_events` holding the original event loop. Removed the
  retrospective `"🔧 " + ", ".join(called_tools)` send.
- `apps/bot/test_bot.py` — replaced `test_tool_names_are_sent_as_plain_text` with
  `test_tool_progress_is_posted_live_and_edited_in_place`; added
  `test_no_progress_message_when_no_tools_run` and
  `test_typing_thread_stops_even_if_the_stream_raises`; `setUp`/`tearDown` now track
  thread counts so a leaked typing thread fails the suite.

## How the pieces connect

`deliver_events` starts `Progress` and stops it in a `finally`, so the typing
thread ends even when the stream drops mid-turn and `handle_message` falls back to
`recover_reply` (0246). Progress is deliberately best-effort: every Telegram call
inside it is wrapped and failures are only logged, because a cosmetic indicator
must never prevent the real answer from being delivered.

`_posted` is set *before* the send, not after, so a Telegram response without a
usable `message_id` skips later edits instead of posting a fresh message per tool.

## How to modify this later

- **Change what the status says**: `Progress._render`. It currently shows raw tool
  names; map them to friendlier text there if wanted.
- **Typing feels flaky**: lower `TYPING_REFRESH_SECONDS` (Telegram's own timeout is
  ~5s, so anything under that works).
- **Known remaining limit, deliberately not fixed**: `main()` handles updates
  sequentially, so a long turn delays other messages until it finishes. Nothing is
  lost — the poll offset advances before processing, so Telegram does not redeliver
  — and with a single allowed user the queueing is rarely visible. Making it
  concurrent means guarding `_state`/`save_state` against races, which is a bigger
  change than the symptom currently justifies.
