# 0216 — Web assistant chat gets photo attachment (parity with the bot)

Date: 2026-08-15
Status: accepted

## What changed

The web assistant chat and the Telegram bot already share the exact same backend agent
(same SSE endpoint, same tool-calling loop, same tool registry) — so their behavior was
already identical at the agent level. The one real capability gap was that the bot could
accept a photo and log it as a meal (Phase 7b, `docs/history/0215-...md`) while the web
chat's composer had no way to attach an image. Closed that gap:

- Added an attach-photo button to the assistant composer. Selecting an image uploads it
  immediately to `/api/files` (the same endpoint the bot uses), showing a thumbnail chip
  with an "Uploading…"/remove state.
- On send, if a photo is attached, the message sent to the backend is formatted exactly as
  `[Photo attached — file_id={id}] {caption}` — byte-for-byte the same marker format
  `apps/bot/bot.py::handle_photo` already sends, which the system prompt
  (`apps/api/app/modules/ai/prompts.py`) already recognizes as an instruction to pass that
  file id into `log_food`'s `photo_file_ids`. No backend changes were needed.
- The user's own chat bubble shows the photo thumbnail + their typed caption (not the raw
  marker text) — `useAssistantChat.sendMessage` now accepts an optional `{displayContent,
  imageUrl}` so the locally-echoed bubble can differ from what's actually sent to the agent.

## Why

User request: make the web chat "behave exactly like the bot." Since the two clients
already hit the identical agent backend, the actual gap was UI capability, not agent
behavior — this closes it without touching the backend.

## Files touched

- `apps/web/src/modules/assistant/AssistantPanel.tsx` — attach button, hidden file input,
  upload state, photo preview chip, composer submit logic building the marker message;
  `Message` renders `imageUrl` as a thumbnail for user messages.
- `apps/web/src/modules/assistant/useAssistantChat.ts` — `ChatMessage.imageUrl`;
  `sendMessage(content, meta?)` accepts an optional display override.
- `apps/web/src/modules/assistant/assistant.css` — attach button, photo preview chip, and
  message-thumbnail styles (existing tokens only).
- Reused `uploadFile`/`FileUpload` from `apps/web/src/modules/food/api.ts` (the app's
  existing `/api/files` upload helper) rather than writing a second one.

## How the pieces connect

The web client and the bot are two independent clients of the same
`POST /api/ai/conversations/{id}/messages` SSE endpoint — this change only ever touches
the web client. The marker string format is the load-bearing contract between both clients
and the system prompt; it must stay byte-identical to `apps/bot/bot.py`'s
`f"[Photo attached — file_id={file_id}] {prompt}"` for the agent to reliably recognize an
attached photo from either channel.

## How to modify this later

If a third client needs photo upload (or the marker format changes), update the prompt
instruction in `prompts.py` once — both `bot.py` and `AssistantPanel.tsx` read that single
contract, so keep their marker strings in sync with it. `uploadFile`/`FileUpload` now has a
second consumer (assistant + food modules) — per `apps/web/AGENTS.md`'s component rule,
consider promoting it to `src/lib/api.ts` if a third consumer shows up.
