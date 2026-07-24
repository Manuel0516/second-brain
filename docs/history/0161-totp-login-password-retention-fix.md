# 0161 — Fix: TOTP login cleared the password before the second request

Date: 2026-07-24
Status: accepted

## What changed

`Login.tsx` no longer clears the password when the API responds `totp_required`. The
password now stays in component state through the TOTP challenge so the second request
(`email + password + totp_code`) is valid. Added:

- Focus + select the TOTP input when the challenge step appears, and re-focus it after an
  invalid-code error.
- Credential state (`password`, `totp`) clears on successful login and on component unmount;
  it is never written to local/session storage.
- A guard at the top of `handleSubmit` prevents a second submit while a request is in flight
  (the submit button was already disabled during `loading`, this covers the Enter-key path
  too).
- `role="alert"` on the error banner; a visually-hidden `role="status"` region announces
  "Signing in…" / "Signed in, redirecting…"; the decorative spinner and success checkmark are
  `aria-hidden`.

## Why

UX-001 in `docs/work/UX-AUDIT.md`: a TOTP-enabled user could never sign in. The first submit
correctly triggered the TOTP step, but `setPassword('')` on that transition meant the second
submit always sent an empty password, which the API rejects before checking the TOTP code.

## Files touched

- `apps/web/src/pages/Login.tsx` — password retention through the TOTP step, focus
  management, credential-clearing lifecycle, alert/status semantics.
- `apps/web/src/pages/Login.test.tsx` — new focused test covering first submit, password
  retention + focus, invalid-code retry, success clearing/navigation, alert/status regions,
  and duplicate-submit prevention.

## How the pieces connect

`Login.tsx` owns all credential state locally and calls `useAuth().login(email, password,
totp)` from `AuthContext.tsx`, which POSTs to `/api/auth/login`. The API contract is
unchanged — it always expects the same three fields once TOTP is enabled. The fix is entirely
about what the frontend keeps in memory between the two requests.

## How to modify this later

If a future change needs credentials to persist across a page reload during the TOTP step
(currently out of scope and explicitly disallowed by the plan), that requires a
server-side challenge token, not client storage — do not reach for local/session storage for
password/TOTP values.
