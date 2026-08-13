# 0209 — Embedded AI agent backend

Date: 2026-08-13
Status: accepted

## What changed
Added the authenticated embedded-agent backend: six user-scoped tables, conversation/settings APIs, SSE ReAct execution, OpenRouter provider, internal-REST tools, durable memories and skills, write confirmation/rejection, and action undo. Added an automated FakeProvider suite and real port-8001 smoke script.

## Why
The AI assistant needed to become a real, auditable client of Second Brain data while preserving the safety rule that reads are immediate and writes require explicit user confirmation.

## Files touched
- `apps/api/app/models.py` — six AI persistence models.
- `apps/api/alembic/versions/c3b8d4b570e2_ai_assistant_module.py` — reviewed AI-only schema migration.
- `apps/api/app/config.py` — configurable internal API URL.
- `apps/api/app/modules/ai/` — SSE, provider, prompt, memory, tool registry, and agent loop.
- `apps/api/app/routes/ai.py` — authenticated settings, conversation, chat, confirmation, rejection, and undo routes.
- `apps/api/app/main.py` — mounts the AI router.
- `apps/api/tests/test_ai.py` — authentication, singleton, route-order, SSE read-loop,
  write-confirm-resume/reject, create/update/delete undo, schemas, attribution, summary, and
  cross-conversation memory/skill tests with FakeProvider.
- `docs/architecture/DATABASE.md` — AI table reference and migration index.
- `apps/api/scripts/ai_smoke.py` — real API read, memory, confirmed-write, and undo smoke.

## How the pieces connect
The chat route persists user messages and streams events from the agent loop. The loop calls OpenRouter with OpenAI-compatible tool schemas. Read tools execute through authenticated internal REST requests or local memory helpers. Write calls become pending `AIAction` rows that preserve the provider call id and exact arguments;
confirm captures a pre-image, executes through the same REST API, stores the matching tool result,
and resumes the model. Reject resumes with a matching rejection result. Undo hard-deletes created
rows, restores updates, and recreates deleted events from their stored pre-image.

## How to modify this later
Add or change tools in `modules/ai/tools.py`, keeping schemas aligned with route Pydantic models and marking every mutation `is_write=True`. Provider behavior belongs in `providers.py`; preserve the 90-second timeout and retry policy. Extend tests through `agent.provider_factory` so no network is used. Any schema change must be a new Alembic migration.
