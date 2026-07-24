# 0160 — Day-long auth session continuity

Date: 2026-07-24
Status: accepted

## What changed

The default access-token and access-cookie lifetime is now 24 hours while refresh tokens
remain valid for 30 days. The frontend now shares one refresh request between concurrent
callers, restores a session on startup by refreshing and retrying `/api/auth/me` once, and
refreshes before retrying logout when the access token has expired. The old fixed 14-minute
refresh timer was removed.

## Why

Short access cookies made the app appear logged out after ordinary periods of inactivity,
even while a valid refresh token was available. A day-long access session plus reliable
refresh-on-demand keeps the self-hosted app available without weakening refresh-token
rotation or server-side logout revocation.

## Files touched

- `.env.example` — documents the 1,440-minute access-token setting.
- `compose.yaml` — changes the container default access-token lifetime to 1,440 minutes.
- `apps/api/app/config.py` — changes the application default access-token lifetime to 1,440
  minutes.
- `apps/api/tests/test_auth.py` — verifies 24-hour access-cookie and 30-day refresh-cookie
  lifetimes.
- `apps/web/src/lib/api.ts` — provides the shared, deduplicated refresh operation and uses it
  for authenticated request retries.
- `apps/web/src/lib/api.test.ts` — covers refresh deduplication and one-time request retry.
- `apps/web/src/context/AuthContext.tsx` — restores sessions at startup, retries logout after
  refresh, and removes interval-based refresh.
- `apps/web/src/context/AuthContext.test.tsx` — covers startup restoration and logout retry.
- `docs/product/AUTH_AND_SECURITY.md` — records the session-lifetime and retry behavior.
- `docs/architecture/BACKEND.md` — records the actual cookie names and refresh lifecycle.

## How the pieces connect

FastAPI uses the configured lifetime both when signing an access JWT and when setting its
`access_token` cookie. The browser sends that cookie automatically. When it expires,
`refreshAccessToken()` calls the refresh endpoint, which rotates the 30-day refresh token and
sets a new access cookie. Both the generic API client and authentication provider use the
same in-flight promise, preventing simultaneous 401 responses from racing refresh-token
rotation. Startup and logout handle auth-endpoint 401 responses explicitly because generic
auth endpoints intentionally do not auto-refresh.

## How to modify this later

Change `jwt_access_token_expire_minutes` in `apps/api/app/config.py`, the Compose fallback,
and `.env.example` together. Deployment-specific environment values remain authoritative.
Keep startup and logout retries limited to one refresh attempt, and keep refresh requests
deduplicated because every successful refresh revokes and replaces the previous refresh
token. Update the cookie-duration assertions if the defaults change.
