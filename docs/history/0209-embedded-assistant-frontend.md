# 0209 — Embedded assistant slide-over frontend

Date: 2026-08-13
Status: accepted

## What changed

Added the global Embedded Agent frontend: a persistent assistant launcher opens a responsive
conversation-and-chat slide-over on every authenticated route. The panel loads, selects, and
deletes conversations; streams POST responses through a manual SSE parser; renders live text,
tool activity, confirmation requests, errors, timestamps, loading and empty states; and supports
confirm, reject, retry, and guarded undo actions. It also handles Escape dismissal, focus return,
mobile list/chat navigation, keyboard send, and an aria-live streaming announcement.

## Why

Phase 5 of the accepted Embedded Agent plan requires a persistent UI client for the backend's
`/api/ai` conversation, SSE, confirmation, rejection, and undo contract. The interface follows
the project design canvas while using the current style-guide tokens and accessibility rules.

## Files touched

- `apps/web/src/modules/assistant/useAssistantChat.ts` — owns conversation chat state, authenticated
  REST requests, manual SSE parsing, streamed text, tool events, confirmation continuation, and undo.
- `apps/web/src/modules/assistant/AssistantPanel.tsx` — renders the global launcher, slide-over,
  conversation list, chat flow, composer, empty/loading/error states, and responsive navigation.
- `apps/web/src/modules/assistant/ConfirmCard.tsx` — presents human-readable write previews and
  Apply, Reject, details, and guarded Undo controls.
- `apps/web/src/modules/assistant/assistant.css` — token-only assistant layout and visual styling.
- `apps/web/src/modules/assistant/AssistantPanel.test.tsx` — verifies mounting, opening, Escape
  dismissal, and focus return.
- `apps/web/src/App.tsx` — mounts the assistant beside the authenticated route outlet.
- `apps/web/vite.config.ts` — points the existing `/api` proxy at `http://127.0.0.1:8000`.

## How the pieces connect

`App.tsx` mounts one `AssistantPanel` inside `SettingsProvider`, making it available to every
protected page without adding a route. The panel uses `useAssistantChat` for chat and stream
state and the shared `apiCall` boundary for same-origin authenticated requests. Each streamed
contract event updates either message text, a compact tool row, or a `ConfirmCard`. Confirm and
reject requests consume a new SSE response from their continuation endpoints; executed cards
retain their action ID so Undo can call the action endpoint.

## How to modify this later

Keep event shapes synchronized with `docs/work/plans/embedded-agent/README.md` §5 and keep all
URLs under `/api/ai`. Add new stream events in the `StreamEvent` union and `handleEvent` switch in
`useAssistantChat.ts`. Change assistant visuals only in `assistant.css`, using existing variables
from `styles.css`; preserve the mobile one-pane navigation and 44px controls. If backend response
models change, update `Conversation`, `ConversationDetail`, and message normalization together.
