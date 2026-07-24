# 0166 — Verify and cover the single authenticated-session SettingsProvider

Date: 2026-07-24
Status: accepted

## What changed

No production code changed. `apps/web/src/App.tsx` already mounted exactly one
`SettingsProvider`, wrapping the shared parent `<Route>` element that every protected module
(`/calendar`, `/notes`, `/fitness`, `/food`, `/settings/*`) nests under via `<Outlet />` —
confirmed by grep (`SettingsProvider` appears in exactly one place outside its own definition)
and by reading the route tree directly. `/login` and the root redirect sit outside that route,
so they never mount it. `ProtectedRoute` renders `<Navigate to="/login" />` instead of
`children` once `isAuthenticated` goes false, which unmounts `SettingsProvider` on logout.

What was actually missing was the test coverage the plan asked for, so `App.test.tsx` gained:
- Authenticated entry fetches `/api/settings` exactly once.
- Login does not fetch authenticated settings.
- Navigating between two protected routes under the shared layout Route (`/settings/general` →
  `/settings/food`, driven via `history.pushState` + a `popstate` dispatch) does not refetch,
  and a distinctive backend value (`theme: 'dark'`) survives the navigation instead of resetting
  to the frontend default — proof the context instance wasn't torn down.
- Logout unmounts settings state (no further fetch while logged out).
- A later login (through the real `Login` form) fetches a fresh copy.

## Why

UX-009 in `docs/work/UX-AUDIT.md` described "every route mounts its own SettingsProvider." That
was true when the audit was written; a prior visual-style/session-continuity pass
(`docs/history/0159-neon-monochrome-visual-style.md`, `0160-day-long-auth-session-continuity.md`)
already restructured `App.tsx` to the single-provider shape while addressing a related concern,
without a regression test proving it. See `docs/work/PLAN-settings-state-lifecycle.md`.

## Files touched

- `apps/web/src/App.test.tsx` — five new tests (listed above). Also stubs `window.matchMedia`
  and `window.localStorage` per test (re-stubbed in `beforeEach`, since the prior test's
  `vi.restoreAllMocks()` would otherwise reset a `vi.fn()`-backed `vi.stubGlobal` to a no-op) —
  `SettingsLayout` reads `matchMedia` and `Calendar` reads `localStorage` at mount, and neither
  exists in this vitest/jsdom run without a stub.

## How the pieces connect

The single mount point works because React Router's nested `<Route>` matching reuses a parent
route element across navigations between its own child routes — only the matched child inside
`<Outlet />` swaps, so `SettingsProvider` (declared once, above the `<Outlet />`) is never
remounted by Calendar↔Notes↔Fitness↔Food↔Settings navigation. The test picks
`/settings/general` ↔ `/settings/food` as a representative pair (both cheap to render, no
extra per-module API mocking needed) rather than driving through Calendar or Notes, which have
their own heavier data-fetching surfaces unrelated to this plan.

## How to modify this later

If a future change adds a new protected top-level route, add it as a sibling under the same
parent `<Route element={<ProtectedRoute><SettingsProvider>...}>` in `App.tsx` — do not add a
second `<SettingsProvider>` anywhere else, or UX-009 regresses. `grep -rn SettingsProvider
apps/web/src` should always return exactly one JSX usage.
