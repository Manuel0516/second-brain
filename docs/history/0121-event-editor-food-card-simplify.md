# 0121 — Event editor food card simplified to Meal + Notes

Date: 2026-07-06
Status: accepted

## What changed
Replaced the multi-field food connection card in the EventEditor with a minimal Meal selector + Notes textarea. Removed all nutrition and quantity input fields (food_name, food_quantity, food_unit, food_calories, food_protein, food_carbs, food_fat) and their associated form state, validation, and submission code. Updated the `EventConnections` TypeScript type to match the simplified `{meal_type, notes}` backend model.

## Why
Per FOOD_PAGE_PLAN.md Phase 2, the food connection card in the calendar event editor no longer needs detailed nutrition fields — those are captured on the dedicated Food page via photo AI. The event editor only needs to tag a meal type and optional notes so the calendar hook can create a planned `meal_logs` row.

## Files touched
- `apps/web/src/modules/calendar/EventEditor.tsx` — removed 7 form fields from initial state, removed 2 validation checks, replaced the food connection object in submission with `{meal_type, notes}`, and replaced the multi-field UI card (name, quantity, unit, calories, protein, carbs, fat inputs) with a simple Meal dropdown + Notes textarea. Removed the now-unused `numberOrNull` helper.
- `apps/web/src/modules/calendar/types.ts` — updated the `food` property of `EventConnections` from the old shape (`{name, quantity, unit, calories?, protein?, carbs?, fat?}`) to the new simplified shape (`{meal_type, notes?}`).

## How the pieces connect
The `EventEditor` form state no longer stores detailed nutrition data. When the user toggles `connect_food` on, they see only a Meal-type dropdown (breakfast/lunch/dinner/snack) and an optional Notes textarea. On save, the submission builds a `{meal_type, notes}` object that matches the backend `FoodConnection` Pydantic model. The TypeScript type in `types.ts` was the source of the shape contract — keeping it in sync prevents type errors at build time.

## How to modify this later
To add the "Linked meal" card for edit mode (showing a link to the Food page when the event already has a linked meal log), add a condition near the top of the connections section (around line 1500 in EventEditor.tsx) that checks for `event.connections?.food?.meal_type` and renders a read-only card with a link to `/food?date=...&meal=...`. The backend calendar hook in `apps/api/app/routes/calendar.py` already creates the meal log + link row on event save.