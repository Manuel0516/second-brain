# 0122 — Food settings page

Date: 2026-07-06
Status: accepted

## What changed
- Created `FoodSettings.tsx` — a new settings sub-page for food/nutrition targets, mirroring `FitnessSettings.tsx` structure.
- Enabled the Food nav item in `SettingsLayout.tsx` (changed `disabled: true` to `disabled: false`).
- Added the `/settings/food` route in `App.tsx` with a direct import of `FoodSettings`.

## Why
Phase 4 of the Food module plan. Users need to configure their daily meal goal and nutrition targets (calories, macros, water/veg/fruit units) before the Food page frontend can display progress bars and targets.

## Files touched
- `apps/web/src/modules/settings/FoodSettings.tsx` — new file: renders 8 fields (daily meal goal, calorie target, protein/carbs/fat targets, water/veg/fruit unit targets) in a single "Targets" `SettingsCard`. Each field saves immediately via `patch()` on change, matching the FitnessSettings pattern. Nullable fields use the `?? ''` / conditional `null` pattern.
- `apps/web/src/modules/settings/SettingsLayout.tsx` — changed the Food `NAV_ITEMS` entry from `disabled: true` to `disabled: false`, making it a clickable nav link instead of a greyed-out "Soon" item.
- `apps/web/src/App.tsx` — added `import { FoodSettings }` and a `<Route path="food" element={<FoodSettings />} />` inside the settings layout's nested routes.

## How the pieces connect
The `SettingsLayout` renders a sidebar nav with links to each settings sub-page. Clicking "Food" navigates to `/settings/food`, which renders `FoodSettings`. That component reads `food_*` keys from `SettingsContext` (already populated by the backend) and writes them back via `patch()`, which calls `PATCH /api/settings`. The `food_*` keys were already defined in `SettingsContext.tsx` and the backend settings model — this page is the UI that was missing.

## How to modify this later
- To add/remove a food settings field: update the `UserSettings` interface and `DEFAULTS` in `SettingsContext.tsx`, add the backend column/migration, then add/remove the corresponding `<label className="cal-field">` block in `FoodSettings.tsx`.
- To change the save behavior (e.g. to a save button instead of immediate): follow the `GeneralSettings` profile card pattern with `onSave`/`hasChanges`/`saving` props on `SettingsCard`.
- To add more cards (e.g. a "Meal types" card): add another `<SettingsCard>` block inside the returned JSX, following the same `patch()` pattern.
