# 0092 — LogPastModal uses the shared set card layout

Date: 2026-07-06
Status: accepted

## What changed
Changed LogPastModal to use the same shared fitness set card styling as the workout history editor, with a flex-wrapping set list so multiple sets can sit side by side when there is room. Cardio rows still render the cardio badge and use Time + Distance labels.

## Why
The modal set row needed to match the polished history edit card instead of keeping a separate row style. Reusing the shared card makes the workout logger visually consistent and reduces the amount of one-off CSS in the fitness module.

## Files touched
- `apps/web/src/modules/fitness/LogPastModal.tsx` — switched modal set rows from the modal-specific row class to the shared `.fit-history-set` card and reused the shared title-row pattern for the exercise name plus badge.
- `apps/web/src/modules/fitness/fitness.css` — added modal-scoped flex-wrap rules for `.fit-history-set-list` and `.fit-history-set`, then removed the old modal-only row styling.

## How the pieces connect
`LogPastModal.tsx` already builds the same logical data as the history editor: a card per exercise and rows per set. By reusing `.fit-history-set` and modal-scoped wrapping, both screens now lean on the same layout language while keeping the modal’s width behavior independent from the edit screen.

## How to modify this later
If the modal set card should change, edit `.fit-history-set` in `apps/web/src/modules/fitness/fitness.css` and keep the modal-specific overrides under `.fit-logpast-modal`. If you want a different breakpoint for two-column wrapping, change the flex basis on `.fit-logpast-modal .fit-history-set`.
