# UX Review Guide — Embedded AI Assistant (Mini-Hermes)

**Purpose:** everything UX-related that was implemented for the embedded agent, so a
reviewer (Claude) can audit it, find small mistakes, and fix them. Read this fully
before touching any of the listed files. Each section states the *intended contract*
first, then the *known rough edges / review checklist*.

All paths are relative to the repo root (`~/services/second-brain`).

---

## 0. Feature inventory (what exists)

| Surface | Where | Stack |
|---|---|---|
| Assistant slide-over chat (web) | `apps/web/src/modules/assistant/` | React, SSE |
| Confirmation cards (write previews) | `AssistantPanel.tsx` + `ConfirmCard.tsx` | React |
| Device approval page `/device?code=…` | `apps/web/src/pages/DeviceApprove.tsx` | React, public route |
| Login `?next=` support | `apps/web/src/pages/Login.tsx` | React |
| Telegram bot | `apps/bot/bot.py` | stdlib only |
| SSE + agent UX-affecting backend | `apps/api/app/modules/ai/`, `routes/ai.py` | FastAPI |

---

## 1. Web assistant slide-over — intended contract

### Launcher
- Floating button, fixed bottom-right (20px inset), 48×48, `z-index: 80`, accent-tinted,
  sparkle icon, `aria-label="Open AI assistant"` (line ~10 `assistant.css`).
- Opening the panel must not steal focus from page content; closing returns focus to the
  launcher (`AssistantPanel.tsx` `close()`).

### Panel
- Slide-over from the right, `width: min(860px, 100% - 32px)`, `height: calc(100% - 20px)`,
  `role="dialog" aria-modal`, Escape closes (effect in `AssistantPanel.tsx`).
- Layout: CSS grid `230px minmax(0, 1fr)` sidebar | chat, **plus
  `grid-template-rows: minmax(0, 1fr)`** (this was the scroll fix — do not remove).
- `.assistant-chat` has `min-height: 0`; `.assistant-messages` is `flex: 1; min-height: 0;
  overflow: auto` — the message list MUST scroll independently. If scrolling regresses,
  check this chain first.

### Conversation sidebar (left)
- "Conversations" list: title + relative timestamp + delete button per row.
- Selected row gets accent highlight; clicking loads the conversation (SSE history via
  `GET /api/ai/conversations/{id}` — messages come from the DB, not replayed).
- `+` button starts a fresh conversation.
- Mobile (`<~640px`): sidebar hidden by default, `mobile-back` button swaps
  sidebar/chat (`mobile-hidden` / `mobile-visible` classes). Check both breakpoints.

### Messages
- User: right-aligned bubble, accent tint, `role='user'`.
- Assistant: left-aligned bubble, `role='assistant'`, shows `<time>`.
- Tool chips: `⌁ toolName — summary`, pill, `max-width: 90%`, capped at `max-height:
  88px; overflow: auto; scrollbar-width: thin` (the raw-data dump fix). `.failed` variant
  shows `!` when `ok === false`.
- Streaming: while a reply streams, a temporary `.assistant-message.assistant.streaming`
  article shows the live text; a hidden `.assistant-live` div (1px, clipped) is the
  aria-live region for screen readers. On `message_done` the bubble is committed.
- **Known rough edge A — markdown is not rendered.** The assistant's answers contain
  markdown (`**bold**`, lists, code fences) and `Message` renders
  `<div>{message.content}</div>` (plain text). Decide: render a safe markdown subset, or
  strip/format. At minimum the double-asterisks look broken to users.
- **Known rough edge B — markdown-in-chips.** Tool summaries are raw Python `str(data)`
  dumps (single quotes, `None`, curly braces) truncated to 500 chars in the backend
  (`tools.py` `_call`: `str(data)[:500]`). Capping height helped, but the display is
  still programmer-speak. Consider a human-readable summary per tool (counts, titles).
