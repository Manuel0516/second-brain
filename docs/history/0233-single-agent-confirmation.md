# 0233 — Single agent confirmation

Date: 2026-08-15
Status: accepted

## What changed
All proposed agent writes now execute after one Apply click. High-risk actions no longer enter a second review step, secure fields appear on the first confirmation card, and Telegram uses the same single confirmation wording.

## Why
The double-confirmation flow was unreliable and added friction to ordinary actions such as creating events. The user requested one simple authorization step.

## Files touched
- `apps/api/app/modules/ai/agent.py` — creates every pending write with one required confirmation.
- `apps/api/app/routes/ai.py` — executes pending actions on the first confirmation, including legacy rows that previously required two.
- `apps/web/src/modules/assistant/ConfirmCard.tsx` — shows secure inputs immediately and always labels the primary action Apply.
- `apps/bot/bot.py` — removed second-review wording.
- `apps/api/tests/test_ai.py`, `apps/web/src/modules/assistant/AssistantPanel.test.tsx`, and `apps/bot/test_bot.py` — updated confirmation regressions.

## How the pieces connect
The agent stores a pending `AIAction`, then web or Telegram posts once to the existing `/confirm` endpoint. The endpoint validates any secure fields and executes immediately. Reject and undo behavior are unchanged.

## How to modify this later
Keep `confirmations_required` and `confirmations_received` columns for stored-data compatibility, but do not branch execution on their values. Any future authorization UI should continue posting once to `/confirm` with secure fields when needed.
