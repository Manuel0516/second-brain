# 0075 — Explicit exercise category picker and visual category badges

Date: 2026-07-05
Status: accepted

## What changed
- Added a `CategoryBadge` component (dot + label pill) in `exerciseLibrary.tsx` (renamed from `.ts` to support JSX).
- Added CSS classes `.fit-category-badge`, `.fit-category-badge--strength`, `.fit-category-badge--cardio`, `.fit-category-badge--mobility`, and `.fit-category-picker` mobile rule in `fitness.css`.
- Replaced the `isCardioName()` heuristic as the sole source of truth for exercise category in all creation paths. It remains as a smart-default helper (auto-switches picker to cardio when a known cardio name is typed).
- Added a `<Segmented>` category picker (strength/cardio/mobility) in three places:
  - **LiveSession** add-exercise form — `newExerciseCategory` state, smart-defaults to cardio when `isCardioName()` matches.
  - **SessionWizard** custom exercise input — `customCategory` state, resets to strength after adding.
  - **LogPastModal** header — `defaultCategory` state, applied to all new exercises created in the session.
- Added `<CategoryBadge>` next to exercise names in:
  - LiveSession exercise headers (when `exercise.category` is set).
  - SessionWizard library toggle buttons (derived from library section: Cardio → cardio, others → strength).
  - SessionWizard search results (from `ex.category` in DB).
  - Fitness Stats tab exercise pill buttons (from `ex.category` in DB).
  - LogPastModal recognized exercise rows (matched against fetched DB exercises).
- Changed `exerciseMap` type from `Record<string, string>` to `Record<string, { name: string; category: string }>` to carry category info through to the Stats tab and GoalsSection.
- Fixed `createExercise` call in `Fitness.handleFinishSession` to always pass `ex.category` (not just when cardio).
- SessionWizard now tracks `exerciseCategories` per selected exercise and passes them into `buildActiveSession()`.

## Why
The backend fully supports `Exercise.category: 'strength' | 'cardio' | 'mobility'`, but the frontend used a hardcoded `isCardioName()` heuristic matching only 6 names. Any non-matching cardio exercise (e.g. "Trail Running", "Elliptical") silently became `strength`. Users had no way to pick a category and no visual indicator of what category an exercise belonged to.

## Files touched
- `apps/web/src/modules/fitness/exerciseLibrary.tsx` — renamed from `.ts`; added `CategoryBadge` component.
- `apps/web/src/modules/fitness/fitness.css` — added `.fit-category-badge*` and `.fit-category-picker` rules.
- `apps/web/src/modules/fitness/LiveSession.tsx` — added `newExerciseCategory` state, Segmented picker, CategoryBadge in exercise headers, smart-default logic.
- `apps/web/src/modules/fitness/SessionWizard.tsx` — added `customCategory` + `exerciseCategories` state, Segmented picker, CategoryBadge in library toggles and search results, category tracking in `buildActiveSession`.
- `apps/web/src/modules/fitness/LogPastModal.tsx` — added `defaultCategory` state, Segmented picker in header, `knownExercises` fetch, CategoryBadge for recognized rows, `category: defaultCategory` in `createExercise`.
- `apps/web/src/modules/fitness/Fitness.tsx` — changed `exerciseMap` type, added CategoryBadge in Stats tab exercise list, fixed `createExercise` to always pass category.
- `apps/web/src/modules/fitness/GoalsSection.tsx` — updated `exerciseMap` type and usages.

## How the pieces connect
- `CategoryBadge` lives in `exerciseLibrary.tsx` because that file already owns category concepts (`isCardioName`, `ActiveExercise.category`). It renders a pill with a colored dot using CSS classes from `fitness.css`.
- The `<Segmented>` component from `src/components/Segmented.tsx` is reused as-is for all three category pickers.
- `isCardioName()` is kept as a smart-default helper: when a user types a known cardio name, the picker auto-switches to cardio, but the user can override.
- `exerciseMap` was widened to carry `{ name, category }` so the Stats tab and GoalsSection can access category without additional fetches.
- SessionWizard's `exerciseCategories` record maps exercise name → category, populated from library section derivation, DB search results, and custom input picker.

## How to modify this later
- To add a new category: add it to the `Segmented` options arrays, the `CategoryBadge` dot class mapping, and the CSS modifier class.
- To change badge styling: edit `.fit-category-badge` and `--strength/--cardio/--mobility` classes in `fitness.css`.
- To change the smart-default behavior: edit the `isCardioName()` call sites in `LiveSession.tsx` (onChange handler) and `SessionWizard.tsx` (if added there).
- The `exerciseLibrary.tsx` rename from `.ts` is transparent to all importers since they use extensionless imports.