- **Known rough edge C — stuck "Working…" chips.** If a stream errors mid-tool
  (`tool_call` fired but no `tool_result`), the chip stays "Working…" forever. On
  `error` events consider marking all pending chips failed.
- **Known rough edge D — historical empty replies.** Conversations created before the
  empty-reply fix (commit `06f3ff4c`, history entry 0212) contain assistant rows with
  `content: ''` (backend bug, fixed). They render as empty bubbles with only a time —
  consider hiding empty assistant messages or showing a "reply lost" placeholder.
- **Known rough edge E — streaming article placement.** The streaming bubble appends at
  the END of the list even when the reply continues mid-tool-turn; after confirmations
  resume, a second streaming bubble appears. Acceptable, but check visual continuity.

### Composer
- Textarea (`aria-label="Message the assistant"`), send button 44px target,
  `disabled` while streaming, Enter submits (check Shift+Enter for newline behavior),
  input cleared after send. Suggestion chips in the empty state are buttons that
  prefill+send.

### Confirm cards (writes)
- When the agent proposes writes, `confirm_required` events render one `ConfirmCard`
  per action id. Statuses: `pending` (Apply/Reject buttons), `applying`/`rejecting`
  (disabled), `rejected` → "Skipped proposed change", `undone` → "Change undone".
  Apply/reject POST to `/api/ai/conversations/{id}/confirm|reject` and stream the
  continuation; undo POSTs `/api/ai/actions/{id}/undo`.
- **Known rough edge F — preview content.** Cards show `preview` JSON as a `<pre>` block
  (see `.assistant-confirm-card pre`) — same programmer-speak issue as chips. Check
  formatting of dates/ids; consider a friendlier key-value render.

### Accessibility
- Focus trap is NOT implemented (only Escape + focus return). Tab can leave the dialog —
  decide if a trap is needed.
- `.assistant-live` aria-live region exists; verify `aria-atomic` behavior with
  streaming chunks doesn't spam screen readers.
- All interactive targets ≥ 44px; colors use theme tokens (`--bg-*`, `--text-*`,
  `--accent-*`, `--border-*`) — verify light, dark, neon, monochrome themes.

---

## 2. Device approval flow — intended contract

- Flow: bot creates grant → user opens `https://brain.example.com/device?code=XXXX`
  (VPN-only) → logs in → sees code + "Approve device" → POST
  `/api/auth/device/approve` → bot polls status → receives one-time bearer token.
- Page states (all covered): auth loading, missing `code`, not-authenticated (CTA →
  `/login?next=/device?code=…`), approving, done ("✅ Device approved"), error (try
  again).
- Login supports `?next=` (returns to the device page after auth).
- Backend: `POST /api/auth/device` (201), `GET /api/auth/device/status` (pending |
  approved+token once | expired), `POST /api/auth/device/approve` (needs login; 404
  unknown, 409 used/expired, TTL 10 min).
- **Known rough edge G — approval semantics.** The page auto-shows the code but requires
  an explicit button click; if the code expired between bot message and click, the user
  gets a generic error — consider wording that says "ask the bot for a fresh link".
- **Known rough edge H — logged-out deep link.** If the user is logged out, the CTA goes
  to login and back — verify the `next` param survives the full round trip (including
  TOTP when enabled).

---

## 3. Telegram bot — intended contract

- Commands: `/start` (connect via device flow or welcome if already connected),
  `/login` (re-run device flow), `/new` (fresh conversation).
- First message → sends 🔐 link + code (`SB_VERIFICATION_BASE`/device?code=…), polls up
  to 10 min, replies "✅ Connected!" or "⌛ code expired — send /start".
- Replies: `parse_mode=Markdown`, split at 4096 chars. Tool usage is summarized as one
  line `🔧 get_today, get_events` BEFORE the answer. Confirmations arrive as inline
  keyboard rows ✅ Apply / ✖ Reject; undo via callback (`Undone (…)`).
