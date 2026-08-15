# 0231 — Tool guidance: workout_type is a label, not exercise selection

Date: 2026-08-15
Status: accepted

## What changed

Even after 0229 gave the agent a one-call way to link a planned workout to an event via
`create_event(workout_type=...)`, a real conversation showed it still didn't understand what
`workout_type` actually does. Asked to link "a workout... leave it without a plan," the model
assumed `workout_type` was the thing controlling whether exercises got pre-filled, and spent
four back-and-forth turns asking the user to pick a type (Legs? gym? Push/Pull/Cardio?) before
finally defaulting to a placeholder — the exact one-call behavior it should have used
immediately, since the linked session is *always* created with zero exercises regardless of
which label `workout_type` gets.

Extended `create_event`'s tool description (`apps/api/app/modules/ai/tools.py`) to say
explicitly: `workout_type` is only a label, it never pre-fills exercises, the session is always
empty either way, and — the actionable instruction — the model should pick a reasonable
placeholder itself instead of asking the user which type they mean. This is a schema-level fix
so every user gets the corrected behavior by default, rather than relying on the per-user
`remember`-saved preference the agent stored during that conversation (which only helps that
one user, and only after they'd already suffered through the confusion once).

## Why

User request: turn a lesson the agent learned the hard way, in one conversation, into default
behavior for every user in production — not something each person has to teach it themselves
via a saved memory.

## Files touched

- `apps/api/app/modules/ai/tools.py` — `create_event`'s tool description now spells out that
  `workout_type` is label-only, never affects the (always-empty) exercise list, and that the
  model should self-select a placeholder rather than asking the user to clarify.
- `apps/api/tests/test_ai.py` — added
  `test_create_event_workout_type_description_warns_against_asking`, asserting the two key
  phrases stay present in the schema description so a future edit can't silently drop this
  guidance.

## How the pieces connect

Tool descriptions ship inside `tools.schemas()`, which is sent to the model on every turn as
part of the function-calling schema (see `schemas_for` in the same file) — editing the
description is a global, immediate behavior change with no migration or per-user rollout step,
unlike the `remember`-based fix the agent applied to itself mid-conversation (which is scoped
to `AIMemory` rows for that one user).

## How to modify this later

- If the model still asks clarifying questions for other label-only/cosmetic optional fields on
  other tools, the same fix applies: name the field as cosmetic-only in its schema description
  and state explicitly that the model should self-select a default. This is a description-text
  problem each time, not a system-prompt-wide one — keep instructions local to the tool that
  needs them rather than growing the shared system prompt in `prompts.py`.
