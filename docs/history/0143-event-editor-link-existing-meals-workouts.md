# 0143 — Event editor: search & link existing logged meals and completed workouts

Date: 2026-07-07
Status: accepted

## What changed

**Backend** — two new API endpoints to list unlinked items:
- `GET /api/food/unlinked?q=&limit=` — returns logged meals (`status='logged'`) that have no `Link` row to any event. Optional text search filters by `meal_type` or `notes`. Results ordered by most recent first.
- `GET /api/fitness/unlinked?q=&limit=` — returns completed workout sessions (`status='completed'`) that have no `Link` row to any event. Optional text search filters by `type`. Results ordered by most recent first.

**Frontend** — two entry points for linking existing logged meals and completed workouts to an event:

### 1. Connection cards (create-form-first, with "Link existing" option)
- **Food card** (toggle ON, not linked): shows the CREATE form by default (meal type dropdown + notes). A "Skip, link existing meal" button switches the card to a search view that queries `/api/food/unlinked`. Results show meal type, date, calories, and notes snippet. "Back to create" returns to the create form.
- **Fitness card** (toggle ON, not linked): same pattern — CREATE form by default (workout type grid + notes), "Skip, link existing workout" button switches to search view.

### 2. Linked panel (search-first, with "Create new" expandable)
For existing events with no linked meal/workout, the "Linked" section shows:
- When `form.connect_food` is ON and no meal link exists: a "Link an existing meal" search section at the top, plus a "Create new planned meal" expandable below.
- When `form.connect_fitness` is ON and no workout link exists: same pattern for workouts.
- This mirrors the existing note-search pattern in the Linked panel.

### Fixes after initial implementation
- **foodLinked/fitnessLinked computation**: removed `Boolean(event.connections?.food)` and `Boolean(event.connections?.fitness)` from the derived state. The saved event `connections` JSON persists even after a Link is deleted, so previously the "Managed from linked" message would never go away after unlinking. Now these flags only check actual Link rows in `eventLinks`, so unlinking immediately reveals the search UI.
- **Text selection in search results**: added `-webkit-user-select: text; user-select: text` to `.event-link-results button` in `styles.css` so users can select and copy text from the search result items (which are `<button>` elements).

### Save handler guards
- `connections.fitness` / `connections.food` are guarded with `!fitnessLinked` / `!foodLinked` to avoid creating duplicate planned entries when a Link was already established via search.
- The stale workout-type validation (which required a type even when linking) was removed.

## Why

Users log meals and complete workouts independently via the Food and Fitness pages. These logged/completed items may not be linked to any calendar event. Previously the only way to connect them was indirectly — the event editor could only create *new* planned meals/sessions. This feature adds two complementary paths: connection cards default to creation (with a "link existing" fallback), while the Linked panel defaults to searching for existing items (with a "create new" expandable).

## Files touched

### Backend
- `apps/api/app/routes/food.py` — added `list_unlinked_meals()` endpoint (`GET /api/food/unlinked`). Imports `not_` from sqlalchemy.
- `apps/api/app/routes/fitness.py` — added `list_unlinked_sessions()` endpoint (`GET /api/fitness/unlinked`). Imports `not_` from sqlalchemy.

### Frontend
- `apps/web/src/styles.css` — added `user-select: text` to `.event-link-results button` to allow copying text from search result items.
- `apps/web/src/modules/calendar/EventEditor.tsx` — major changes:
  - Added imports for `MealLog` and `WorkoutSession` types
  - Replaced `foodCreateOpen` / `fitnessCreateOpen` state with `foodCardView` / `fitnessCardView` ('create' | 'search') and `linkedFoodCreateOpen` / `linkedFitnessCreateOpen`
  - Added `linkExistingFood()` and `linkExistingFitness()` handlers (POST /api/links with target_type `meal_log` / `workout_session`, relation `logged_from`)
  - Added debounced search effects for food and fitness
  - **Food connection card**: create form (dropdown + notes) by default; "Skip, link existing meal" switches to search; "Back to create" returns
  - **Fitness connection card**: create form (type grid + notes) by default; "Skip, link existing workout" switches to search; "Back to create" returns
  - **Linked panel**: food/fitness search sections appear when toggle is ON and no link exists; each has a "Create new planned meal/workout" expandable
  - Save handler: guarded connections with `!foodLinked` / `!fitnessLinked`; removed stale workout_type validation; added pending link creation for food/fitness in create mode

## How the pieces connect

```
Creating a new event:
  Toggle Food ON → sees create form (dropdown + notes)
    → can fill it and save (creates planned meal + link)
    → OR click "Skip, link existing meal" → search → pick a logged meal
      → edit mode (event.id exists): POST /api/links immediately → card shows "Managed from linked"
      → create mode: added to pendingFoodLinks → linked after event creation

Editing an existing event (no links yet):
  Open Linked panel → sees "Link an existing meal" search
    → pick a logged meal → POST /api/links immediately → link appears in list
    → OR click "Create new planned meal" → fill form → on save, creates planned meal + link
```

## How to modify this later

- **Search results display**: the food/fitness result rows use inline JSX in EventEditor.tsx. Three separate blocks render the same meal result pattern (connection card search view, Linked panel food search, and Linked panel fitness search). To change formatting, edit each block.
- **Adding new item types** (e.g. finance transactions): add a new API endpoint + search state + link handler + UI block in both the connection card and Linked panel.
