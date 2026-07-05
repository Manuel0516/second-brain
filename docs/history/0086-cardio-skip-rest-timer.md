# 0086 — Cardio exercises skip rest timer in live session

Date: 2026-07-06
Status: accepted

## What changed
In `LiveSession.tsx`, `toggleDone` now checks the exercise's category before starting the rest timer. Cardio exercises no longer trigger the rest timer when a set is marked done.

## Why
Cardio exercises (running, swimming, etc.) don't have rest periods between sets the way strength/mobility training does. Starting the rest timer on every completed cardio set was incorrect UX.

## Files touched
- `apps/web/src/modules/fitness/LiveSession.tsx` — `toggleDone` function: added `exercise` variable lookup and `category !== 'cardio'` guard before `startRest()` call

## How the pieces connect
`toggleDone` is called when the user clicks the checkmark on a set row in the live session. It toggles `done` on the set and, if the set was just marked done (not un-done), conditionally starts the rest timer. The rest timer now only starts for `strength` and `mobility` exercises. The exercise category is already part of the session data and was previously used only for rendering (cardio shows distance/duration columns vs weight/reps). This change reuses the same data for timer logic.

## How to modify this later
To add or remove categories that skip the rest timer, change the condition in `LiveSession.tsx` at line 92:
```
if (!set.done && exercise.category !== 'cardio') startRest()
```
For example, to also skip for `mobility`: change to `exercise.category !== 'cardio' && exercise.category !== 'mobility'`. Or to use an allowlist instead of a blocklist, replace with `['strength'].includes(exercise.category)`.