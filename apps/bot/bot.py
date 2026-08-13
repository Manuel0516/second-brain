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
import time
import urllib.error
import urllib.request

API_BASE = os.environ.get("SECOND_BRAIN_API_URL", "http://127.0.0.1:8000")
VERIFICATION_BASE = os.environ.get(
    "SB_VERIFICATION_BASE", "https://brain.zero-five.space"
)
TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
ALLOWED = {
    int(x)
    for x in os.environ.get("TELEGRAM_ALLOWED_USERS", "1110963147").split(",")
    if x.strip()
}
STATE_FILE = os.environ.get("SB_BOT_STATE_FILE", "/data/state.json")
TG = f"https://api.telegram.org/bot{TOKEN}"
MSG_LIMIT = 4096
DEVICE_TTL_SECONDS = 590

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
    except Exception:  # noqa: BLE001
        pass


# --- second brain api (bearer token) ------------------------------------------

def api_json(method: str, path: str, body: dict | None = None, token: str | None = None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{API_BASE}{path}", data=data, method=method
    )
    if data:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.status, json.loads(resp.read() or "null")


def api_stream(method: str, path: str, body: dict, token: str, timeout: int = 240):
    """Open a streaming request and yield parsed SSE events."""
    req = urllib.request.Request(
        f"{API_BASE}{path}", data=json.dumps(body).encode(), method=method
    )
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
            tg_send(chat_id, "⌛ The code expired — send /start to try again.")
            return False
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

    if text.startswith("/start") or text.startswith("/login"):
        if entry.get("token"):
            tg_send(chat_id, "Already connected. Ask me anything! (/new starts a fresh conversation)")
        else:
            authorized(chat_id)
        return

    if not authorized(chat_id):
        return

    if text.startswith("/new"):
        tg_send(chat_id, "Starting a fresh conversation…")
        conv = sb_conv_for(chat_id, fresh=True)
        tg_send(chat_id, "New conversation started.")
        return

    conv_id = sb_conv_for(chat_id)
    tools: list[str] = []
    answer: list[str] = []

    for ev in sb_agent_events(chat_id, conv_id, text):
        etype = ev.get("type")
        if etype == "text_delta":
            answer.append(ev.get("content", ""))
        elif etype == "tool_call":
            tools.append(ev.get("name", "?"))
        elif etype == "confirm_required":
            action_id = ev["action_id"]
            preview = ev.get("preview") or {}
            summary = preview_summary(ev.get("tool", ""), preview)
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


def sb_conv_for(chat_id: int, fresh: bool = False) -> str:
    entry = chat_entry(chat_id)
    if entry.get("conv_id") and not fresh:
        return entry["conv_id"]
    status, conv = api_json(
        "POST", "/api/ai/conversations", body={}, token=entry.get("token")
    )
    if status != 201:
        raise RuntimeError(f"create conversation failed: {status}")
    entry["conv_id"] = conv["id"]
    save_state()
    return conv["id"]


def sb_agent_events(chat_id: int, conv_id: str, content: str):
    entry = chat_entry(chat_id)
    yield from api_stream(
        "POST", f"/api/ai/conversations/{conv_id}/messages",
        {"content": content}, token=entry["token"],
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
        tg_call("answerCallbackQuery", callback_query_id=callback_id, text="Start with /start first.")
        return
    tg_typing(chat_id)
    try:
        if decision == "undo":
            status, body = api_json(
                "POST", f"/api/ai/actions/{action_id}/undo", body={}, token=token
            )
            tg_call("answerCallbackQuery", callback_query_id=callback_id, text=f"Undone ({body.get('status', status)}).")
            return
        answer: list[str] = []
        for ev in api_stream(
            "POST", f"/api/ai/conversations/{conv_id}/{decision}",
            {"action_id": action_id}, token=token,
        ):
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
    offset = 0
    log.info("polling telegram (allowed: %s, api: %s)", ALLOWED, API_BASE)
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
