# 0212 — Device authorization for the bot + chat UI fixes

Date: 2026-08-13
Status: accepted

## What changed

1. **Device authorization (no shared password).** The Telegram bot no longer logs in with
   the app's credentials. New `device_grants` table + `/api/auth/device` endpoints
   (create / status / approve): the bot creates a grant, the user opens
   `/device?code=…` in the web app, logs in, approves, and the bot receives a one-time
   long-lived bearer token. `get_current_user` now also accepts `Authorization: Bearer`
   (device-grant tokens). Bot env no longer needs `SB_LOGIN_EMAIL`/`SB_LOGIN_PASSWORD`;
   added `SB_VERIFICATION_BASE`.
2. **Chat UI fixes** (user-reported): the assistant panel's messages area could not
   scroll (panel grid lacked `grid-template-rows: minmax(0,1fr)`, chat column lacked
   `min-height: 0` → content clipped, no scrollbar); tool-result chips rendered full
   500-char data dumps (now capped at 88px with thin internal scroll); a new `/device`
   approval page (public route, handles logged-in and logged-out states; Login gained
   `?next=` support).
3. **Empty assistant replies.** The agent loop made two separate LLM calls per turn
   (`complete()` for tool detection, then `stream()` for text). Providers can return
   zero chunks on the second call (repeated identical request) — the persisted message
   was then empty (`content: ''`, status complete), which is why past conversations
   "didn't load back" replies. The loop now falls back to `complete()`'s content and
   streams it. Note: already-persisted empty rows cannot be recovered.

## Files touched

- `apps/api/app/models.py`, `alembic/versions/029_device_grants.py` — DeviceGrant model + table.
- `apps/api/app/routes/device.py` (new) — create/status/approve endpoints, 10-min TTL.
- `apps/api/app/dependencies.py` — bearer-token path in `get_current_user`.
- `apps/api/app/main.py` — device router.
- `apps/api/app/modules/ai/agent.py` — empty-stream fallback to `complete()` content.
- `apps/api/tests/test_device_auth.py` (new) — 7 tests covering the full flow.
- `apps/web/src/pages/DeviceApprove.tsx` (new), `App.tsx` route, `Login.tsx` `?next=`.
- `apps/web/src/modules/assistant/assistant.css` — scroll chain + chip cap.
- `apps/bot/bot.py` — device flow + bearer auth, no credentials.
- `compose.yaml` — bot env: `SB_VERIFICATION_BASE` replaces `SB_LOGIN_*`.

## How to modify this later

Device grants are one-time: keep `token_delivered` semantics if the poll flow changes.
The TTL constant lives in `routes/device.py` (`DEVICE_TTL_MINUTES`). The bot's flow
blocks its update loop while polling (~10 min max) — acceptable for a single-user bot;
parallelize with a thread if multi-user support is ever added.
