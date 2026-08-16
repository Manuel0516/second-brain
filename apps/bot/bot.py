#!/usr/bin/env python3
"""Second Brain Telegram bot — zero-dependency bridge.

Long-polls Telegram, forwards messages to the Second Brain agent API (SSE chat),
streams the reply, and renders write confirmations as inline keyboards.

Auth: OAuth-style device authorization. On first contact the bot creates a
device grant, sends the user a verification link, polls until the user approves
in the browser, then stores the one-time bearer token. No password is ever
shared with the bot.

Env:
  TELEGRAM_BOT_TOKEN        bot token from @BotFather (required)
  SECOND_BRAIN_API_URL      API base, e.g. http://api:8000 (compose) or http://127.0.0.1:8000 (dev)
  SB_VERIFICATION_BASE      web origin for the /device?code= link (default https://brain.zero-five.space)
  TELEGRAM_ALLOWED_USERS    comma-separated chat ids allowed to use the bot
  SB_BOT_STATE_FILE         JSON state path, default /data/state.json
"""

import json
import logging
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import UTC, datetime

API_BASE = os.environ.get("SECOND_BRAIN_API_URL", "http://127.0.0.1:8000")
VERIFICATION_BASE = os.environ.get("SB_VERIFICATION_BASE", "https://brain.zero-five.space")
TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
ALLOWED = {
    int(x) for x in os.environ.get("TELEGRAM_ALLOWED_USERS", "1110963147").split(",") if x.strip()
}
STATE_FILE = os.environ.get("SB_BOT_STATE_FILE", "/data/state.json")
TG = f"https://api.telegram.org/bot{TOKEN}"
MSG_LIMIT = 4096
DEVICE_TTL_SECONDS = 590
RECOVERY_TIMEOUT_SECONDS = 240

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("sb-bot")

# --- state (chat_id -> {token, device_code, conv_id}) -------------------------

_state: dict[str, dict] = {}


def load_state() -> None:
    global _state
    try:
        with open(STATE_FILE, encoding="utf-8") as fh:
            _state = json.load(fh)
    except FileNotFoundError:
        _state = {}


def save_state() -> None:
    os.makedirs(os.path.dirname(STATE_FILE) or ".", exist_ok=True)
    with open(STATE_FILE, "w", encoding="utf-8") as fh:
        json.dump(_state, fh)


def chat_entry(chat_id: int) -> dict:
    return _state.setdefault(str(chat_id), {})


def clear_auth(chat_id: int) -> None:
    entry = chat_entry(chat_id)
    entry.pop("token", None)
    entry.pop("conv_id", None)
    entry.pop("device_code", None)
    save_state()


# --- telegram api (stdlib urllib) ---------------------------------------------


def tg_call(method: str, sock_timeout: int = 60, **params) -> dict:
    # `sock_timeout` (the local socket read timeout) is deliberately its own name —
    # Telegram's own `timeout` parameter (long-poll wait, in getUpdates) must be free
    # to pass through **params into the request body without being shadowed by it.
    req = urllib.request.Request(
        f"{TG}/{method}",
        data=json.dumps(params).encode() if params else None,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=sock_timeout) as resp:
        return json.loads(resp.read())


def tg_send(
    chat_id: int, text: str, reply_markup: dict | None = None, markdown: bool = True
) -> None:
    for chunk in split_text(text):
        params = {
            "chat_id": chat_id,
            "text": chunk,
            **({"reply_markup": reply_markup} if reply_markup else {}),
        }
        try:
            tg_call("sendMessage", **params, **({"parse_mode": "Markdown"} if markdown else {}))
        except urllib.error.HTTPError as exc:
            if not markdown or exc.code != 400:
                raise
            # Tool names, model text, and previews can contain unescaped Markdown
            # punctuation. Telegram rejects the whole message in that case; retrying
            # as plain text is preferable to losing a completed assistant reply.
            tg_call("sendMessage", **params)


