# 0097 — BlockEditor destroys TipTap editor on unmount

Date: 2026-07-06
Status: accepted

## What changed
Added an explicit cleanup effect in `BlockEditor` that destroys the TipTap editor when the component unmounts.

## Why
The GitHub check showed unhandled `document is not defined` errors from ProseMirror timers firing after the test DOM had gone away. Destroying the editor on unmount stops those timers at the source.

## Files touched
- `apps/web/src/modules/notes/editor/BlockEditor.tsx` — added a `useEffect` cleanup that calls `editor?.destroy()` when the component unmounts.

## How the pieces connect
`useEditor()` creates the underlying ProseMirror `EditorView`, which starts DOM-observer work while mounted. If the component disappears without an explicit destroy, that observer can keep running long enough to touch `document` after Vitest has torn down the DOM. The cleanup effect closes that loop.

## How to modify this later
If BlockEditor ever needs to preserve editor state across mounts, move the lifecycle control higher up instead of removing the destroy cleanup. Otherwise, keep the `editor?.destroy()` cleanup in place so tests and navigation do not leak editor timers.
