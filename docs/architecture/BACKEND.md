# Second Brain — Backend Architecture

> Plain-language guide to the FastAPI + PostgreSQL backend.
> Read this before any backend task.

---

## What the backend does

The backend is a JSON API. It receives HTTP requests from the React frontend, validates the
user's identity using a cookie, reads or writes to the database, and returns JSON.

That's it. No server-side rendering. No background jobs yet (they're planned for future
phases). No direct communication with the frontend other than JSON over HTTP.

---

## File layout

```
apps/api/
  alembic/
    versions/          — one file per database migration, numbered 001, 002, ...
    env.py             — tells Alembic how to connect to the database
    alembic.ini        — Alembic config

  app/
    main.py            — creates the FastAPI app, mounts all routes, lifespan handler
    config.py          — reads environment variables; enforces security in prod
    database.py        — creates the async database connection + session factory
    models.py          — all database tables (SQLAlchemy ORM models)
    security.py        — password hashing (Argon2), JWT creation/validation
    dependencies.py    — FastAPI dependencies (e.g. `current_user()`)
    storage.py         — MinIO client (lazy singleton, bucket auto-create)

    routes/
      auth.py          — POST /login, POST /logout, POST /refresh, GET /me, TOTP
      calendar.py      — CRUD for /calendars and /events
      notes.py         — CRUD for /pages, plus /links and /search
      files.py         — image upload/serve/delete (MinIO) + GET /embed
                         (SSRF-guarded page-metadata fetch for bookmark cards)
      settings.py      — GET + PATCH /settings
      admin.py         — internal admin endpoints
```

---

## How a request works (step by step)

1. Frontend calls `fetch('/api/events', { credentials: 'include' })`.
2. The request arrives at FastAPI in `main.py`.
3. FastAPI matches the URL to a route function in one of the `routes/` files.
4. The route function has a parameter `user: User = Depends(current_user)`. FastAPI
   automatically calls `current_user()` from `dependencies.py`.
5. `current_user()` reads the `sb_access` cookie, decodes the JWT, looks up the user in
   the database, and returns the `User` object. If anything fails, it raises HTTP 401.
6. The route function runs its logic using `db: AsyncSession = Depends(get_db)` — an async
   database session injected automatically by FastAPI.
7. The function queries or writes to the database using SQLAlchemy's async API.
8. It returns a Pydantic model (defined in the same route file). FastAPI serialises it to JSON.

---

## Authentication

**Cookies, not localStorage.** Two cookies are set at login:

- `sb_access` — short-lived JWT (15 minutes). Contains the user ID. Used to authenticate
  every API request.
- `sb_refresh` — long-lived opaque token (30 days). Used only to get a new access token
  when it expires. The token hash is stored in the `refresh_tokens` table.

Both cookies are `httpOnly` (JavaScript cannot read them) and `Secure` in production.

**TOTP (two-factor auth)** is implemented but the settings UI is not yet wired up. The
backend stores an encrypted TOTP secret in `users.totp_secret`.

**Password hashing** uses Argon2 via `argon2-cffi`. Never store or compare plain passwords.

---

## Database access

All queries use **SQLAlchemy with async sessions**. The pattern:

```python
# In a route file
async def my_route(db: AsyncSession = Depends(get_db), user: User = Depends(current_user)):
    result = await db.execute(select(CalendarEvent).where(CalendarEvent.user_id == user.id))
    events = result.scalars().all()
    return events
```

`get_db` is a FastAPI dependency in `dependencies.py` that yields an `AsyncSession` and
commits/rolls back automatically. Never manually manage transactions in route functions.

---

## Config and environment variables

`config.py` uses Pydantic Settings to read environment variables. In production, it asserts:
- `JWT_SECRET_KEY` is non-default and ≥ 32 characters.
- `INITIAL_USER_PASSWORD` is not `"changeme"`.
- The database URL is not pointing at localhost defaults.

If any of these fail, the app refuses to start. This prevents accidentally running prod with
dev defaults.

**MinIO (file storage):** `MINIO_ENDPOINT` (bare `host:port` or a URL — the
client strips the scheme and derives TLS from it), plus credentials read from
`MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` **or** the `MINIO_ROOT_USER`/
`MINIO_ROOT_PASSWORD` names Compose already requires — one pair in `.env`
drives both the server and the client (see history 0032).

---

## Adding a new route

1. Create `routes/<module>.py` with a `router = APIRouter(prefix="/module", tags=["module"])`.
2. Define your Pydantic request/response models in the same file (or a `schemas.py` next to it).
3. Mount the router in `main.py`: `app.include_router(module_router)`.
4. If the feature needs a new table, create an Alembic migration (see below).

---

## Alembic migrations

Migrations are numbered files in `alembic/versions/`. Each one has an `upgrade()` (apply)
and `downgrade()` (undo) function.

```bash
# Apply all pending migrations
cd apps/api && uv run alembic upgrade head

# Create a new migration after changing models.py
cd apps/api && uv run alembic revision --autogenerate -m "describe_change"

# Check current migration status
cd apps/api && uv run alembic current
```

**Never edit an existing migration file** that has already been applied to any database.
Always create a new migration for changes.

---

## Production notes

The app runs behind nginx on the VPS. Traefik handles TLS. The URL is `brain.zero-five.space`.

All infra tasks (fail2ban, Traefik HSTS, backups, Tailscale) require explicit owner approval
before being applied — see `docs/history/0006-production-deploy-hardening.md`.
