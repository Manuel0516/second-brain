# 0105 — LiveSession previous values from workout history

Date: 2026-07-06
Status: accepted

## What changed

Replaced the live session `Previous` placeholder with a lookup built from saved workout history, with exact-exercise matches first and same-category fallback after that.

## Why

Cardio exercises were falling back to `—` because the live session screen only had a static strength-oriented preview string. The UI needed to show the last real set data from history instead.

## Files touched

- `apps/web/src/modules/fitness/Fitness.tsx` — loads saved workout history, builds the previous-performance lookup, and applies it to live sessions.

## How the pieces connect

`Fitness.tsx` already owns the live-session state, so it now fetches completed sessions and their set entries, summarizes the latest exercise data, and injects that summary into the active session before rendering `LiveSession`. If an exercise name has no exact history yet, the code falls back to the latest exercise of the same category, which is what makes cardio work.

## How to modify this later

If the history summary format changes, update the helper functions in `apps/web/src/modules/fitness/Fitness.tsx`. If the session endpoint needs a different history window, change the `fetchSessions(..., 'completed')` call there. Keep `LiveSession.tsx` dumb; it should only render the `prev` string it receives.
