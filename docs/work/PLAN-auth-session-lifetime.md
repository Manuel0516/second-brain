# Plan: Keep authenticated sessions active for at least one day

Status: implemented 2026-07-24 — see `docs/history/0160-day-long-auth-session-continuity.md`

Date: 2026-07-24

## Summary

Make the signed-in experience persist through normal overnight use without weakening the
existing refresh-token model:

- Access JWT and cookie lifetime: **24 hours**.
- Refresh JWT, cookie, and database-row lifetime: keep the existing **30 days**.
- On startup, use a valid refresh cookie when the access cookie has expired.
- Deduplicate concurrent refresh attempts and remove the hard-coded 14-minute timer.

The refresh cookie already lasts 30 days. The current short-session behavior occurs because
`AuthContext` probes `/api/auth/me`, treats its expired-access 401 as logged out, and never
tries `/api/auth/refresh` during startup.

## Backend and cookie configuration

- Change the default `jwt_access_token_expire_minutes` from `15` to `1440`.
- Change the Compose fallback `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` from `15` to `1440`.
- Keep `JWT_REFRESH_TOKEN_EXPIRE_DAYS` at `30` and preserve environment overrides.
- Continue setting both cookies as `HttpOnly`, `SameSite=Strict`, and `Secure` in
  production.
- Keep refresh-token hashing, database revocation, rotation, and sliding 30-day expiry
  unchanged.
- Keep access and refresh cookie `max_age` aligned with their JWT expiry.
- No migration is required.

The 24-hour access token is a deliberate self-hosted single-user convenience/security
tradeoff. Do not extend it beyond 24 hours in this batch; the refresh token already provides
longer continuity with revocation.

## Frontend refresh lifecycle

Expose one shared refresh function from the API client and guard it with a module-level
in-flight promise:

- Concurrent 401 responses share one `/api/auth/refresh` request.
- On success, each original non-auth request retries once.
- On failure, clear the in-flight promise and redirect protected requests to Login.
- Never refresh recursively for login/refresh endpoints.

Update `AuthContext` startup:

1. Request `/api/auth/me`.
2. If it succeeds, populate auth state.
3. If it returns 401, call the shared refresh function once.
4. On refresh success, retry `/api/auth/me` and populate auth state.
5. Only show Login when refresh is absent, expired/revoked, or the retried probe fails.

Delete the hard-coded 14-minute interval. Normal data requests already refresh on access
401, and startup now covers returning after the access cookie expires.

For Logout, if the access cookie expired immediately before the action, refresh once and
retry `/api/auth/logout` so the active refresh-token rows are revoked before clearing local
auth state. Logout remains best-effort only after both attempts fail.

No credential or token may be exposed to JavaScript storage; cookies remain HTTP-only.

## Public interfaces and documentation

- The frontend API helper gains one exported refresh function; no HTTP endpoint changes.
- Update `docs/product/AUTH_AND_SECURITY.md` and `docs/architecture/BACKEND.md` to state the
  24-hour access and 30-day rotating refresh lifetimes.
- Document the environment override names and the reason the proactive timer was removed.

## Tests and acceptance

Backend tests must assert:

- Login and refresh access cookies have approximately `86400` seconds of `Max-Age`.
- Refresh cookies remain approximately `2592000` seconds.
- JWT expiry matches cookie lifetime.
- Refresh rotation and logout revocation still pass.

Frontend tests must assert:

- Valid access authenticates without refresh.
- Expired access plus valid refresh authenticates after one refresh/retry.
- Expired/revoked refresh ends at Login.
- Concurrent protected 401s produce one refresh call and retry each request once.
- Refresh failure does not loop.
- Logout with expired access refreshes, retries logout, and clears auth state.

Manual acceptance:

- Sign in, close the browser overnight, reopen within 24 hours, and remain signed in.
- Return after the access cookie expires but before 30 days and remain signed in through
  refresh.
- Revoke/logout and confirm the refresh cookie cannot restore the session.
- Verify cookie flags and lifetimes in production-like HTTPS.
- Run root `npm run check`.
- Add the required production history entry and changelog row.
