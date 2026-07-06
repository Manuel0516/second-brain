# 0120 — Food page: MealLogModal + Overview, Stats, History tabs

Date: 2026-07-06
Status: accepted

## What changed

Built the four remaining Food page frontend components (Phase 3 of `FOOD_PAGE_PLAN.md`):

1. **`MealLogModal.tsx`** (NEW) — AI photo capture modal. Five states: empty (file input with native camera via `capture="environment"`), uploading (spinner), analyzing (calls `analyzeMealLog`), result (editable calories/macros/water/veg/fruit + collapsible `ai_items` list), error (banner with "Try manual entry" fallback to manual form). Uses `createPortal` to `document.body`. Props: `open`, `onClose`, `onSaved`, `plannedMeal`, `defaultMealType`. Opens from planned meal slot or standalone. If no logId exists, creates a meal log (`status="planned"`) before analyzing. Backend guarantees no data loss on analysis failure — meal log stays untouched.

2. **`Overview.tsx`** (NEW) — Week strip with per-day SVG circles (filled=logged, outline=planned, empty dimmed), planned meals cards with meal type/time/notes, inline note editing, and auto-open detection for calendar-linked meals within ±15 minutes of now. Props: `summary`, `weekOffset`, `onLogMeal`.

3. **`Stats.tsx`** (NEW) — Arrow-switcher Recharts `LineChart` cycling Calories/Protein/Carbs/Fat (`‹ ›` buttons, `var(--food-accent)` stroke). Separate `LineChart` for Water (`var(--food-water)`), Vegetables (`var(--food-veg)`), Fruits (`var(--food-fruit)`). Body weight `LineChart` (from `fetchBodyWeightStats`) + `BodyMetricForm` (reused from fitness module). Props: `summary`, `onSaved`.

4. **`History.tsx`** (NEW) — Logged meals list: fetches `fetchMealLogs`, shows 5 recent with "Show all" expand. Each row: photo thumbnail (from `/api/files/{photo_file_id}`), meal type, macros, date, edit button (opens MealLogModal with existing data), delete button (calls `deleteMealLog` + ConfirmDialog). Below: `BodyMetricLog` reused from fitness module. Props: `onSaved`, `onEditMeal`.

5. **`Food.tsx`** (EDITED) — Wired in `MealLogModal`, `Overview`, `Stats`, `History`. Added modal state (`showLogModal`, `logModalPlannedMeal`, `logModalDefaultMealType`). "Log meal" button opens modal. `openLogModal` helper accepts optional meal/mealType args. Passes `onSaved={() => loadWeek()}` to refresh after save.

6. **`food.css`** (EDITED) — Added ~650 lines: MealLogModal styles (backdrop, modal, header, capture area, spinner, result form, pills, error banner, AI items collapsible), Overview styles (weekstrip day cards, planned meal cards, empty state), Stats styles (card head with arrows, stat cards), History styles (meal rows with photo thumbnails, action buttons, show-all button), and mobile media queries + `prefers-reduced-motion`.

## Why

Phase 3 of the Food page — the core AI photo capture feature and all tab content. The existing shell + sidebar in `Food.tsx` had placeholder text for all three tabs. The MealLogModal is the module's centerpiece: zero-typing meal logging via phone camera + OpenRouter AI vision analysis, with editable pre-filled results and graceful error fallback.

## Files touched

- `apps/web/src/modules/food/MealLogModal.tsx` — NEW: AI photo capture modal with 5 states, createPortal-rendered
- `apps/web/src/modules/food/Overview.tsx` — NEW: week strip circles + planned meals cards + auto-open detection
- `apps/web/src/modules/food/Stats.tsx` — NEW: arrow-switcher macro graph + water/veg/fruit/weight graphs + BodyMetricForm
- `apps/web/src/modules/food/History.tsx` — NEW: logged meals list with photos + edit/delete + BodyMetricLog
- `apps/web/src/modules/food/Food.tsx` — EDITED: imports + modal state + onLogMeal handler + tab content + MealLogModal
- `apps/web/src/modules/food/food.css` — EDITED: ~650 lines of new styles for all components

## How the pieces connect

- `Food.tsx` is the orchestrator — it owns `weekOffset`, loads `summary` and `bodyWeightData` from the API, and passes data down to tab components.
- `MealLogModal` is opened from the "Log meal" button (standalone), from `Overview` planned meal cards (with `plannedMeal` prop), or from `History` edit buttons (`onEditMeal` callback). The modal handles file upload → create/analyze → edit → save via `uploadFile`, `createMealLog`, `analyzeMealLog`, `updateMealLog` from `food/api.ts`.
- `Overview` auto-opens the modal on mount if a planned meal's `scheduled_at` falls within ±15 minutes of now.
- `Stats` reuses `BodyMetricForm` from `../fitness/BodyMetricForm` and fetches `BodyWeightStats` from `../fitness/api`.
- `History` reuses `BodyMetricLog` from `../fitness/BodyMetricLog` and `ConfirmDialog` from `../../components/ConfirmDialog`.
- All visual tokens use CSS custom properties from `styles.css`; only `--food-accent`/`--food-water`/`--food-veg`/`--food-fruit` are defined in `food.css`.

## How to modify this later

- **Add a new meal log field**: Add the field to `MealLogModal`'s `EditableFields` interface, add an `updateField` call + input in the result form JSX, and update the `updateMealLog` call's data object.
- **Change the AI error fallback behavior**: Edit `handleFileSelected` in `MealLogModal.tsx` — the catch block sets `state='error'` with `errorMsg`. The "Try manual entry" button calls `handleTryManual()` which sets `state='result'` (keeping the logId and photo).
- **Change the auto-open window**: Edit the `useEffect` in `Overview.tsx` — the `windowMs` constant (currently `15 * 60 * 1000` for ±15 minutes).
- **Add a new stats graph**: Add a new section in `Stats.tsx` mirroring the `LineChart` pattern. The day data is built from `summary.days` — add a new key to the `DayPoint` interface and the mapping.
- **Style adjustments**: All new CSS classes are in `food.css` under clearly labeled sections (`MealLogModal`, `Overview`, `Stats`, `History`, `Mobile`).