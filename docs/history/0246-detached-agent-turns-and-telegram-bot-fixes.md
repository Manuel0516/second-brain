# 0246 — Detached agent turns + Telegram bot reliability fixes

Date: 2026-08-15
Status: accepted

## What changed

**Agent turns now survive the client disconnecting.** Previously `agent.run()` was the
direct body of the chat/confirm/reject `StreamingResponse`. When the browser tab was
backgrounded or closed, Starlette threw `GeneratorExit` into that generator mid-turn,
killing the provider call / tool execution / DB commit in progress — the conversation
was left stuck with no assistant reply. The turn now runs in a detached `asyncio.Task`
with its own DB session (`agent.run_detached`); the HTTP generator only relays events
from a queue and can be safely abandoned without stopping the underlying work. Reopening
the conversation shows the finished result either way.

**Telegram bot fixes**, several independent bugs found during the review the user asked
for:
- `getUpdates` was never actually long-polling. `tg_call`'s local socket-timeout
  parameter was also named `timeout`, so `tg_call("getUpdates", offset=offset,
  timeout=50)` bound `50` to the *socket* timeout and silently dropped Telegram's own
  `timeout` (long-poll wait) from the request body. The bot was short-polling Telegram
  as fast as the network round-trip allowed — a busy loop that wastes resources and
  risks Telegram rate-limiting, which reads as "slow" or intermittently unresponsive.
- `handle_photo`'s non-401 error handler referenced `callback_id`, a variable that does
  not exist in that function (copy-pasted from `handle_callback`) — any non-401 upload
  failure crashed with `NameError` and the user got no feedback at all, and execution
  would otherwise have fallen through to use an undefined `file_id`.
- If the bot's own HTTP connection to the agent broke mid-turn (timeout, reset) the
  reply was silently lost — the exception was logged and nothing was sent to the user.
  Now that turns keep running server-side regardless (see above), the bot falls back to
  briefly polling the conversation for the result instead of leaving the user with
  silence.

## Why

User report: "each time I go out of the app the conversations stop and they break" and
"the telegram bot... messages are not going back... and it does not work properly and it
is very slow."

## Files touched

- `apps/api/app/modules/ai/agent.py` — `run()` now takes `user_id`/`conversation_id`
  strings instead of ORM objects (so it can run under any session, including one it
  didn't receive from the request); added `run_detached()` which spawns the turn as a
  background `asyncio.Task` on its own session (`session_factory`, overridable like the
  existing `provider_factory`) and relays events through an `asyncio.Queue`.
- `apps/api/app/routes/ai.py` — `chat`, `confirm`, `reject` call `agent.run_detached`
  with ids instead of `agent.run` with ORM rows.
- `apps/api/tests/conftest.py` — `client` fixture points `agent.session_factory` at the
  test DB, same reasoning as the existing `get_async_session` override.
- `apps/bot/bot.py` — `tg_call`'s local timeout param renamed `sock_timeout` so
  Telegram's own `timeout` field reaches the request body; `getUpdates` call fixed to
  pass both; `handle_photo`'s broken error handler replaced with the same user-facing
  message as its other failure path; added `recover_reply()` — polls
  `GET /conversations/{id}` for up to 60s and delivers whatever landed — wired into
  `handle_message` and `handle_callback` for non-401 stream failures (401 still
  propagates to the existing re-auth path).
- `apps/bot/test_bot.py` — covers the long-poll timeout fix, the photo-upload error
  path, the dropped-stream fallback (and that 401 still propagates), and
  `recover_reply` delivering a message once it lands.

## How the pieces connect

The bot fix depends on the backend fix: `recover_reply` only works because
`run_detached` guarantees the turn keeps writing to the DB even after the bot's own
`api_stream` connection dies. Without the backend change, polling afterwards would just
find nothing new.

## How to modify this later

Any new `agent.run` call site must use `run_detached` (or thread its own background
task) — never wire the raw generator straight into a `StreamingResponse` again, or the
disconnect-cancellation bug comes back. In `bot.py`, always use `sock_timeout=` for
`tg_call`'s local socket timeout — a bare `timeout=` kwarg is reserved for Telegram API
methods (like `getUpdates`) that define their own `timeout` field.
