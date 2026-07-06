# 0135 — Opening any note crashed the whole app (Tiptap view not mounted)

Date: 2026-07-06
Status: accepted

## What changed

`useEditor()` in `BlockEditor.tsx` now passes `immediatelyRender: true`. Also hardened the
column-drag-preview effect to bail out if the editor is already destroyed.

## Why

User report: opening any note crashed the entire UI (no error boundary exists anywhere in the
app, so one uncaught render error blanks the whole React tree, not just the notes pane). Browser
console confirmed the exact cause:

```
Uncaught Error: [tiptap error]: The editor view is not available. Cannot access view['dom'].
The editor may not be mounted yet.
  at BlockEditor.tsx:755
```

Tiptap v3 (this project uses `@tiptap/*` `^3.27.1`) changed `useEditor`'s default: `immediatelyRender`
is now `false` unless set explicitly, so the ProseMirror `EditorView` is created asynchronously
after mount instead of synchronously during it — a deliberate change to avoid SSR hydration
mismatches. This app is Vite/CSR-only (no SSR), so that default bought nothing but broke every
effect that reads `editor.view` as soon as `editor` is truthy — including the column-drag-preview
effect (`BlockEditor.tsx` ~753), which ran on every mount and threw before the view existed.

## Files touched

- `apps/web/src/modules/notes/editor/BlockEditor.tsx` — added `immediatelyRender: true` to the
  `useEditor()` config (restores the pre-v3 synchronous-view-creation behavior, which is correct
  here since there's no SSR to protect against). Also added an `editor.isDestroyed` check to the
  column-drag-preview effect's guard, so a race during fast note-switching can't hit the same
  class of error again.

## How the pieces connect

`useEditor` is called once per `BlockEditor` instance; every effect in that component that
touches `editor.view` (drag-preview, slash/mention popover positioning, etc.) implicitly assumed
the view exists once `editor` is non-null — true before Tiptap v3, no longer true by default.
Setting `immediatelyRender: true` restores that invariant app-wide for this component instead of
guarding each individual effect.

## How to modify this later

- If this app ever adds SSR, `immediatelyRender: true` would need to come back off, and every
  effect touching `editor.view` would need its own `editor.isInitialized`/`isDestroyed` guard
  instead.
- No error boundary exists anywhere in the app — any future uncaught render error (in any
  component) will still blank the entire UI, not just the offending panel. Worth adding a
  top-level `ErrorBoundary` around routed pages if this class of bug recurs elsewhere; skipped
  here since the user's ask was this specific crash, not defensive infrastructure.
