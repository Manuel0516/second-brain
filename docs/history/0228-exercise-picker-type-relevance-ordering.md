# 0228 — Exercise picker ordering by session-type relevance, not just category

Date: 2026-08-15
Status: accepted

## What changed

`mergeExerciseCandidates` (`exerciseLibrary.tsx`) previously bucketed saved DB exercises into
"primary" vs "rest" by matching `exercise.category` against the session type's usual category
(`cardio` for a Cardio session, `strength` for everything else). That meant a Legs session
put every saved strength exercise first — Bench Press and Pull-ups included — with no
preference for actual leg exercises, since category alone can't tell Legs apart from Push/Pull/
Upper. It now buckets by whether the saved exercise's name matches that session type's curated
list (`EXERCISE_LIBRARY[sessionType]`, e.g. Squat/Leg Press/Leg Curl for Legs) instead of by
category. Session-relevant saved exercises surface first, and every other saved exercise —
any category, any session type — still follows below rather than being hidden.

## Why

User request, live workout session: picking "add exercise" during a Legs session should
surface saved leg exercises first, with the rest of the saved library (strength and cardio)
still reachable below rather than interleaved by category alone.

## Files touched

- `apps/web/src/modules/fitness/exerciseLibrary.tsx` — `mergeExerciseCandidates` now checks
  saved exercise names against `EXERCISE_LIBRARY[sessionType]` (case-insensitive) to decide
  the primary bucket, instead of comparing `exercise.category` to the session type's usual
  category. Updated the function's doc comment to match.

## How the pieces connect

`mergeExerciseCandidates` is the single shared source for both `LiveSession.tsx`'s in-session
add-exercise picker and `SessionWizard.tsx`'s pre-session picker — this ordering fix applies to
both automatically.

## How to modify this later

- The relevance signal is still just a name match against `EXERCISE_LIBRARY`'s curated list
  per session type — a saved exercise with a name that doesn't appear in that list (e.g. a
  custom "Bulgarian Lunges") won't be recognized as leg-relevant even if it obviously is. If
  that becomes a real problem, the fix is adding a muscle-group/tag field to the `Exercise`
  model (`apps/api/app/models.py`) rather than growing the name-matching heuristic further.
