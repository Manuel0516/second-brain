# Second Brain — Architecture Overview

> Quick-read guide. For deep implementation detail, check `docs/history/`.
> For full product scope, check `docs/product/`.

---

## What is this?

A self-hosted personal life-OS. One user (you). Everything — calendar events, notes, expenses,
workouts, meals — lives in one database and links to everything else through a generic graph.
The calendar is the main spine: almost everything has a date and can appear there.

---

## System map

```
Browser
  └── React app (Vite, TypeScript)
        ├── /calendar   → calendar module
        ├── /notes      → notes/pages module
        ├── /settings   → user settings
        └── /login      → auth

HTTP (same-origin /api)
  └── FastAPI (Python, uvicorn)
        ├── routes/auth.py       → login, logout, refresh, TOTP
        ├── routes/calendar.py   → calendars + events CRUD
        ├── routes/notes.py      → pages CRUD + links + search
        ├── routes/settings.py   → user settings CRUD
        └── routes/admin.py      → internal admin

        └── models.py            → all SQLAlchemy models
        └── database.py          → async session factory
        └── security.py          → JWT + password hashing
        └── config.py            → env config + prod safety checks

PostgreSQL
  └── all persistent data

MinIO (S3-compatible)
  └── file attachments (receipts, photos) — not yet wired to frontend

Traefik (reverse proxy)
  └── TLS termination + WireGuard allowlist, routes brain.example.com → nginx → frontend + /api
```

---

## Request lifecycle

1. Browser makes a fetch to `/api/...` (same origin — Vite proxies in dev, nginx routes in prod).
2. FastAPI reads the `sb_access` JWT cookie from the request.
3. `dependencies.py → current_user()` validates the JWT and returns the `User` row.
4. The route handler queries PostgreSQL via an async SQLAlchemy session.
5. The handler returns a Pydantic response model; FastAPI serialises it to JSON.
6. The browser updates local React state.

Auth tokens are httpOnly cookies — never in localStorage.

---

## How modules connect to each other

Everything cross-module goes through the `Link` table (see `DATABASE.md`). No module imports
another module's database models. The generic link edge is the only cross-module coupling.

Example: an event that has a linked note — `Link(source_type="event", source_id=<event_id>,
target_type="page", target_id=<page_id>, relation="documents")`. The calendar route never
imports the Page model; it reads links from the Link table only.

---

## Development stack

| Component | Tool |
|-----------|------|
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS + CSS custom properties (tokens in `styles.css`) |
| Rich text | Tiptap v3 (block editor, StarterKit + extensions) |
| Date logic | date-fns + rrule |
| Backend | FastAPI + SQLAlchemy (async) + Pydantic v2 |
| Database | PostgreSQL (Docker in dev, VPS in prod) |
| Auth | JWT cookies + Argon2 password hashing + TOTP (pyotp) |
| Migrations | Alembic |
| Object storage | MinIO |
| Reverse proxy | Traefik |
| Deploy | Docker Compose |

---

## Environment setup (dev)

```bash
# 1. Install dependencies
npm install
uv sync --project apps/api --dev

# 2. Start Postgres + MinIO
docker compose -f compose.dev.yaml up -d db minio

# 3. Run migrations
cd apps/api && uv run alembic upgrade head

# 4. Start both servers
npm run dev:api    # FastAPI on :8000
npm run dev:web    # Vite on :5173 (proxies /api → :8000)

# Optional: Telegram bridge (requires TELEGRAM_BOT_TOKEN)
docker compose -f compose.dev.yaml --profile bot up -d --build bot
```

---

## Verify everything is working

```bash
npm run check                # frontend: typecheck + lint + build
npm run check:api            # backend: ruff + mypy + pytest
```
