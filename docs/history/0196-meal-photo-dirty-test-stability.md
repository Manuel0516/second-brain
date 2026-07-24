# 0196 — Stabilize the uploaded-photo dirty-state test

Date: 2026-07-24
Status: accepted

## What changed

The meal-log dismissal test now waits for photo uploading to finish before pressing Escape and
asserting that the uploaded photo triggers the dirty-form confirmation.

## Why

The new thumbnail can render before the upload's final busy-state update is committed. On a
slower GitHub Actions runner, the test pressed Escape during that valid busy window, when the
modal intentionally ignores dismissal, and then incorrectly expected the confirmation dialog.

## Files touched

- `apps/web/src/modules/food/MealLogModal.test.tsx` — waits until the Analyze photos button is
  enabled, which is the user-visible signal that uploading has completed.

## How the pieces connect

`MealLogModal` adds each uploaded photo to `photoFileIds` as soon as its request resolves, then
clears `uploading` in the async cleanup. The thumbnail reflects the first state update, while
the enabled photo actions reflect the completed operation. Dirty-dismissal behavior is only
available after the modal leaves its busy state, so the test now observes that same boundary.

## How to modify this later

If the upload UI changes, wait for another user-visible completed-upload signal before testing
Escape or backdrop dismissal. Do not use thumbnail presence alone because it intentionally
precedes the end of the upload lifecycle.
