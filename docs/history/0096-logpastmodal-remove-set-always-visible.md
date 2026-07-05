# 0096 — LogPastModal remove set button always visible

Date: 2026-07-06
Status: accepted

## What changed
Changed LogPastModal so every set card shows the remove `×` button, including strength sets. The card stays the same for both exercise types; only the input labels and values change.

## Why
The log workout modal needed one shared card pattern for cardio and strength. Hiding the delete button on some sets made the card feel inconsistent and broke the “same card, different input labels” behavior.

## Files touched
- `apps/web/src/modules/fitness/LogPastModal.tsx` — removed the conditional that only rendered the set delete button when there was more than one set.

## How the pieces connect
`LogPastModal.tsx` already chooses the input pair based on whether the exercise is cardio. By always rendering the delete button, the modal keeps the same row structure for both categories and only swaps the label/content text.

## How to modify this later
If the remove button should be hidden again for single-set exercises, restore the `draft.sets.length > 1` guard around the button in `apps/web/src/modules/fitness/LogPastModal.tsx`. If the modal card layout changes, keep the button placement rules in `fitness.css` aligned with the shared `.fit-history-set` card.
