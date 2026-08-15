# 0227 — Explicit "Save prompt" button + the real fix for the launcher z-index bug

Date: 2026-08-15
Status: accepted

## What changed

**1. Explicit "Save prompt" button.** `SettingsTextField` already auto-committed on blur
(`0226`), but the analysis-prompt textarea had no explicit save affordance next to "Reset
to default." `SettingsTextField` now `forwardRef`s a `{ commit }` handle
(`SettingsTextFieldHandle`), and `FoodSettings.tsx`'s "Save prompt" button calls
`promptFieldRef.current?.commit()` directly — same commit path blur already used, just
also triggerable on demand without needing to click away first.

**2. The launcher-vs-event-editor z-index fix, actually fixed this time.** `0224` lowered
`.assistant-launcher` from `z-index: 80` to `45` on the theory that comparing it against
`.calendar-backdrop`'s `z-index: 50` would settle it — but that comparison only holds if
both elements share the same stacking context, and they didn't. Root cause, confirmed
against this exact codebase's own prior bug fix
(`docs/history/0144-notes-emoji-picker-stacking-context-fix.md`, same bug class): `App.tsx`'s
`PageTransition` wrapper animates `transform/opacity` (`pageEnter`), which — per `0144`'s
confirmed finding — makes it establish its own CSS stacking context. `EventEditor`'s
`.calendar-backdrop` is rendered *inside* that wrapper, so its `z-index: 50` only ranks
within `PageTransition`'s local context; it can never outrank `.assistant-launcher`, a
true sibling of `PageTransition` sitting outside it, no matter what number it's given.

Every *other* overlay in this codebase already sidesteps exactly this trap by rendering via
`createPortal` straight to `document.body` — `ConfirmDialog`, `Popover`,
`EventEditor`'s own "repeat" and "event links" sub-dialogs all do this. `EventEditor`'s
*main* `.calendar-backdrop` wrapper was the one exception, returned inline instead of
portaled. Wrapped its single return statement in `createPortal(..., document.body)`,
matching that established pattern — now it's a true DOM (and stacking) sibling of
`.assistant-launcher`, so `50` vs `45` finally compares directly and correctly.

## Why

Direct user follow-up: the `0224` z-index change didn't actually work, and a "Save" button
was requested alongside the existing "Reset to default."

## Files touched

- `apps/web/src/modules/settings/SettingsTextField.tsx` — `forwardRef` +
  `useImperativeHandle` exposing `commit()`.
- `apps/web/src/modules/settings/FoodSettings.tsx` — ref + "Save prompt" button.
- `apps/web/src/modules/calendar/EventEditor.tsx` — wrapped the component's single return
  value in `createPortal(..., document.body)` (two-line change: the opening `return (` and
  the closing `)` before the component's final `}`; no internal logic touched).

## How the pieces connect

This is the same bug class as `0144`, in the same trap (`PageTransition`'s animated
wrapper), just manifesting on a different overlay. The fix pattern is different from
`0144`'s, though: `0144` gave the *trapping ancestor* an explicit z-index because that
ancestor's content was meant to always render above its siblings. Here that's not true —
`PageTransition`'s content (ordinary pages) must render *below* the launcher normally, but
the *modal specifically* must render above it — a CSS z-index number on the ancestor can't
express "usually below, sometimes above." Portaling the modal out of the trap is what makes
that conditional relationship possible at all.

## How to modify this later

If a future full-screen overlay is added anywhere under `<PageTransition>` (i.e. inside a
routed page) and needs to render above fixed-position chrome like the assistant launcher,
portal it to `document.body` from the start — don't rely on z-index numbers alone once an
animated ancestor is in the picture. `0144`'s "How to modify this later" note about
checking ancestors for stacking-context triggers still applies generally.