def strip_markdown(text: str) -> str:
    """Drop LLM markdown (bold/code fences) so a 4096-char split can't leave
    unbalanced Telegram markdown entities (edge I) — sent as plain text instead."""
    text = re.sub(r"```[a-zA-Z]*\n?", "", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"__(.+?)__", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    return text


def split_text(text: str) -> list[str]:
    if len(text) <= MSG_LIMIT:
        return [text]
    chunks: list[str] = []
    while len(text) > MSG_LIMIT:
        cut = text.rfind("\n", 0, MSG_LIMIT)
        cut = cut if cut > 0 else MSG_LIMIT
        chunks.append(text[:cut])
        text = text[cut:].lstrip("\n")
    chunks.append(text)
    return chunks


def tg_typing(chat_id: int) -> None:
    try:
        tg_call("sendChatAction", sock_timeout=10, chat_id=chat_id, action="typing")
    except Exception:  # noqa: BLE001
        pass


# Telegram clears the typing indicator after ~5s, so it has to be re-sent while a
# turn is still running.
TYPING_REFRESH_SECONDS = 4


class Progress:
    """Live "what am I doing" feedback for one agent turn.

    Two problems this fixes. Typing was only sent when a tool *started*, so any
    tool slower than ~5s (the Willys sweep is ~11s cold) left the chat completely
    silent — a background thread now keeps it alive for the whole turn. And the
    list of called tools used to be sent only after the turn finished, which told
    the user what the bot *had* worked on, long after it mattered; one status
    message is now posted on the first tool and edited in place as more run.
    """

    def __init__(self, chat_id: int) -> None:
        self.chat_id = chat_id
        self.tools: list[str] = []
        self.message_id: int | None = None
        self._posted = False
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._keep_typing, daemon=True)

    def start(self) -> "Progress":
        self._thread.start()
        return self

    def _keep_typing(self) -> None:
        while not self._stop.is_set():
            tg_typing(self.chat_id)
            self._stop.wait(TYPING_REFRESH_SECONDS)

    def _render(self, suffix: str) -> None:
        text = "🔧 " + ", ".join(self.tools) + suffix
        try:
            if not self._posted:
                # Set before the call: if Telegram answers without a usable id, the
                # later edits are skipped rather than posting a message per tool.
                self._posted = True
                response = tg_call("sendMessage", chat_id=self.chat_id, text=text)
                self.message_id = response.get("result", {}).get("message_id")
            elif self.message_id is not None:
                tg_call(
                    "editMessageText",
                    chat_id=self.chat_id,
                    message_id=self.message_id,
                    text=text,
                )
        except Exception:  # noqa: BLE001
            # Progress is cosmetic: never let it break delivery of the real answer.
            log.debug("progress update failed", exc_info=True)

    def tool(self, name: str) -> None:
        self.tools.append(name)
        self._render("…")

    def done(self) -> None:
        self._stop.set()
        if self.tools:
            self._render("")


# --- second brain api (bearer token) ------------------------------------------


def api_json(method: str, path: str, body: dict | None = None, token: str | None = None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API_BASE}{path}", data=data, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.status, json.loads(resp.read() or "null")


def _multipart_body(filename: str, content_type: str, data: bytes) -> tuple[bytes, str]:
    """Stdlib-only multipart/form-data encoder (no requests dep). Returns (body, boundary)."""
    boundary = uuid.uuid4().hex
    body = (
        (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            f"Content-Type: {content_type}\r\n\r\n"
        ).encode()
        + data
        + f"\r\n--{boundary}--\r\n".encode()
    )
    return body, boundary


