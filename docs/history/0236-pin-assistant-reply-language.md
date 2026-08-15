# 0236 — Pin the assistant's reply language to the user's latest message

Date: 2026-08-15
Status: accepted

## What changed

User report: the AI assistant's chat replies sometimes switch language mid-conversation
unprompted. Root cause: the only instruction governing reply language was one vague sentence,
"Be concise and direct, and reply in the user's language," tacked onto the very end of the
system prompt (`apps/api/app/modules/ai/prompts.py`) — while everything else the model sees is
English by volume and by construction: the rest of the system prompt itself, every saved
memory-category label ("Profile:"/"Preferences:"/"Corrections:"), starter skill content, and —
critically — the full conversation history replayed on every turn (`agent.py`'s `run`), which
includes every past tool call's arguments and every tool result's `_summarize()` text
("3 result(s): ...", "Done.", etc.), all hardcoded English. In a longer conversation with
several tool calls, English tokens vastly outnumber whatever language the user is actually
writing in, and a single soft instruction at the tail of the prompt is a weak counter-signal to
that — models drift toward matching the dominant language of their context.

Rewrote the instruction: moved it to the very front of the system prompt (primacy — the first
thing the model reads, not the last), made it explicit that it applies to the *latest* message
specifically (so a language switch by the user this turn is honored immediately, not resisted
by earlier-turn language), and named the actual competing signal outright — telling the model
that the prompt, facts, skills, and tool-call/result text are internal, always-English content
by design and must not influence reply language.

## Why

User request: fix the assistant switching reply language unexpectedly.

## Files touched

- `apps/api/app/modules/ai/prompts.py` — `build_system_prompt`'s opening sentence now includes
  the language-pinning instruction (previously a bare identity sentence); the redundant tail
  instruction was trimmed to just "Be concise and direct."
- `apps/api/tests/test_ai.py` — added
  `test_system_prompt_pins_reply_language_to_latest_message`, calling
  `prompts.build_system_prompt` directly and asserting the instruction text is present and
  appears before the `Recent facts:` block (i.e. leads the prompt rather than trailing it).

## How the pieces connect

`build_system_prompt` runs fresh on every call to `agent.run` (`apps/api/app/modules/ai/
agent.py`), so this is a global, immediate behavior change — no migration, no per-user
rollout. It doesn't touch how conversation history or tool results are constructed (those stay
English, which is fine — the fix works by explicitly telling the model to disregard them for
language purposes, not by translating them).

## How to modify this later

- If drift still happens in very long conversations (where the sheer token volume of English
  history could still outweigh a single instruction, however well-placed), the next lever is
  truncating/summarizing older tool-call turns out of the replayed history rather than fighting
  it with more prompt text — see `agent.py`'s `run`, which currently replays the full
  unabridged history every turn.
- There's still no persisted per-user language preference; the assistant re-infers language
  from scratch each message by design (so a user who genuinely switches languages mid-
  conversation is followed correctly). If a user ever wants the assistant pinned to one
  language regardless of what they type, that's a `remember(fact, category="preference")` the
  user can state explicitly — the existing memory system already surfaces preferences in the
  prompt.
