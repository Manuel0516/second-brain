# 0213 — UX review guide for the embedded assistant

Date: 2026-08-13
Status: accepted

## What changed

New `docs/work/plans/embedded-agent/UX_REVIEW_GUIDE.md` — a precise audit guide covering
every UX surface implemented for the embedded AI agent: the web assistant slide-over
(launcher, panel, conversation list, messages, tool chips, composer, confirm cards),
the device approval page, the Telegram bot, and the UX-affecting backend behaviors
(SSE protocol, confirmation gating, empty-reply fallback). Each section states the
intended contract, then lists known rough edges (marked A–M) with file pointers and
"do not regress" reference points.

## Why

The user will have Claude review the new UX and fix small mistakes; the guide gives
Claude the full contract in one place instead of rediscovering it from code.

## Files touched

- `docs/work/plans/embedded-agent/UX_REVIEW_GUIDE.md` (new, ~250 lines).

## How the pieces connect

No code changed — documentation only. Rough edges flagged include: markdown not rendered
in the web panel, raw tool-summary dumps in chips and confirm cards, stuck "Working…"
chips on mid-stream errors, historical empty assistant bubbles, Telegram markdown split
across 4096-char chunks, and missing focus trap.

## How to modify this later

Keep the guide in sync whenever any assistant/bot/device UX changes. The "known-good
reference points" section (scroll chain, message_done capture, chip cap, one-time token,
zero-dep bot) encodes fixes that must not regress.