def api_upload_file(token: str, filename: str, content_type: str, data: bytes) -> str:
    """Upload a file to /api/files, returning its file id."""
    body, boundary = _multipart_body(filename, content_type, data)
    req = urllib.request.Request(f"{API_BASE}/api/files", data=body, method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return str(json.loads(resp.read())["id"])


def tg_download_file(file_path: str) -> bytes:
    with urllib.request.urlopen(
        f"https://api.telegram.org/file/bot{TOKEN}/{file_path}", timeout=60
    ) as resp:
        return resp.read()


def api_stream(method: str, path: str, body: dict, token: str, timeout: int = 240):
    """Open a streaming request and yield parsed SSE events."""
    req = urllib.request.Request(f"{API_BASE}{path}", data=json.dumps(body).encode(), method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {token}")
    resp = urllib.request.urlopen(req, timeout=timeout)
    buf = ""
    while True:
        chunk = resp.read(4096)
        if not chunk:
            break
        buf += chunk.decode("utf-8", "replace")
        while "\n\n" in buf:
            block, buf = buf.split("\n\n", 1)
            for line in block.splitlines():
                if line.startswith("data:"):
                    yield json.loads(line[5:].strip())


# --- device authorization ------------------------------------------------------


def device_flow(chat_id: int) -> bool:
    """Start a device grant and wait for the user to approve it in the browser."""
    status, grant = api_json("POST", "/api/auth/device")
    if status != 201:
        tg_send(chat_id, "⚠️ Could not start authorization — the API is unreachable.")
        return False

    tg_send(
        chat_id,
        "🔐 *Connect me to your Second Brain*\n\n"
        f"1. Open: {VERIFICATION_BASE}{grant['verification_url']}\n"
        f"2. Log in and approve code *{grant['user_code']}*\n\n"
        "I'll wait up to 10 minutes.",
    )

    deadline = time.time() + DEVICE_TTL_SECONDS
    entry = chat_entry(chat_id)
    entry["device_code"] = grant["device_code"]
    save_state()
    while time.time() < deadline:
        time.sleep(5)
        try:
            status, body = api_json(
                "GET", f"/api/auth/device/status?device_code={grant['device_code']}"
            )
        except Exception:  # noqa: BLE001
            continue
        if body.get("status") == "approved":
            entry["token"] = body["token"]
            entry.pop("device_code", None)
            save_state()
            tg_send(chat_id, "✅ *Connected!* Ask me anything about your Second Brain.")
            return True
        if body.get("status") == "expired":
            entry.pop("device_code", None)
            save_state()
            tg_send(chat_id, "⌛ The code expired — send /start to try again.")
            return False
    entry.pop("device_code", None)
    save_state()
    tg_send(chat_id, "⌛ The code expired — send /start to try again.")
    return False


def authorized(chat_id: int) -> bool:
    entry = chat_entry(chat_id)
    if entry.get("token"):
        return True
    if entry.get("flow_running"):
        return False
    entry["flow_running"] = True
    save_state()
    try:
        return device_flow(chat_id)
    finally:
        entry = chat_entry(chat_id)
        entry.pop("flow_running", None)
        save_state()


# --- chat flow -----------------------------------------------------------------


def handle_message(chat_id: int, text: str) -> None:
    if not text.strip():
        return
    tg_typing(chat_id)
    entry = chat_entry(chat_id)

    if text.startswith("/login"):
        clear_auth(chat_id)
        authorized(chat_id)
        return

    if text.startswith("/start"):
        if entry.get("token"):
            tg_send(
                chat_id,
                "Already connected. Ask me anything!\n\n"
                "*Commands*\n"
                "/new — start a fresh conversation\n"
                "/login — reconnect this bot",
            )
        else:
            authorized(chat_id)
        return

    if not authorized(chat_id):
        return

    if text.startswith("/new"):
        tg_send(chat_id, "Starting a fresh conversation…")
        sb_conv_for(chat_id, fresh=True)
        tg_send(chat_id, "New conversation started.")
        return

    conv_id = sb_conv_for(chat_id)
    since = datetime.now(UTC)
    try:
        deliver_events(chat_id, conv_id, sb_agent_events(chat_id, conv_id, text))
    except urllib.error.HTTPError:
        raise
    except Exception:  # noqa: BLE001
        log.exception("stream interrupted for conversation %s", conv_id)
        recover_reply(chat_id, conv_id, entry["token"], since)


def confirmation_markup(action_id: str) -> dict:
    return {
        "inline_keyboard": [
            [
                {"text": "✅ Apply", "callback_data": f"confirm:{action_id}"},
                {"text": "✖ Reject", "callback_data": f"reject:{action_id}"},
            ]
        ]
    }


def deliver_events(chat_id: int, conv_id: str, events) -> None:
    progress = Progress(chat_id).start()
    try:
        _deliver_events(chat_id, conv_id, events, progress)
    finally:
        # Always stop the typing thread, even if the stream raises and the caller
        # falls back to recover_reply.
        progress.done()


def _deliver_events(chat_id: int, conv_id: str, events, progress: "Progress") -> None:
    results: list[str] = []
    answer: list[str] = []
    for ev in events:
        etype = ev.get("type")
        if etype == "text_delta":
            answer.append(ev.get("content", ""))
        elif etype == "tool_call":
            progress.tool(ev.get("name", "?"))
        elif etype == "tool_result":
            results.append(ev.get("summary", "Done"))
        elif etype == "confirm_required":
            action_id = ev["action_id"]
            preview = ev.get("preview") or {}
            summary = preview_summary(ev.get("tool", ""), preview)
            secure_fields = preview.get("_secure_fields", []) if isinstance(preview, dict) else []
            if secure_fields:
                query = urllib.parse.urlencode({"assistant": conv_id, "action": action_id})
                tg_send(
                    chat_id,
                    f"🔐 This action needs sensitive information. Finish it securely in "
                    f"the app:\n{VERIFICATION_BASE.rstrip('/')}/calendar?{query}",
                    markdown=False,
                )
            else:
                tg_send(
                    chat_id,
                    f"*Proposed change:* {summary}\n\nApprove or reject?",
                    reply_markup=confirmation_markup(action_id),
                )
        elif etype == "error":
            answer.append(f"⚠️ {ev.get('message', 'something went wrong')}")

    if answer:
        tg_send(chat_id, strip_markdown("".join(answer)), markdown=False)
    elif results:
        tg_send(chat_id, strip_markdown("\n".join(results)), markdown=False)


def recover_reply(chat_id: int, conv_id: str, token: str, since: datetime) -> None:
    """The live SSE connection broke mid-turn (timeout, dropped connection) — but the
    agent turn keeps running server-side and commits its result regardless (see
    agent.run_detached in the API). Poll briefly for that result to land instead of
    leaving the user with silence."""
    deadline = time.time() + RECOVERY_TIMEOUT_SECONDS
    while time.time() < deadline:
        time.sleep(3)
        try:
            status, conv = api_json("GET", f"/api/ai/conversations/{conv_id}", token=token)
        except Exception:  # noqa: BLE001
            continue
        if status != 200:
            continue
        pending = conv.get("pending_actions") or []
        if pending:
            for action in pending:
                summary = preview_summary(action.get("tool", ""), action.get("preview") or {})
                tg_send(
                    chat_id,
                    f"*Proposed change:* {summary}\n\nApprove or reject?",
                    reply_markup=confirmation_markup(action["action_id"]),
                )
            return
        messages = conv.get("messages") or []
        last = messages[-1] if messages else None
        if last and last.get("role") == "assistant":
            created = (last.get("created_at") or "").replace("Z", "+00:00")
            try:
                is_new = created and datetime.fromisoformat(created) > since
            except ValueError:
                is_new = False
            if is_new:
                if last.get("content"):
                    tg_send(chat_id, strip_markdown(last["content"]), markdown=False)
                return
    tg_send(
        chat_id,
        "⚠️ Lost the connection while working on that. It may still finish in the "
        "background — ask again in a moment if you don't hear back.",
    )


def handle_photo(chat_id: int, sizes: list[dict], caption: str) -> None:
    if not authorized(chat_id):
        return
    tg_typing(chat_id)
    entry = chat_entry(chat_id)
    try:
        info = tg_call("getFile", file_id=sizes[-1]["file_id"])
        data = tg_download_file(info["result"]["file_path"])
        file_id = api_upload_file(entry["token"], "photo.jpg", "image/jpeg", data)
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            raise
        log.exception("photo upload failed")
        tg_send(chat_id, "⚠️ Could not process that photo.")
        return
    except Exception:  # noqa: BLE001
        log.exception("photo upload failed")
        tg_send(chat_id, "⚠️ Could not process that photo.")
        return
    prompt = caption or "Log this meal from the photo."
    handle_message(chat_id, f"[Photo attached — file_id={file_id}] {prompt}")


def sb_conv_for(chat_id: int, fresh: bool = False) -> str:
    entry = chat_entry(chat_id)
    if entry.get("conv_id") and not fresh:
        return entry["conv_id"]
    status, conv = api_json("POST", "/api/ai/conversations", body={}, token=entry.get("token"))
    if status != 201:
        raise RuntimeError(f"create conversation failed: {status}")
    entry["conv_id"] = conv["id"]
    save_state()
    return conv["id"]


def sb_agent_events(chat_id: int, conv_id: str, content: str):
    entry = chat_entry(chat_id)
    yield from api_stream(
        "POST",
        f"/api/ai/conversations/{conv_id}/messages",
        {"content": content},
        token=entry["token"],
    )


def preview_summary(tool: str, args: dict) -> str:
    bits = []
    for key in ("title", "name", "content", "start_at", "end_at", "date", "description"):
        if key in args and args[key]:
            bits.append(f"{key}: {args[key]}")
    return " · ".join(bits) if bits else f"{tool}({json.dumps(args)[:120]})"


def handle_callback(chat_id: int, callback_id: str, data: str) -> None:
    decision, action_id = data.split(":", 1)
    entry = chat_entry(chat_id)
    token = entry.get("token")
    conv_id = entry.get("conv_id")
    if not token or not conv_id:
        tg_call(
            "answerCallbackQuery", callback_query_id=callback_id, text="Start with /start first."
        )
        return
    tg_typing(chat_id)
    since = datetime.now(UTC)
    try:
        if decision == "undo":
            status, body = api_json(
                "POST", f"/api/ai/actions/{action_id}/undo", body={}, token=token
            )
            tg_call(
                "answerCallbackQuery",
                callback_query_id=callback_id,
                text=f"Undone ({body.get('status', status)}).",
            )
            return
        events = api_stream(
            "POST",
            f"/api/ai/conversations/{conv_id}/{decision}",
            {"action_id": action_id},
            token=token,
        )
        tg_call("answerCallbackQuery", callback_query_id=callback_id)
        deliver_events(chat_id, conv_id, events)
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            raise
        log.exception("callback failed")
        tg_call(
            "answerCallbackQuery",
            callback_query_id=callback_id,
            text="Could not complete action.",
        )
    except Exception:  # noqa: BLE001
        log.exception("stream interrupted for conversation %s", conv_id)
        tg_call("answerCallbackQuery", callback_query_id=callback_id)
        recover_reply(chat_id, conv_id, token, since)


def _handle_update(update: dict) -> None:
    if "callback_query" in update:
        cq = update["callback_query"]
        chat_id = cq["message"]["chat"]["id"]
        if chat_id not in ALLOWED:
            tg_call("answerCallbackQuery", callback_query_id=cq["id"], text="Not allowed.")
            return
        handle_callback(chat_id, cq["id"], cq.get("data", ""))
        return
    msg = update.get("message") or {}
    chat_id = msg.get("chat", {}).get("id")
    photo = msg.get("photo")
    text = msg.get("text")
    if chat_id is None or (text is None and not photo):
        return
    if chat_id not in ALLOWED:
        tg_send(chat_id, "Sorry, you are not allowed to use this bot.")
        return
    if photo:
        handle_photo(chat_id, photo, msg.get("caption") or "")
        return
    handle_message(chat_id, text)


def handle_update(update: dict) -> None:
    try:
        _handle_update(update)
    except urllib.error.HTTPError as exc:
        if exc.code != 401:
            raise
        msg = update.get("message") or update.get("callback_query", {}).get("message", {})
        chat_id = msg.get("chat", {}).get("id")
        if chat_id is not None:
            clear_auth(chat_id)
            tg_send(chat_id, "🔐 Your connection expired. Send /login to reconnect.")


def main() -> None:
    load_state()
    offset = 0
    log.info("polling telegram (allowed: %s, api: %s)", ALLOWED, API_BASE)
    while True:
        try:
            updates = tg_call("getUpdates", sock_timeout=70, offset=offset, timeout=50)
            for update in updates.get("result", []):
                offset = max(offset, update["update_id"] + 1)
                try:
                    handle_update(update)
                except Exception:  # noqa: BLE001
                    log.exception("update %s failed", update.get("update_id"))
        except Exception:  # noqa: BLE001
            log.warning("poll error (retrying in 3s)")
            time.sleep(3)


if __name__ == "__main__":
    main()
