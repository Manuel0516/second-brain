# 0119 — Food page frontend shell + sidebar + API client + wiring

Date: 2026-07-06
Status: accepted

## What changed
Built the Food page frontend foundation: page shell (AppRail + SidebarShell + topbar + tabs), API client, scoped CSS tokens, sidebar with 7 data cards, and extracted the body weight card into a shared component. Tab content (Overview, Stats, History) is placeholder only — the real content and MealLogModal come in a follow-up task.

## Why
Phase 3 of the Food module implementation plan. The Food page needs the same structural shell as Fitness (rail, sidebar, topbar, week nav, segmented tabs) before the tab content and meal-logging modal can be built on top.

## Files touched
- `apps/web/src/modules/food/api.ts` — NEW. API client with TypeScript interfaces (MealLog, FoodDailyExtras, DaySummary, FoodSummary, FileUpload) and async functions (fetchMealLogs, createMealLog, updateMealLog, deleteMealLog, analyzeMealLog, fetchSummary, upsertExtras, uploadFile). Mirrors `fitness/api.ts` pattern using `apiCall` from `lib/api.ts`.
- `apps/web/src/modules/food/food.css` — NEW. Scoped styles with `--food-accent*` tokens (amber #f59e0b), `--food-water` (#3b82f6), `--food-veg` (#22c55e), `--food-fruit` (#ef4444). Mirrors `fitness.css` structure: topbar, buttons, sidebar cards, week bars, calorie ring, water bar, icon rows, mobile responsive.
- `apps/web/src/modules/food/Food.tsx` — NEW. Main page component. Mirrors `Fitness.tsx` shell exactly: AppRail (active="food"), SidebarShell with toggle/backdrop, topbar with nav toggle + week nav (‹ › Today, ISO week number) + Segmented tabs (Overview | Stats | History via ?tab=) + "Log meal" primary button. Mobile sidebar collapse at ≤640px. Sidebar renders 7 cards: (1) this-week bars split into N segments per daily meal goal, (2) SVG calorie ring with kcal/target/remaining, (3) macros card with 3 ProgressBar rows, (4) water card with +/- buttons calling upsertExtras, (5) vegetables card with tappable broccoli SVG icons, (6) fruits card with tappable apple SVG icons, (7) BodyWeightCard with weight form toggle. Data loaded via `loadWeek()` → `fetchSummary` + `fetchBodyWeightStats` + `fetchBodyMetrics`.
- `apps/web/src/components/BodyWeightCard.tsx` — NEW. Shared component extracted from `Fitness.tsx` sidebar (lines ~837-904). Props: lastWeight, weightUnit, metrics (14-day sparkline via Recharts LineChart), trend, onOpenLog. Renders "Body" label, weight value, sparkline, trend line. Keyboard-accessible (role="button", tabIndex, Enter/Space handlers).
- `apps/web/src/components/AppRail.tsx` — EDIT. Added `'food'` to `ActiveRail` type union. Changed the disabled Food RailBtn to active/onClick mirroring the Fitness RailBtn.
- `apps/web/src/App.tsx` — EDIT. Added lazy import for Food module and `/food` route with ProtectedRoute + SettingsProvider + Suspense fallback, mirroring the `/fitness` route.
- `apps/web/src/context/SettingsContext.tsx` — EDIT. Added 8 food_* settings keys with defaults: `food_daily_meal_goal: 5`, `food_calorie_target: null`, `food_protein_target_g: null`, `food_carbs_target_g: null`, `food_fat_target_g: null`, `food_water_target_units: null`, `food_veg_target_units: null`, `food_fruit_target_units: null`.
- `apps/web/src/modules/fitness/Fitness.tsx` — EDIT. Replaced the inline body weight card (lines ~837-904) with `<BodyWeightCard>` component. Removed unused Recharts imports (LineChart, Line, ResponsiveContainer). The Fitness page renders identically — pure refactor.

## How the pieces connect
The Food page follows the same three-zone layout as Fitness: AppRail (60px left strip) → SidebarShell (230px contextual panel) → main canvas (flex:1). The rail button navigates to `/food` via React Router. The sidebar renders 7 cards that read from `FoodSummary` (fetched via `GET /api/food/summary?from_date=&to_date=`) and body weight stats (reused from `fitness/api.ts`). Water/veg/fruit cards call `PATCH /api/food/extras` to persist quick adjustments. The BodyWeightCard is shared between Fitness and Food — both modules display the same `body_metrics` data. Settings keys flow through `SettingsContext` → `useSettings()` hook, same as fitness_* keys. Tab content is placeholder divs — the real Overview, Stats, History components and MealLogModal will be built in a follow-up task.

## How to modify this later
- To add real tab content: replace the placeholder divs in `Food.tsx` (lines ~768-802) with the actual Overview, Stats, and History components. Import them from `./Overview`, `./Stats`, `./History`.
- To add the MealLogModal: create `apps/web/src/modules/food/MealLogModal.tsx`, add `showLogModal` state to `Food.tsx`, wire the "Log meal" button to open it, and render the modal at the bottom of the JSX (mirroring `SessionWizard`/`LogPastModal` in Fitness.tsx).
- To change food accent color: edit the `--food-accent*` tokens in `food.css` (lines 7-12).
- To add new sidebar cards: add them inside the `<SidebarShell>` children in `Food.tsx`, following the existing card pattern (`food-sidebar-section-label` + `food-sidebar-card`).
- The BodyWeightCard is shared — changes to it affect both Fitness and Food. If Food needs different behavior, add a prop rather than forking the component.