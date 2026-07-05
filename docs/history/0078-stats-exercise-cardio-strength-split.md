# 0078 — Stats tab exercise list split into Cardio/Strength card grids

Date: 2026-07-05
Status: accepted

## What changed
Replaced the single mixed pill-button list on the Stats tab landing (Fitness.tsx lines 864-910) with two vertically-stacked sections — "Cardio" and "Strength" — each rendering exercises as a card grid reusing the `.fit-ex-grid` / `.fit-ex-card` / `.fit-ex-card-name` / `.fit-ex-card.selected` CSS classes from Gap 5 (SessionWizard).

## Why
User request: split the Stats tab exercise list into Cardio and Strength sections, each as a card grid, instead of one mixed list of pill buttons. This makes it easier to find exercises by category and matches the visual pattern already established in SessionWizard.

## Files touched
- `apps/web/src/modules/fitness/Fitness.tsx` — replaced the single `<div>` with pill buttons (lines 864-910) with an IIFE that splits `exerciseMap` entries into `cardio` (category === 'cardio') and `strength` (everything else), then renders each group as a section with a `.fitness-section-title` heading and a `.fit-ex-grid` of `.fit-ex-card` buttons. Empty sections are not rendered. Click behavior (`setStatsExerciseId`) is unchanged.

## How the pieces connect
The Stats tab landing (`Fitness.tsx` ~line 846) conditionally renders either `<ExerciseStats>` (when an exercise is selected) or the exercise list. The list now splits entries by category using the `exerciseMap` state (`Record<string, { name: string; category: string }>`), which was widened in Gap 1. Each card reuses the CSS classes from `fitness.css` lines 1293-1339, which were added in Gap 5 for SessionWizard. The `CategoryBadge` component (from `exerciseLibrary.tsx`) is already imported and used inside each card. Clicking a card calls `setStatsExerciseId(id)`, which triggers the existing `<ExerciseStats>` view — no changes to that component.

## How to modify this later
- To add a third section (e.g., "Mobility"), add another filter in the IIFE and a corresponding render block following the same pattern.
- To change the card grid layout, edit `.fit-ex-grid` in `fitness.css` — it affects both SessionWizard and this Stats list.
- The split logic is in the IIFE at lines 866-920 of `Fitness.tsx`. Search for `ex.category === 'cardio'` to find it.