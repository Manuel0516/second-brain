# 0089 — LogPastModal set title font and center Add Set button

Date: 2026-07-06
Status: accepted

## What changed
Adjusted the past-workout exercise card header typography so the exercise name uses the project UI font, and wrapped the `+ Set` button in a centering container so it sits centered under the set rows.

## Why
The LogPastModal exercise name looked off compared with the rest of the fitness UI, and the `+ Set` action sat left-aligned instead of visually anchored beneath the set list.

## Files touched
- `apps/web/src/modules/fitness/LogPastModal.tsx` — replaced the inline `paddingTop` wrapper around the `+ Set` button with a dedicated centering wrapper.
- `apps/web/src/modules/fitness/fitness.css` — set `.fit-history-exercise h4` to `font: 600 13px var(--font-ui)` and added `.fit-logpast-add-set` to center the `+ Set` button.

## How the pieces connect
`LogPastModal.tsx` renders each exercise as a `.fit-history-exercise` card. The card title is the `<h4>` inside that section, so the CSS rule updates the name font in one place. The add button sits below the set list, so the new wrapper uses flex centering to keep the action aligned with the card content without changing the button itself.

## How to modify this later
If the exercise title should match a different heading treatment, edit `.fit-history-exercise h4` in `apps/web/src/modules/fitness/fitness.css`. If the `+ Set` button should move left, right, or stretch full width, change `.fit-logpast-add-set` rather than touching the button component.
