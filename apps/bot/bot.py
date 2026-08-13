#!/usr/bin/env python3
"""Second Brain Telegram bot — zero-dependency bridge.

Long-polls Telegram getUpdates, forwards messages to the Second Brain agent API
(SSE chat), streams the reply, and renders write confirmations as inline
keyboards (Apply / Reject, then Undo).

Env:
  TELEGRAM_BOT_TOKEN        bot token from @BotFather (required)
  SECOND_BRAIN_API_URL      API base, e.g. http://api:8000 (compose) or http://127.0.0.1:8000 (dev)
  SB_LOGIN_EMAIL            app user email (cookie auth)
  SB_LOGIN_PASSWORD         app user password
  TELEGRAM_ALLOWED_USERS    comma-separated chat ids allowed to use the bot
  SB_BOT_STATE_FILE         JSON state path (chat -> conversation mapping), default /data/state.json
"""

import json
import logging
import os
import time
import urllib.error
import urllib.request
from http.cookiejar import CookieJar

API_BASE = os.environ.get("SECOND_BRAIN_API_URL", "http://127.0.0.1:8000")
TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
ALLOWED = {
    int(x)
    for x in os.environ.get("TELEGRAM_ALLOWED_USERS", "1110963147").split(",")
    if x.strip()
}
STATE_FILE = os.environ.get("SB_BOT_STATE_FILE", "/data/state.json")
TG = f"https://api.telegram.org/bot{TOKEN}"
MSG_LIMIT = 4096

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("sb-bot")

# --- state (chat_id -> conversation) -----------------------------------------

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


# --- telegram api (stdlib urllib) ---------------------------------------------

def tg_call(method: str, timeout: int = 60, **params) -> dict:
    req = urllib.request.Request(
        f"{TG}/{method}",
        data=json.dumps(params).encode() if params else None,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def tg_send(chat_id: int, text: str, reply_markup: dict | None = None) -> None:
    for chunk in split_text(text):
        tg_call(
            "sendMessage",
            chat_id=chat_id,
            text=chunk,
            parse_mode="Markdown",
            **({"reply_markup": reply_markup} if reply_markup else {}),
        )


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
        tg_call("sendChatAction", chat_id=chat_id, action="typing", timeout=10)
    except Exception:
        pass


# --- second brain api (cookie auth) -------------------------------------------

_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))


def sb_login() -> None:
    body = json.dumps(
        {
            "email": os.environ["SB_LOGIN_EMAIL"],
            "password": os.environ["SB_LOGIN_PASSWORD"],
        }
    ).encode()
    req = urllib.request.Request(
        f"{API_BASE}/api/auth/login", data=body,
        headers={"Content-Type": "application/json"},
    )
    with _opener.open(req, timeout=30) as resp:
        resp.read()
    log.info("logged in to %s", API_BASE)


