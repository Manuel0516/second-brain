# 0206 — BlockEditor test teardown stability

Date: 2026-08-12
Status: accepted

## What changed

The shared web test teardown now waits one macrotask after React cleanup, and Vitest runs test
files serially so queued ProseMirror DOM-observer work cannot race another JSDOM environment.

## Why

The full test suite could report `ReferenceError: document is not defined` from a delayed
ProseMirror observer callback even though the BlockEditor tests themselves had passed.

## Files touched

- `apps/web/src/setupTests.ts` — drains one queued DOM-observer task after cleanup.
- `apps/web/vite.config.ts` — disables file-level parallelism for the browser-editor test suite.

## How the pieces connect

All Vitest files use this setup file. React cleanup destroys the editor, and the short async
drain gives ProseMirror time to finish its browser-style observer callback before the test
environment is torn down. Serial test files prevent the JSDOM globals from being reused while
that callback is pending.

## How to modify this later

Keep the drain in shared teardown if another browser editor adds delayed cleanup work. Avoid
adding arbitrary sleeps to individual BlockEditor tests; the lifecycle boundary belongs here.
