# Plan: Make Fitness History editing coherent and safe

Status: ready for implementation — first Fitness remediation batch

Date: 2026-07-24

## Summary

Fix UX-002 and UX-003 without changing the Fitness API. Make completed-session editing
consistently autosave and replace the misleading **Save workout / Cancel** model with clear
save status and **Done**. Add confirmation before deleting a completed workout.

This batch owns `SessionForm.tsx`, its focused test, and the related History rules in
`fitness.css`. Reuse `ConfirmDialog`; do not redesign live or past-session logging here.

## Behavior changes

- Keep existing immediate set persistence on blur/click.
- Autosave session date, type, and workout note using the existing partial
  `updateSession()` API:
  - Date and type save on blur when changed and valid.
  - Note saves on blur when changed.
  - Do not send unchanged fields.
- Replace the single `busy` ambiguity for session metadata with a small explicit state:
  `idle | saving | saved | error`.
- Show one `role="status"` line in the editor: **Saving…** then **Saved**. Errors use the
  existing alert and keep the editor open.
- Replace **Save workout** and **Cancel** with **Done**. Done closes only when no save is
  running and no save error remains. It does not issue a second save.
- When a set operation is in progress, disable only the affected control/action rather than
  unrelated session fields.
- Pressing **Delete** on a session opens `ConfirmDialog` with the workout type and formatted
  date. Confirm calls the existing delete API once; Cancel changes nothing.
- Keep all unsaved text in the editor after a failed request so the user can blur/retry.

No public API, schema, or type changes are required.

## Hierarchy and responsive details

- Session type remains the 13–14px primary row label.
- Date and save state remain mono metadata.
- Set input text stays 16px on mobile to prevent iOS zoom; do not treat it as display
  typography.
- Remove redundant action width or padding only where needed to fit **Done** and status at
  390px; keep established tokens and 44px mobile action targets.
- Do not change set-card order in this batch; that belongs to the next Fitness plan.

## Tests and acceptance

Extend `SessionForm.test.tsx` to prove:

- Blurring changed date/type/note sends only the changed session field.
- Unchanged blur makes no request.
- Saving and saved feedback uses status semantics.
- Done cannot close while saving or after an error.
- Set edits still persist through their existing paths and no Cancel affordance remains.
- Delete requires confirmation, Cancel preserves the row, Confirm deletes once, and failure
  preserves the row with an alert.

Manual acceptance at desktop and 390px:

- Edit every session and set field, leave and reopen, and observe consistent persistence.
- Simulate a failed request and confirm typed content remains.
- Confirm keyboard focus and screen-reader announcements.
- Run root `npm run check`.
- Add the required production history entry and changelog row.
