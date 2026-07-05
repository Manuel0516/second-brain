# 0067 — EventEditor fitness type cards + workout-session linking

Date: 2026-07-05
Status: accepted

## What changed

Phase 4 of the fitness-module/calendar overhaul plan (`docs/history/0063-planned-workout-link-rollback.md`
is the redesign context; the parallel backend phases wire the planned-session hook this UI assumes):

- New `SESSION_TYPES` constant (`Push`/`Pull`/`Legs`/`Upper`/`Cardio`/`Custom`), shared groundwork
  for the calendar editor and the rest of the fitness module.
- **Create mode**: the fitness connection card's free-text "Workout type" input is replaced by
  six selectable type cards (single-select); picking "Custom" reveals a small text input for a
  custom type name. The workout-notes textarea is unchanged. Save still writes
  `connections.fitness = { workout_type, notes }` exactly as before — a backend hook (separate
  phase) turns that into a planned workout session.
- **Edit mode**: when the event has a `workout_session` link (from `GET /api/events/{id}/links`)
  or `connections.fitness` is already set, the fitness card's toggle renders ON and disabled,
  with no inner fields — a caption points the user at the Linked section instead.
- The **Linked** section's `event-linked-open` button is now enabled for `target_type ===
  'workout_session'` (previously only `'page'`); clicking it closes the editor and calls the new
  `onOpenFitness(sessionId)` prop, which `Calendar.tsx` wires to `navigate('/fitness?session={id}')`
  — mirroring the existing `onOpenNote` pattern.
- Validation: a type-card selection is required (same underlying `workout_type` check), with the
  message updated to "Select a workout type."; the check is skipped once the fitness card is
  link-managed.
- Two additive fitness API client functions for upcoming phases: `fetchPlannedSessions(status)`
  and `deleteExercise(id)`. Existing `updateSession`/`fetchExerciseStats` already covered the
  PATCH/stats needs and were left untouched.

## Why

The plan calls for six fixed session types everywhere instead of ad-hoc free text, and for the
event editor to become a thin front door to the fitness module once a session exists — editing
exercises/notes moves to the fitness page's own UI rather than being duplicated in the calendar
editor.

## Files touched

- `apps/web/src/modules/fitness/sessionTypes.ts` — new; exports `SESSION_TYPES`/`SessionType`.
- `apps/web/src/modules/calendar/EventEditor.tsx` — replaced the free-text workout-type input
  with the type-card grid + custom-text fallback; added `fitnessLinked` derivation; disabled the
  toggle and hid inner fields when linked; enabled the workout_session link-open button; added
  `onOpenFitness` prop; widened `EventLink.target_type` to include `'workout_session'`.
- `apps/web/src/pages/Calendar.tsx` — passes `onOpenFitness={(id) => navigate('/fitness?session='+id)}`
  to `EventEditor`.
- `apps/web/src/styles.css` — appended `.type-card-grid`/`.type-card` rules (tokens only, no new
  colors/radii) at the end of the file.
- `apps/web/src/modules/fitness/api.ts` — appended `fetchPlannedSessions` and `deleteExercise`
  (existing exports untouched).

## How the pieces connect

`EventEditor` owns the create/edit form; `workoutTypeCard`/`customWorkoutType` local state track
which card (or custom text) is selected, and `set('workout_type', …)` keeps the value that
actually gets persisted in `connections.fitness.workout_type`, unchanged in shape. `fitnessLinked`
gates both the toggle's `disabled` state and which body renders — it reads `eventLinks` (fetched
from `GET /api/events/{id}/links`) plus the initial `event.connections?.fitness`, so a session
created by the (separate) backend hook is picked up automatically. The Linked list's open button
now dispatches to either `onOpenNote` or `onOpenFitness` based on `link.target_type`; `Calendar.tsx`
is the only caller and supplies the navigation side effect via `react-router`'s `useNavigate`,
matching how notes already navigate through `NotesPagePane`/`onOpenFull`.

## How to modify this later

- To change the fixed type list, edit `sessionTypes.ts` only — `EventEditor` re-exports nothing,
  it just imports the constant, so other fitness-module files (SessionWizard, LogPastModal) can
  switch to the same import without touching the editor.
- The "managed from the linked workout" caption and disabled toggle are the intended end state
  per the plan — do not re-add inline exercise/notes editing here; that belongs on the fitness
  page after clicking through.
- If a future backend response nests `workout_session` under a different `target_type` string,
  update the two `=== 'workout_session'` checks in `EventEditor.tsx` (Linked button enable/onClick)
  together — they must stay in sync or the button will render enabled but no-op.
