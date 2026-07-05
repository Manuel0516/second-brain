# 0088 — ExerciseStats replace window.confirm with ConfirmDialog

Date: 2026-07-06
Status: accepted

## What changed
- Replaced the native `window.confirm('Delete this exercise? This cannot be undone.')` call in `ExerciseStats.tsx` with the project's styled `ConfirmDialog` component.
- Renamed `handleDelete` to `confirmDelete` and removed the `window.confirm` guard — the dialog's `onConfirm` now drives the delete logic.
- The Delete button now opens the dialog via `setConfirmOpen(true)` instead of calling `handleDelete` directly.

## Why
The native browser confirm dialog didn't match the app's visual style. The project already has a `ConfirmDialog` component (`ConfirmDialog.tsx`) with the `.scope-prompt` / `.scope-card` pattern used elsewhere.

## Files touched
- `apps/web/src/modules/fitness/ExerciseStats.tsx` — added `confirmOpen` state, replaced `handleDelete` with `confirmDelete` (no `window.confirm`), wired Delete button to open dialog, added `ConfirmDialog` import and JSX render

## How the pieces connect
1. User clicks "Delete" → `onClick={() => setConfirmOpen(true)}` opens the dialog.
2. `ConfirmDialog` renders a portalled overlay with Cancel/Delete buttons.
3. Cancel → `setConfirmOpen(false)` closes the dialog, no delete.
4. Delete → `confirmDelete()` runs: closes dialog, sets `deleting=true`, calls `deleteExercise(exerciseId)`, closes the panel on success, or sets `deleteError` on failure, then sets `deleting=false` in `finally`.

## How to modify this later
- To change the dialog message/detail: edit the `message` and `detail` props on the `<ConfirmDialog>` element near the end of the component's return.
- To change the confirm label: edit the `confirmLabel` prop.
- To change the Delete button's behavior: find the `<button>` with `onClick={() => setConfirmOpen(true)}` (around line 218) and modify the `onClick` handler.