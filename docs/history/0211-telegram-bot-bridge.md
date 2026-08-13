# 0211 — Telegram bot bridge for the embedded agent

Date: 2026-08-13
Status: accepted

## What changed

New `apps/bot/` — a zero-dependency Python bridge (stdlib `urllib` only) that connects
Telegram to the embedded agent API. Added as a `bot` service in `compose.yaml`
(own volume `bot-data`, `internal` + `egress` networks, depends on healthy `api`).
Env vars: `TELEGRAM_BOT_TOKEN` (required), `TELEGRAM_ALLOWED_USERS` (default the owner's
chat id), `SECOND_BRAIN_API_URL`, `SB_LOGIN_EMAIL`/`SB_LOGIN_PASSWORD` (reuses the app's
initial-user credentials for cookie auth).

## Why

The user wanted the Second Brain agent reachable from Telegram ("Hermes-Life" bot,
@Zero_Five_bot). The agent API contract (SSE chat, confirm/reject/undo) was already
built — the bot is a thin client.

## Files touched

- `apps/bot/bot.py` — long-polling loop; cookie login; SSE consumption; Markdown replies
  (split at 4096); write confirmations as inline keyboards (✅ Apply / ✖ Reject, undo via
  callback); chat→conversation mapping persisted to a state file; `/start` + `/new`.
- `apps/bot/Dockerfile` — `python:3.13-slim`, no pip install (stdlib only).
- `compose.yaml` — `bot` service + `bot-data` volume.
- `.env.example` — `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USERS` (names only).

## How the pieces connect

Bot (egress net) → Telegram API; bot (internal net) → `http://api:8000` → agent SSE →
same confirm/reject/undo endpoints the web panel uses. One long-lived conversation per
chat id, stored in `/data/state.json` (volume).

## How to modify this later

Keep it dependency-free (stdlib only) so CI needs no new tooling. Raise `MSG_LIMIT`
handling or add streaming progress only if Telegram UX demands it. To test locally:
run `python3 apps/bot/bot.py` with `SECOND_BRAIN_API_URL=http://127.0.0.1:8000` and the
dev credentials, then message the bot.
