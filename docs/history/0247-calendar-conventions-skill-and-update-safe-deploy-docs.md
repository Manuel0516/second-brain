# 0247 — Calendar color/caching conventions + update-safe deploy docs

Date: 2026-08-15
Status: accepted

## What changed

Added a new starter skill, `calendar-conventions`, encoding two behaviors the user asked
to be baked into the agent permanently rather than left to a soft, easily-lost chat
memory:

1. **Color convention**: gym/workout events always go on the calendar colored blue,
   food/meal events always go on the calendar colored green — matched by each calendar's
   actual `color` from `list_calendars`, not by name.
2. **Cross-conversation caching**: resolve calendar ids/colors via `list_calendars`
   once, then `remember()` the exact ids so future conversations never re-fetch them.

The system prompt's existing "fewest tool calls" instruction (previously scoped to "in
one turn") was extended to explicitly cover caching stable lookups (calendar ids/colors,
exercise lists, etc.) across turns and conversations via `remember`/skills — the general
principle the new skill is one example of.

Also documented (README) that updating this deployment (`docker compose build web api &&
docker compose up -d`) never touches the `db`/`minio` volumes or their data — migrations
are additive-only and `ensure_starter_skills` only adds skills missing by name, so an
edited skill or a learned memory is never overwritten by an update. Called out
`docker compose down -v` explicitly as the one command that *would* destroy everything.

## Why

User (via the Telegram-bridged agent, then directly to the coding agent): "remember gym
for me is always blue, food is green," "do it with the shortest amount of calls
possible," and "create a file with useful information... like calendar ids... never call
twice the same thing." Separately: "when I update the agent I dont want to lose the
saved preferences." The color/caching rule needed to live somewhere more durable and
prominent than a single `AIMemory` fact competing for space among the 20 shown per
prompt — the starter-skill mechanism already exists for exactly this (a named,
user-editable "file" injected into the agent's context) and, being DB-seeded
additively, already satisfies the update-safety requirement without new code.

## Files touched

- `apps/api/app/modules/ai/memory.py` — added `calendar-conventions` to
  `_STARTER_SKILLS`.
- `apps/api/app/modules/ai/prompts.py` — extended the efficiency instruction to cover
  cross-turn/conversation caching via `remember`/skills, not just within-turn dedup.
- `apps/api/tests/test_ai.py` — asserts the new skill seeds and its content encodes the
  color rule; asserts re-running `ensure_starter_skills` (simulating a redeploy) leaves
  an edited skill and a user memory untouched.
- `README.md` — added the missing `docker compose up -d` step after
  `build`, with an explicit note on what an update does and does not touch, and a
  warning against `down -v`.

## How the pieces connect

`ensure_starter_skills` (called from `GET /api/ai/skills` and indirectly whenever the
agent lists skills) inserts any `_STARTER_SKILLS` entry whose `name` isn't already in the
user's `AISkill` rows — so this new skill appears for existing users on their next skill
list/agent turn without a migration, and any future edit to it survives all further
updates the same way every other starter skill already does. The skill's first line is
always visible for free in every system prompt (`Skills (load one when relevant):`
index); the agent loads full content via the existing `load_skill` tool the same way as
any other skill.

## How to modify this later

To change the color rule (e.g. add a third category), edit
`_STARTER_SKILLS["calendar-conventions"]` in `memory.py` — existing users who never
touched this skill get the update automatically; anyone who customized it keeps their
version (rename the skill if you need to force a reseed, since seeding matches by name).
To add another cross-conversation cacheable lookup, follow the same pattern: teach it as
a skill or fold it into the prompt's general caching clause, not as one-off tool code.