- Not allowed chat ids get a single "not allowed" message.
- **Known rough edge I — markdown split breaks formatting.** `split_text` cuts at
  `\n` or hard 4096 — a `**` pair or code fence can split across chunks, leaving broken
  markdown in Telegram. Split at markdown-safe boundaries (or strip `*` emphasis and use
  plain text).
- **Known rough edge J — no progress during long agent turns.** Only an initial
  `sendChatAction(typing)`; the agent can take 30s+ (tools + LLM). Consider periodic
  typing actions or "thinking…" messages.
- **Known rough edge K — tool line placement.** The 🔧 line is sent only after the whole
  turn finishes (after the answer streams) — order feels inverted; the user sees the
  answer text arrive as ONE message at the end regardless. Consider sending the tool line
  first, then the final answer.
- **Known rough edge L — single-threaded flow.** While the device flow polls (blocking),
  the bot cannot answer other messages (acceptable single-user, documented).
- **Known rough edge M — `/start` when already connected** replies with a hint but does
  not show a menu; consider a tiny command list.

---

## 4. Backend behaviors that shape UX (verify, don't redesign)

- SSE events: `conversation`, `text_delta`, `tool_call`, `tool_result`, `confirm_required`,
  `message_done`, `error`, `done` (`sse.py`).
- Agent loop: max 12 tool rounds; writes are gated (`ask_before_write`); while any
  confirmation is pending, new messages get HTTP 409 (frontend shows an inline error —
  verify the wording).
- Empty-reply fix (`agent.py`): if the stream yields zero chunks, fall back to the
  `complete()` content. Do not remove.
- Tool summaries: `str(data)[:500]` in `tools.py::_call`; `get_today`/`remember` have
  custom short summaries. Memory/skills (`remember`, `save_skill`…) are injected into the
  system prompt each turn.

---

## 5. Files to touch during review

- `apps/web/src/modules/assistant/AssistantPanel.tsx` — panel, Message, composer, list.
- `apps/web/src/modules/assistant/ConfirmCard.tsx` — confirmation cards.
- `apps/web/src/modules/assistant/useAssistantChat.ts` — SSE hook (all state).
- `apps/web/src/modules/assistant/assistant.css` — all assistant styles.
- `apps/web/src/modules/assistant/AssistantPanel.test.tsx` — mount + stream regression test
  (keep green; it encodes the `message_done` capture fix).
- `apps/web/src/pages/DeviceApprove.tsx`, `pages/Login.tsx`, `App.tsx` (route).
- `apps/bot/bot.py` — Telegram side.
- `apps/api/app/modules/ai/agent.py`, `tools.py`, `routes/ai.py` — only if the contract
  itself must change.

---

## 6. How to test

Dev stack (VPS, no prod impact): `docker compose -f compose.dev.yaml up -d` (db :5433,
minio :9100), API on host `uv run uvicorn app.main:app --reload --port 8000` (from
`apps/api`, env `.env.dev`), web `npm run dev` (from `apps/web`, port 5173). Login:
`demo@example.com` (password in `/tmp/secondbrain-dev-pass.txt` on the VPS).

Bot against dev: run `apps/bot/bot.py` with `SECOND_BRAIN_API_URL=http://127.0.0.1:8000`
`SB_VERIFICATION_BASE=http://127.0.0.1:5173` — then message @Zero_Five_bot from the owner
Telegram account (123456789). **Never run two pollers with the same token at once.**

Checks to run after any change: `npm run check --workspace @secondbrain/web` (format,
lint, 156 tests, build) and `uv run --directory apps/api pytest` (72 tests). CI runs both.

---

## 7. Known-good reference points (don't regress)

- Scroll chain: `.assistant-panel` grid rows + `.assistant-chat` min-height (commit 06f3ff4c).
- `message_done` captures text BEFORE clearing the ref (deferred-updater bug, test in
  `AssistantPanel.test.tsx`).
- Tool chip height cap (88px) — intentional.
- Device token delivered once (`token_delivered`), TTL 10 min.
- Bot has zero dependencies; keep it that way (stdlib only).
