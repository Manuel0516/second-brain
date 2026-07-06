# 0098 — LogPastModal cardio distance comes before time

Date: 2026-07-06
Status: accepted

## What changed
Reordered the cardio inputs in the LogPastModal set card so Distance appears before Time.

## Why
The cardio logging card should read left-to-right as Distance then Time to match the desired workout entry flow and the current visual layout.

## Files touched
- `apps/web/src/modules/fitness/LogPastModal.tsx` — swapped the cardio input order and kept the same cardio update fields.

## How the pieces connect
`LogPastModal.tsx` already branches on cardio vs strength. This change only reorders the two cardio fields; the underlying data fields (`distance_km` and `duration_min`) and the shared card layout stay the same.

## How to modify this later
If the order needs to change again, edit the cardio branch inside the set row render in `apps/web/src/modules/fitness/LogPastModal.tsx`. Keep the update handlers aligned with the label order so the UI doesn’t drift from the saved values.
