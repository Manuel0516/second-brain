# 0076 — Cardio LogPast modal support + updateSetEntry cardio fields

Date: 2026-07-05
Status: accepted

## What changed
- Added `distance_km` and `duration_min` to the `updateSetEntry` payload type in `api.ts` so cardio sets can be edited after save without silently dropping cardio values.
- Added cardio support to `LogPastModal.tsx`: when an exercise row is cardio (detected via `isCardioName` or the matched exercise's `category`), the row renders `distance_km` (km) and `duration_min` (min) inputs instead of `weight` (kg) and `reps`.
- On save, cardio rows send `distance_km` and `duration_min` to `createSetEntry` instead of `reps`/`weight`.
- Grid header changed from "Reps" / "Weight" to generic "Val 1" / "Val 2" since rows can be mixed (strength + cardio in one past workout).
- Added per-row inline labels ("reps"/"kg" for strength, "min"/"km" for cardio) next to each value input.
- Added `.fit-logpast-val` CSS class in `fitness.css` for the value input wrappers (extracted from inline styles).

## Why
- `updateSetEntry` was missing cardio fields, so editing a cardio set after save silently dropped `distance_km` and `duration_min`. The backend PATCH endpoint already accepted these fields.
- `LogPastModal` had no way to log past cardio workouts — it only rendered kg/reps inputs. Users needed to log distance + duration for cardio exercises.

## Files touched
- `apps/web/src/modules/fitness/api.ts` — added `distance_km?: number | null` and `duration_min?: number | null` to `updateSetEntry`'s data parameter type (lines 219-220).
- `apps/web/src/modules/fitness/LogPastModal.tsx` — imported `isCardioName`; added `distance_km`/`duration_min` to `ExerciseRow` interface; updated initial state, `addRow`, and reset form; added cardio detection per row (`rowIsCardio`); conditional rendering of km/min vs kg/reps inputs with inline labels; conditional `createSetEntry` payload for cardio vs strength rows; changed grid header to generic "Val 1"/"Val 2".
- `apps/web/src/modules/fitness/fitness.css` — added `.fit-logpast-val` class for the value input wrapper styling (flex row with background, border, border-radius matching the previous inline weight-wrapper style).

## How the pieces connect
- `LogPastModal` uses `isCardioName()` from `exerciseLibrary.tsx` (which checks against the hardcoded `EXERCISE_LIBRARY.Cardio` set) plus the matched exercise's `category` field from the DB to determine if a row is cardio.
- For cardio rows, the modal renders `duration_min` (step 0.1) and `distance_km` (step 0.01) inputs matching the precision used in `LiveSession.tsx`.
- On submit, cardio rows call `createSetEntry` with `distance_km` and `duration_min` (parsed as floats), while strength rows continue to send `reps` (int) and `weight` (int).
- `updateSetEntry` now passes `distance_km` and `duration_min` through to the backend PATCH endpoint, which already accepted them via `SetEntryPatch` in `fitness.py`.

## How to modify this later
- To add a new exercise category with different value fields: add the fields to `ExerciseRow`, add detection logic in the row render (similar to `rowIsCardio`), add the conditional JSX branch, and update `handleSubmit` to send the right payload.
- The cardio detection uses two sources: `matched?.category === 'cardio'` (from DB) and `isCardioName(row.name)` (heuristic for new exercises not yet in DB). If the heuristic set in `exerciseLibrary.tsx` changes, this will automatically pick it up.
- The `.fit-logpast-val` CSS class is shared by both strength and cardio value wrappers — if the styling needs to differ per category, add a modifier class.