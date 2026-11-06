# 0272 — Readable login validation errors

Date: 2026-11-06
Status: accepted

## What changed
Login now uses the existing API error-message helper for FastAPI validation errors,
plain-text authentication errors, and unexpected error bodies. The existing TOTP
challenge is preserved. Login help text clarifies that authenticator codes are only
requested when two-factor authentication is enabled. The isolated Wardrobe development
account email was corrected from a reserved `.test` domain to `wardrobe@example.com`.

## Why
The supplied development email was rejected by the API's EmailStr validator. The
frontend converted the resulting validation array to `[object Object]`, obscuring
why the account could not sign in. Static authenticator help text also appeared to
be a challenge even though this account has no TOTP configured.

## Files touched
- `apps/web/src/context/AuthContext.tsx` — parse login failures through `apiErrorMessage` while preserving TOTP handling.
- `apps/web/src/context/AuthContext.test.tsx` — cover validation arrays, string errors, TOTP challenges, and unexpected error objects.
- `apps/web/src/pages/Login.tsx` — clarify existing authenticator help text.
- `docs/history/CHANGELOG.md` — index this fix.

The ignored `.dev/wardrobe-test.env` and its isolated database account were also
corrected. Production accounts, passwords, and two-factor settings were not modified.

## How the pieces connect
Login submits through AuthContext and the existing same-origin API client. When the
API returns an error, AuthContext checks a cloned response for the specific TOTP
challenge, then passes the original response to the shared error helper. The helper
extracts a readable FastAPI validation message or a safe fallback, which the existing
login alert displays. Successful authentication is unchanged.

## How to modify this later
Keep login error formatting in the shared `lib/api.ts` helper; do not pass structured
`detail` objects directly to Error. Preserve the distinct `TOTP code required` result
when changing authentication. Use validator-compatible emails for seeded development
accounts. Run `npm run check` after changes. The running isolated test account was
verified by an HTTP 200 login and authenticated Wardrobe request, with TOTP disabled.

Verification: `npm run check` passed with 183 frontend tests and 213 API tests.
