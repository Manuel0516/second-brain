# 0164 — Modal focus management and dirty-form dismissal guards

Date: 2026-07-24
Status: accepted

## What changed

Added a shared `useDialogFocus` hook (`apps/web/src/components/useDialogFocus.ts`) and wired
it into the three modal-shaped components in the app: `ConfirmDialog`, `LogPastModal`, and
`MealLogModal`. On open, the hook focuses a caller-specified control (or the first focusable
element), traps `Tab`/`Shift+Tab` inside the dialog, locks `document.body` scrolling, and — on
close — restores focus to whatever had focus before the dialog opened. `Escape` no longer
closes anything directly; it calls the caller's `onEscape`, so each dialog decides its own
close policy. The focusable-element scan explicitly excludes `[hidden]` elements (both
`LogPastModal` and `MealLogModal` render hidden `<input type="file">` elements that would
otherwise wrongly capture initial focus).

`ConfirmDialog` gained React-generated `aria-labelledby`/`aria-describedby` (replacing a
hardcoded `id`), a new optional `cancelLabel` prop (default `"Cancel"`, so existing callers are
unaffected), and focuses **Cancel** first when `danger` and the confirm action first otherwise.

`LogPastModal` and `MealLogModal` each gained:
- A labelled dialog (`aria-labelledby`, plus `aria-describedby` for Food) instead of a bare
  `aria-label`.
- A dirty-tracking baseline snapshotted the moment the modal opens — for Fitness: session
  type/date/notes/exercises (including sets); for Food: the editable fields, meal type, date,
  photo IDs, and AI items. Uploaded photo IDs count toward Food's dirty check even though the
  upload already reached the backend, per the plan.
- A `requestClose()` gate used by Escape, backdrop click, and the header close button: no-op
  while busy (submitting/saving/uploading/analyzing), close immediately when clean, otherwise
  open a nested `ConfirmDialog` ("Discard changes" / "Keep editing"). A successful save still
  calls `onClose()` directly, bypassing the dirty prompt.
- Camera stream cleanup in `MealLogModal` was already keyed off the `open` prop transitioning
  to `false`, which still only happens after a confirmed close — no change needed there.

## Why

UX-006 in `docs/work/UX-AUDIT.md`: none of the three dialogs moved focus in, trapped it, or
restored it, and Fitness/Food could silently discard entered data (or in Food's case, already-
uploaded photos) on a stray Escape or backdrop click. See
`docs/work/PLAN-dialog-focus-and-dirty-dismissal.md`.

## Files touched

- `apps/web/src/components/useDialogFocus.ts` — new shared hook.
- `apps/web/src/components/ConfirmDialog.tsx` — unique labelling ids, `cancelLabel` prop,
  danger-aware initial focus, wired to the shared hook.
- `apps/web/src/modules/fitness/LogPastModal.tsx` — labelled dialog, dirty baseline (returned
  from a refactored, non-duplicated reset path), `requestClose`, nested `ConfirmDialog`.
- `apps/web/src/modules/fitness/LogPastModal.test.tsx` — added a "focus and dismissal" describe
  block: initial focus + labelling, Tab trap, clean Escape close, dirty Escape → confirm →
  Keep editing / Discard changes, busy-blocks-close, opener focus restoration.
- `apps/web/src/modules/food/MealLogModal.tsx` — same pattern; `applyReset` now returns the
  snapshot it applied so the dirty baseline can't drift from what was actually set.
- `apps/web/src/modules/food/MealLogModal.test.tsx` — matching "focus and dismissal" block plus
  a photo-upload-counts-as-dirty test and a successful-save-skips-the-prompt test.

## How the pieces connect

`useDialogFocus` takes `open`, a `dialogRef`, an optional `initialFocusRef`, and an `onEscape`
callback; it stores `onEscape` in a ref (updated in its own effect, never mutated during
render) so the single `[open]`-keyed effect doesn't need to restart every render just because
the caller passed a fresh closure. Each consumer calls the hook unconditionally before any
early `if (!open) return null`, since hooks can't follow a conditional return. Dirty-checking
in both modals works the same way: a `DraftSnapshot`/`DirtySnapshot` object is captured by the
same code path that resets the form (`applyReset` in Food; the same inline block in Fitness),
so the baseline can never disagree with what the form was actually reset to, and
`isDirty()` just does a `JSON.stringify` comparison against the live values.

## How to modify this later

Any new modal-shaped component should call `useDialogFocus` the same way: hook call before the
`if (!open) return null` guard, `dialogRef` on the actual dialog panel (not the backdrop), and
route Escape/backdrop/close-button through one `requestClose()`-style gate rather than calling
`onClose` directly in three places. If a future dialog needs a dirty check, follow the
`DraftSnapshot` pattern — snapshot from the same function that resets the form, not a second
independent computation, or the baseline can drift from reality.
