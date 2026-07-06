# 0139 — Fix leaked tiptap Editor timers in ColumnNodes tests

Date: 2026-07-06
Status: accepted

## What changed

`ColumnNodes.test.ts` created raw `new Editor(...)` instances directly (not via React
`render()`), so they were never destroyed. Their internal ProseMirror view flush timers
kept firing after jsdom tore down between test files, throwing an unhandled
`ReferenceError: document is not defined` that failed the CI test run (and blocked a
`git push`) even though every test file individually reported as passing.

Added an `editors` array + `afterEach(() => editors.splice(0).forEach(e => e.destroy()))`
in the test file itself, mirroring the fix already applied globally for React-mounted
editors in 0135/81d8313.

## Why

0135's global `afterEach(cleanup)` in `setupTests.ts` only unmounts React-rendered
components (via `@testing-library/react`'s `cleanup()`). `ColumnNodes.test.ts` instantiates
`Editor` directly for unit-testing column commands, so that global cleanup never touched
it — same root cause as 0135, different call site.

## Files touched

- `apps/web/src/modules/notes/editor/ColumnNodes.test.ts` — track created editors, destroy
  them in `afterEach`.

## How the pieces connect

Any test file that calls `new Editor(...)` directly (bypassing React) must destroy its own
editors — the global RTL cleanup in `setupTests.ts` has no knowledge of them.

## How to modify this later

If another test file starts constructing a tiptap `Editor` directly, apply the same
pattern (push to a local array, destroy in `afterEach`) rather than adding another global
hook — `setupTests.ts` should stay scoped to what RTL's `cleanup()` can actually reach.
