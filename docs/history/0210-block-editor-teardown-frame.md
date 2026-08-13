# 0210 — BlockEditor teardown drain: wait a full animation frame

Date: 2026-08-13
Status: accepted

## What changed

`apps/web/src/setupTests.ts` now waits **40 ms** (a full animation frame) after React
cleanup instead of a single `setTimeout(0)` macrotask.

## Why

The flaky CI failure from 0206 returned: the full suite would occasionally report one
unhandled error originating in `BlockEditor.test.tsx` ("document is not defined") even
though all 156 tests passed — which fails the CI `npm run check` step and blocks the
deploy pipeline (`workflow_run` waits for CI success). Root cause: ProseMirror's
DOMObserver can flush on a *later* macrotask than the first one (a `requestAnimationFrame`
tick, ~16 ms). The old drain finished before that callback ran, so under CI load JSDOM
teared the document down mid-flush. A 40 ms drain covers the rAF path deterministically.

## Files touched

- `apps/web/src/setupTests.ts` — drain `setTimeout(resolve, 0)` → `setTimeout(resolve, 40)`.

## How the pieces connect

Same lifecycle boundary as 0206: shared teardown runs after every test; the drain lets
queued ProseMirror DOM work finish while the JSDOM document still exists. Serial test
files (`vite.config.ts` `fileParallelism: false`) remain the second half of the guard.

## How to modify this later

Keep the drain in shared teardown. If a future editor schedules cleanup work on timers
longer than ~40 ms, raise the value rather than adding per-test sleeps. Verified stable:
3 consecutive full-suite runs (156 tests each) pass with the 40 ms drain.
