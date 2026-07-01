# 0002 — Phase 0B (auth) + Phase 1 (calendar MVP)

Date: 2026-06-27
Status: accepted

## What changed

Implemented the full authentication system and the first version of the calendar, making
the app functional end-to-end for the first time.

## Why

Phase 0 (foundation) provided infrastructure only. Phase 0B added the ability to log in
securely. Phase 1 added the calendar as the main view — the core of the product.

## Files touched

**Backend:**
- `apps/api/app/security.py` — Argon2 password hashing, JWT creation and validation
- `apps/api/app/dependencies.py` — `current_user()` FastAPI dependency (validates JWT cookie)
- `apps/api/app/routes/auth.py` — POST /login, POST /logout, POST /refresh, GET /me, TOTP
- `apps/api/app/routes/calendar.py` — GET /calendars, GET /events (initial read-only)
- `apps/api/app/models.py` — User, LoginAttempt, RefreshToken, Calendar, CalendarEvent
- `apps/api/app/config.py` — environment config with Pydantic Settings
- `apps/api/app/main.py` — FastAPI app creation, route registration, lifespan handler
- `apps/api/alembic/versions/001_initial_schema.py` — initial DB migration

**Frontend:**
- `apps/web/src/lib/api.ts` — typed fetch wrapper, handles 401 redirect
- `apps/web/src/context/AuthContext.tsx` — global auth state (user, login, logout)
- `apps/web/src/pages/Login.tsx` — login form with optional TOTP step
- `apps/web/src/pages/Calendar.tsx` — calendar page shell
- `apps/web/src/modules/calendar/MonthView.tsx` — month grid (initial)
- `apps/web/src/modules/calendar/Sidebar.tsx` — calendar list with visibility toggles
- `apps/web/src/modules/calendar/EventDetail.tsx` — event detail panel (initial)
- `apps/web/src/components/ProtectedRoute.tsx` — redirects unauthenticated users
- `apps/web/src/App.tsx` — router with protected routes

## How the pieces connect

Login flow: `Login.tsx` → `POST /api/auth/login` → FastAPI sets httpOnly cookies
(`sb_access` JWT + `sb_refresh` opaque token) → `AuthContext` updates → `ProtectedRoute`
allows navigation to `/calendar`.

Every subsequent API call: `api.ts` sends credentials → FastAPI → `current_user()` in
`dependencies.py` reads `sb_access` cookie → decodes JWT → looks up user in DB →
returns `User` object to the route handler.

Token refresh: when `api.ts` receives a 401, it calls `POST /api/auth/refresh` with the
`sb_refresh` cookie → FastAPI validates the token hash in the `refresh_tokens` table →
issues new `sb_access` cookie → retries the original request.

## How to modify this later

- **Change JWT expiry:** `config.py → ACCESS_TOKEN_EXPIRE_MINUTES`.
- **Add a new protected route:** wrap it in `<ProtectedRoute>` in `App.tsx`.
- **Add a new API call:** add a typed function to `lib/api.ts` following the existing pattern.
- **Disable TOTP:** remove `totp_secret` check in `routes/auth.py → login()`.
- **Add a new user field:** add column to `User` model in `models.py`, create an Alembic
  migration, update the response Pydantic model in `routes/auth.py`.
