# 0230 — Telegram agent parity

Date: 2026-08-15
Status: accepted

## What changed
Telegram confirmations now use the correct API route, support repeated high-risk review, and render continuation results once. Actions requiring secrets hand off to the authenticated web assistant. Stale bot authentication can be reset, unresolved actions survive a web handoff, and an opt-in development bot service is available.

## Why
Telegram used the same agent as web chat but its Apply callback targeted a nonexistent route. It also could not handle second confirmations, secure inputs, restored pending actions, or expired device tokens, and it had no local runtime service.

## Files touched
- `apps/bot/bot.py` — unified SSE delivery, corrected callbacks, added secure web handoff and stale-auth recovery.
- `apps/bot/test_bot.py` — covered confirmations, handoff, single delivery, undo, login, and unauthorized recovery.
- `apps/api/app/routes/ai.py` — included owned unresolved actions in conversation details.
- `apps/api/tests/test_ai.py` — covered pending-action serialization and ownership isolation.
- `apps/web/src/modules/assistant/useAssistantChat.ts` — restored pending confirmations with loaded conversations.
- `apps/web/src/modules/assistant/AssistantPanel.tsx` — consumed Telegram handoff links and opened the requested conversation.
- `apps/web/src/modules/assistant/ConfirmCard.tsx` — exposed action identity for safe handoff focus.
- `apps/web/src/modules/assistant/AssistantPanel.test.tsx` — covered secure-action handoff restoration.
- `compose.dev.yaml` — added the opt-in local bot profile.
- `README.md` and `docs/architecture/OVERVIEW.md` — documented the bot startup command.

## How the pieces connect
The bot sends every message through the existing user-authenticated AI conversation API. Ordinary confirmation callbacks return SSE to the shared bot event handler. Secure actions instead link to the same conversation in the web app; loading it returns pending `AIAction` records and reconstructs the existing confirmation cards without putting secrets in Telegram or the URL.

## How to modify this later
Keep Telegram callback decision names aligned with the API route suffixes. Any new confirmation metadata must be serialized by the conversation detail endpoint and mapped in `useAssistantChat`. Keep secure fields out of bot state, callback data, logs, and URLs.
