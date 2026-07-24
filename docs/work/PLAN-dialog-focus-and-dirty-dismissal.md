# Plan: Make dialogs focus-safe and protect dirty forms

Status: ready after the first Fitness logging batches

Date: 2026-07-24

## Summary

Resolve UX-006 across the shared confirmation dialog, Fitness past-workout modal, and Food
meal-log modal. Preserve their current visual patterns while adding correct modal focus,
labelling, scroll containment, focus restoration, and dirty-form dismissal behavior.

No backend or schema changes are required.

## Shared dialog behavior

Create one small reusable dialog-focus hook because three existing dialogs need identical
behavior:

- Receive `open`, a dialog ref, an initial-focus ref, and the opener captured when opening.
- On open, focus the requested control or first focusable element.
- Trap Tab/Shift+Tab within the dialog.
- Escape requests close through the caller's close policy rather than closing directly.
- Restore focus to the opener on close.
- Lock document scrolling while open and restore the prior state on cleanup.
- Do nothing when closed and remain safe under React Strict Mode.

This is a behavior utility, not a new visual component or pattern.

## ConfirmDialog

- Add unique React-generated IDs for title and optional detail; wire
  `aria-labelledby`/`aria-describedby`.
- Focus Cancel first for destructive dialogs and the confirm action first for non-danger
  confirmation.
- Support Escape as Cancel.
- Prevent interaction behind the portal.
- Preserve current props and styling so callers do not change.

## Fitness and Food forms

- Give Fitness a labelled title ID and Food a labelled title/description instead of only a
  generic `aria-label`.
- Track a baseline snapshot when each modal opens. Dirty means any user-editable field,
  exercise/set/photo selection, AI result, date/type, or note differs from that baseline.
- Escape, backdrop, and close-button requests:
  - Close immediately when clean and idle.
  - Do nothing while upload/analyze/save/submit is active.
  - Open `ConfirmDialog` when dirty, with **Discard changes** and **Keep editing**.
- Successful save closes without a dirty prompt.
- For Food, uploaded photo IDs count as dirty even though the upload has already reached the
  backend.
- Camera stream cleanup remains guaranteed on every confirmed close.

## Files and tests

Keep the batch at eight implementation files or fewer:

- One shared focus hook.
- `ConfirmDialog.tsx`.
- `LogPastModal.tsx`.
- `MealLogModal.tsx`.
- Their existing CSS files.
- Focused dialog/meal tests; extend the Fitness modal test created by the prior batch.

Tests must cover focus entry, tab wrapping, Escape policy, focus restoration, clean close,
dirty confirmation, busy dismissal blocking, and successful-save close.

Manually verify nested confirmation above both modals, keyboard-only operation, body scroll,
mobile bottom-sheet dismissal, and camera/upload cleanup.

Run root `npm run check` and add the required production history entry/changelog row.