def sb_conv_for(chat_id: int) -> str:
    entry = _state.get(str(chat_id))
    if entry and entry.get("conv_id"):
        return entry["conv_id"]
    req = urllib.request.Request(
        f"{API_BASE}/api/ai/conversations",
        data=b"{}",
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with _opener.open(req, timeout=30) as resp:
        conv = json.loads(resp.read())
    _state[str(chat_id)] = {"conv_id": conv["id"]}
    save_state()
    return conv["id"]


def sb_agent_events(conv_id: str, content: str):
    """Yield parsed SSE events from the agent chat stream."""
    body = json.dumps({"content": content}).encode()
    req = urllib.request.Request(
        f"{API_BASE}/api/ai/conversations/{conv_id}/messages",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    resp = _opener.open(req, timeout=240)
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


def sb_confirm(conv_id: str, action_id: str, decision: str):
    """POST confirm/reject and yield the continuation stream events."""
    body = json.dumps({"action_id": action_id}).encode()
    req = urllib.request.Request(
        f"{API_BASE}/api/ai/conversations/{conv_id}/{decision}",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    resp = _opener.open(req, timeout=240)
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


def sb_undo(action_id: str) -> str:
    req = urllib.request.Request(
        f"{API_BASE}/api/ai/actions/{action_id}/undo", data=b"{}", method="POST"
    )
    with _opener.open(req, timeout=30) as resp:
        return json.loads(resp.read()).get("status", "?")


# --- chat flow -----------------------------------------------------------------

def handle_message(chat_id: int, text: str) -> None:
    if not text.strip():
        return
    tg_typing(chat_id)
    if text.startswith("/start"):
        tg_send(
            chat_id,
            "Hi! I'm your Second Brain agent 🤖\n\n"
            "Ask me anything about your calendar, notes, food or fitness — "
            "or ask me to make changes. Writes are always proposed first and "
            "you approve them here.\n\n"
            "Commands: /new (start a fresh conversation)",
        )
        return
    if text.startswith("/new"):
        conv = sb_conv_for(chat_id)
        _state[str(chat_id)] = {"conv_id": conv}
        save_state()
        # force a new conversation next message
        tg_send(chat_id, "New conversation started.")
        return

    conv_id = sb_conv_for(chat_id)
    pending: dict[str, dict] = {}
    answer: list[str] = []
    tools: list[str] = []

    for ev in sb_agent_events(conv_id, text):
        etype = ev.get("type")
        if etype == "text_delta":
            answer.append(ev.get("content", ""))
        elif etype == "tool_call":
            tools.append(ev.get("name", "?"))
        elif etype == "confirm_required":
            action_id = ev["action_id"]
            preview = ev.get("preview") or {}
            summary = preview_summary(ev.get("tool", ""), preview)
            pending[action_id] = {"tool": ev.get("tool", "")}
            tg_send(
                chat_id,
                f"*Proposed change:* {summary}\n\nApprove or reject?",
                reply_markup={
                    "inline_keyboard": [
                        [
                            {"text": "✅ Apply", "callback_data": f"apply:{action_id}"},
                            {"text": "✖ Reject", "callback_data": f"reject:{action_id}"},
                        ]
                    ]
                },
            )
        elif etype == "error":
            answer.append(f"⚠️ {ev.get('message', 'something went wrong')}")

    if tools:
        tg_send(chat_id, "🔧 " + ", ".join(tools))
    if answer:
        tg_send(chat_id, "".join(answer))


def preview_summary(tool: str, args: dict) -> str:
    bits = []
    for key in ("title", "name", "content", "start_at", "end_at", "date", "description"):
        if key in args and args[key]:
            bits.append(f"{key}: {args[key]}")
    return " · ".join(bits) if bits else f"{tool}({json.dumps(args)[:120]})"


def handle_callback(chat_id: int, callback_id: str, data: str) -> None:
    decision, action_id = data.split(":", 1)
    conv_id = (_state.get(str(chat_id)) or {}).get("conv_id")
    if not conv_id:
        tg_call("answerCallbackQuery", callback_query_id=callback_id, text="Start with /start first.")
        return
    tg_typing(chat_id)
    try:
        if decision == "undo":
            status = sb_undo(action_id)
            tg_call("answerCallbackQuery", callback_query_id=callback_id, text=f"Undone ({status}).")
            return
        answer: list[str] = []
        for ev in sb_confirm(conv_id, action_id, decision):
            if ev.get("type") == "text_delta":
                answer.append(ev.get("content", ""))
            elif ev.get("type") == "error":
                answer.append(f"⚠️ {ev.get('message', 'error')}")
        tg_call("answerCallbackQuery", callback_query_id=callback_id)
        if answer:
            tg_send(chat_id, "".join(answer))
        else:
            tg_send(chat_id, "Done ✅")
    except Exception as exc:  # noqa: BLE001
        log.exception("callback failed")
        tg_call("answerCallbackQuery", callback_query_id=callback_id, text=f"Error: {exc}")


def handle_update(update: dict) -> None:
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
    text = msg.get("text")
    if chat_id is None or text is None:
        return
    if chat_id not in ALLOWED:
        tg_send(chat_id, "Sorry, you are not allowed to use this bot.")
        return
    handle_message(chat_id, text)


def main() -> None:
    load_state()
    sb_login()
    offset = 0
    log.info("polling telegram (allowed: %s)", ALLOWED)
    while True:
        try:
            updates = tg_call("getUpdates", offset=offset, timeout=50)
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
