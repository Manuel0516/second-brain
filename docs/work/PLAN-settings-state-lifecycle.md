# Plan: Keep one Settings context across authenticated navigation

Status: ready after the visual-style implementation stabilizes

Date: 2026-07-24

## Summary

Resolve UX-009 by mounting one `SettingsProvider` for the authenticated app lifetime instead
of one provider per protected route. This removes repeated settings requests and default-
preference flicker during module navigation.

## Routing change

- In `App.tsx`, build the existing route tree once.
- When authenticated, wrap the protected application route tree in a single
  `SettingsProvider`.
- Remove the duplicate provider wrappers from Calendar, Notes, Fitness, Food, and Settings
  route elements.
- Keep Login and unauthenticated redirects outside the provider so they do not fetch private
  settings.
- Preserve each `ProtectedRoute`, lazy boundary, page transition, and route path.
- Logout unmounts the provider naturally; the next authenticated session performs one fresh
  settings load.
- Do not introduce a new global state dependency or cache library.

The visual-style bootstrap/local-cache policy remains exactly as defined by
`PLAN-visual-style-system.md`; the backend-loaded setting remains authoritative.

No public API, backend, schema, or settings type changes are required.

## Tests and acceptance

Add an App routing test with mocked auth/settings API behavior proving:

- Authenticated entry fetches settings once.
- Navigation Calendar → Notes → Fitness → Food → Settings does not refetch or reset context.
- Login does not fetch authenticated settings.
- Logout unmounts settings state.
- A later login fetches a fresh copy.

Manually throttle the settings request and verify no unit/theme/style/default-view flicker
when navigating protected modules.

Run root `npm run check` and add the required production history entry/changelog row.
