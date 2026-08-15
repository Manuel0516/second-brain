# 0223 — Agent starter skills and controls

Date: 2026-08-15
Status: accepted

## What changed
Added six editable starter skills for daily planning, weekly review, meal planning, workout coaching, spending review, and capture/organization. Skills now have an enabled state, and AI settings can rename, edit, enable, disable, and save them.

## Why
The agent had a durable skill mechanism but only seeded memory consolidation. The user wanted useful built-in procedures and direct control over which skills the agent can discover and load.

## Files touched
- `apps/api/app/models.py` — added the persisted skill enabled state.
- `apps/api/alembic/versions/033_ai_skill_enabled.py` — added the database column.
- `apps/api/app/modules/ai/memory.py` — defined and safely seeded missing starter skills without overwriting edits.
- `apps/api/app/modules/ai/prompts.py` — excluded disabled skills from the prompt index.
- `apps/api/app/modules/ai/tools.py` — excluded disabled skills from agent listing and loading.
- `apps/api/app/routes/ai.py` — returned skill state, seeded starters, and supported partial edits/toggles.
- `apps/web/src/modules/settings/AISettings.tsx` — added skill name editing and enable/disable controls.
- `apps/api/tests/test_ai.py` — covered starter seeding, editing, disabling, and enforcement.

## How the pieces connect
Opening AI settings seeds only missing starter records for the current user. The UI patches individual fields through the skill endpoint. Enabled records appear in the system prompt and can be loaded by the agent; disabled records remain editable in settings but are invisible to agent execution.

## How to modify this later
Edit `_STARTER_SKILLS` in `memory.py` to change defaults or add a new starter. Existing user-edited content is never overwritten; a new unique name seeds on the next skills request. Keep both prompt filtering and tool-load filtering aligned with the enabled column.
