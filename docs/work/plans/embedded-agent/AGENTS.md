# Embedded Agent Plan — Agent Instructions

Read `README.md` in this folder first — it is the binding contract. This file adds the
how-to-work rules for the implementing agents.

## Context

- Repo: `github.com/Manuel0516/second-brain` — Second Brain life-OS (React/Vite frontend,
  FastAPI/PostgreSQL backend, single user).
- Root `AGENTS.md` and `apps/api/AGENTS.md` (or `apps/web/AGENTS.md`) apply fully.
- Target branch: `development` (the orchestrator merges your work — **do not commit yourself**).
- Worktree: your working directory is an isolated git worktree; all your edits land there.

## Before writing code

1. Read `docs/CONTEXT.md`, then the affected specs: `docs/product/AI_ASSISTANT_MODULE.md`
   (mandatory), plus the module spec for any route you wire tools to
   (`CALENDAR_MODULE.md`, `NOTES_MODULE.md`, `FOOD_MODULE.md`, `FITNESS_MODULE.md`).
2. Read `docs/architecture/BACKEND.md` + `DATABASE.md` (backend agent) or
   `docs/design/STYLE_GUIDE.md` (frontend agent — mandatory).
3. Inspect the actual request/response models of every route you touch
   (`apps/api/app/routes/*.py`) — the plan's tool list names the endpoints, but the exact
   field names, required vs optional, and query params come from the code. Adjust the tool
   schemas to match reality. If a route in the plan does not exist or differs, use what the
   code actually has and note the deviation in your final report.

## Implementation order (backend agent)

1. Models + Alembic migration (`uv run alembic revision --autogenerate` in `apps/api/`, review,
   `upgrade head`).
2. `modules/ai/` skeleton: sse.py, providers.py, prompts.py, tools.py, agent.py, memory.py.
3. `routes/ai.py` + mount in `main.py`.
4. `scripts/ai_smoke.py` — runs the loop against the dev API directly (imports the module,
   no HTTP server needed except the tools' internal calls; use httpx against
   `http://localhost:8000` and login via the auth flow the API exposes — dev credentials in
   `.env.dev`).
5. Tests in `apps/api/tests/test_ai_*.py` (FakeProvider pattern — see plan §12).
6. `docs/history/` entry + CHANGELOG index update.

## Implementation order (frontend agent)

1. Read STYLE_GUIDE + inspect how an existing module mounts (e.g. `modules/fitness`).
2. `modules/assistant/useAssistantChat.ts` (SSE via fetch+ReadableStream — plan §11).
3. `modules/assistant/AssistantPanel.tsx` + floating button + mount in app shell.
4. `modules/assistant/ConfirmCard.tsx` (Apply/Reject/Undo).
5. Mount test + `npm run check` green.

## Model / auth details (backend)

- Tools execute via internal REST calls: mint a short-lived JWT with the user's identity using
  the same signing key + claim shape as `routes/auth.py` (read it). The executor sends
  `Authorization: Bearer <jwt>` to `http://localhost:8000` (dev) — for tests use a fake
  transport that hits the FastAPI TestClient instead of real HTTP.
- `AISettings.api_key_ref`: Fernet-encrypt with the same key/pattern as Google tokens
  (`app/services/google_sync.py` or wherever `GOOGLE_TOKEN_ENCRYPTION_KEY` is used). If the
  pattern is awkward, fall back to reading `OPENROUTER_API_KEY` from the app settings and store
  nothing in api_key_ref for v1 — document the choice.

## Verification (both)

- Backend: `cd apps/api && uv run ruff check . && uv run mypy app && uv run pytest` — or the
  repo's aggregate `npm run check:api` if it covers all three.
- Frontend: `npm run check` from `apps/web/` (or root, whichever the repo defines).
- Do not deploy, do not touch Docker, do not commit, do not push.
- Report: files created/changed, verification output summary, deviations from the plan,
  anything left for the orchestrator.
