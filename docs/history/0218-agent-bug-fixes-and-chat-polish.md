# 0218 — Agent bug fixes: create_link, history corruption, and chat UI polish

Date: 2026-08-15
Status: accepted

## What changed

Four user-reported bugs, fixed at the root:

1. **`create_link` couldn't link non-page entities.** The tool hardcoded
   `source_type`/`target_type` to `"page"` regardless of what was actually being linked —
   so "link this event to the gym session" always sent `{"source_type": "page", ...}` with
   an event/workout-session id, which the backend correctly rejects/errors on (the reported
   `API returned 500: Internal Server Error`). The tool now takes explicit `source_type`/
   `target_type`/`relation` args (`page`|`event`|`meal_log`|`workout_session`, matching the
   backend's real `NodeType`), defaulting to `page`/`page`/`related` for backward
   compatibility. The system prompt now tells the model to set these explicitly for
   anything other than two pages.
2. **Conversation history corruption after a mixed read+write turn.** When one model turn
   called both a read tool (executes immediately) and a write tool (deferred for
   confirmation) together, the persisted assistant message stored `tool_calls` for *all*
   calls but `tool_results: []` — losing the completed reads' results entirely. On the next
   turn, the reconstructed history had `tool_calls` with no matching tool response for those
   reads, which is invalid for the provider's tool-calling contract and a very plausible
   cause of the reported "too many steps" (a confused/malformed conversation drives the
   model to retry or over-explore). Reads' results are now persisted alongside the deferred
   write's `tool_calls` from the start. Also added a "be decisive, don't repeat identical
   tool calls" instruction to the system prompt, and made the "too many steps" message
   itself clearer.
3. **Confirmed action cards didn't shrink after Apply.** `ConfirmCard` kept showing the full
   bordered card (label, preview, expandable details, actions) even after execution, with
   an Undo button bolted on — the user asked for it to "disappear." It now collapses to a
   single compact line (`✓ {preview}` + an inline Undo control), matching the visual weight
   already used for `rejected`/`undone` states, instead of staying a full card.
4. **Chat UI polish**, all in `assistant.css`:
   - **Message/chip boxes shrinking as the conversation grows.** `.assistant-messages` is a
     flex column with `overflow: auto`; per the flexbox spec that makes children's
     *protected minimum content size* become `0`, so once total content exceeds the visible
     height the browser was proportionally **shrinking** older bubbles/chips instead of
     just scrolling — exactly the "boxes get too small once I send the next message"
     symptom. Fixed with `.assistant-messages > * { flex-shrink: 0; }`.
   - **Camera icon not centered.** `.assistant-composer button` (the send/attach buttons)
     never had `display: flex`/`grid` centering — a text glyph like "→" happens to look
     roughly centered by default button text layout, but the injected `<svg>` for the
     camera icon doesn't get that treatment and rendered off-center. Added
     `display: grid; place-items: center;`.

## Why

Direct user bug reports from using the app: a broken linking flow, a burned-out "too many
steps" turn on the exact same request, confirmed cards that don't go away, chat boxes that
visibly shrink, and an off-center icon.

## Files touched

- `apps/api/app/modules/ai/tools.py` — `create_link` schema + dispatch now pass through
  `source_type`/`target_type`/`relation`.
- `apps/api/app/modules/ai/agent.py` — persist completed reads' `tool_results` alongside a
  deferred write's `tool_calls`; clearer "too many steps" message.
- `apps/api/app/modules/ai/prompts.py` — decisiveness instruction; `create_link` usage note.
- `apps/api/tests/test_ai.py` — regression test: `create_link` with `source_type="event"`/
  `target_type="workout_session"` creates the link with the right types (previously would
  have 404'd/500'd against the old hardcoded `"page"`/`"page"` dispatch).
- `apps/web/src/modules/assistant/ConfirmCard.tsx` — `executed` status renders the compact
  applied+undo row instead of the full card.
- `apps/web/src/modules/assistant/assistant.css` — `.assistant-confirm-applied`; message-
  list `flex-shrink: 0` fix; composer button icon centering.

## How the pieces connect

The `create_link` fix and the history-corruption fix are related but independent: a user
task like "create a session, create an event, link them" needs `create_link` called with
the *real* ids from the just-executed writes — that already worked structurally (each
confirm resumes `agent.run()` with a fresh round budget and the tool results from prior
confirms in history), but even once the model had the right ids, the tool itself couldn't
succeed because of the hardcoded types. The history-corruption bug is a separate, more
systemic issue: it corrupts *any* conversation where a turn mixes reads and writes, not
just linking — so it's a general "too many steps" risk factor, not something specific to
this one task.

## How to modify this later

- If another polymorphic-link-style tool is added, reuse the same
  `page|event|meal_log|workout_session` `NodeType` set from `routes/notes.py` rather than
  re-deriving it — keep the tool's enum and the backend's `Literal` in sync.
- The `.assistant-messages > * { flex-shrink: 0; }` rule is load-bearing for *any* future
  child added to that flex column (new message types, banners, etc.) — don't remove it
  without re-testing that a long conversation doesn't squish earlier entries.
