# Plan: Repair and clarify the TOTP login flow

Status: ready for immediate implementation

Date: 2026-07-24

## Summary

Fix UX-001 so TOTP-enabled users can sign in. This is a frontend state-flow bug; the API
contract remains unchanged.

## Changes

- In `Login.tsx`, do not clear the password when the first request returns
  `totp_required`.
- Retain email/password only in React component memory. Never write either credential or the
  TOTP code to local/session storage.
- Focus and select the TOTP input when the challenge step appears.
- On an invalid TOTP code, clear only the code and keep the verified credentials available
  for retry.
- Clear all credential state immediately after successful authentication and on component
  unmount.
- Give the error container `role="alert"` and the loading/success change an appropriate
  `aria-live` status without announcing decorative spinner/check content.
- Disable duplicate submission while a request is active.
- Preserve the existing 450ms success transition and current visual composition.

No backend, schema, route, or public type changes are required.

## Tests and acceptance

Add a focused Login test that mocks `useAuth` and proves:

- First submit sends email/password.
- TOTP step retains the password internally and focuses the code input.
- Second submit sends email/password/code.
- Invalid code permits retry without re-entering password.
- Success clears secrets and navigates.
- Error/status semantics are present.

Manually verify password-only login, TOTP login, invalid password, invalid code, rate-limit
error, keyboard-only operation, and 390px layout.

Run root `npm run check` and add the required production history entry/changelog row.
