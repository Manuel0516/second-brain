# 0116 — Food core database: meal_logs, food_daily_extras, food_* settings

Date: 2026-07-06
Status: accepted

## What changed
Added the database foundation for the Food module (Phase 1 per `FOOD_PAGE_PLAN.md`):
- New `meal_logs` table — one row per meal (planned or logged), with nutrition macros, water/veg/fruit units, photo FK to `files`, AI item breakdown JSON, and lifecycle status.
- New `food_daily_extras` table — per-day quick-log totals for water, vegetables, and fruit outside meals, with a DB-level unique constraint on `(user_id, date)`.
- Eight `food_*` settings columns on `user_settings`: daily meal goal, calorie target, macro targets (protein/carbs/fat), and water/veg/fruit unit targets.

## Why
The Food module is the last unbuilt core module. This migration creates the tables and settings columns needed before routes and UI can be built. All nutrition targets live in user settings (no separate `nutrition_targets` table — YAGNI per the plan).

## Files touched
- `apps/api/alembic/versions/022_food_core.py` — NEW migration: creates `meal_logs` and `food_daily_extras` tables, adds 8 `food_*` columns to `user_settings`, with full downgrade support.
- `apps/api/app/models.py` — Added `MealLog` and `FoodDailyExtras` SQLAlchemy model classes after `Goal`; added 8 `food_*` columns to `UserSettings`; added `date` to datetime import and `Date` to sqlalchemy import.
- `docs/architecture/DATABASE.md` — Added `### meal_logs` and `### food_daily_extras` table reference sections after `### goals`; added food_* columns to `### user_settings`; added `022` row to Migration history.

## How the pieces connect
- `meal_logs.user_id` → `users.id` (standard ownership FK).
- `meal_logs.photo_file_id` → `files.id` (nullable FK — same pattern as Notes image blocks, photos stored via existing MinIO `/api/files` infra).
- `food_daily_extras.user_id` → `users.id` with a unique constraint on `(user_id, date)` — one extras row per user per day, enforced at the DB level.
- `user_settings.food_*` columns are additive settings read by the Food page frontend and API routes (Phase 1b). `food_daily_meal_goal` defaults to 5 with a server-side default.
- The `meal_logs.status` column (`planned`|`logged`) with `server_default="planned"` mirrors the `workout_sessions.status` lifecycle pattern.
- `meal_logs.ai_items` (JSON, nullable) stores the raw AI breakdown for the edit view — same pattern as `calendar_events.connections`.

## How to modify this later
- To add a new nutrition field to meals: add a column to `meal_logs` in a new migration, update the `MealLog` model, and update the Pydantic schemas in `apps/api/app/routes/food.py`.
- To add a new food setting: add a column to `user_settings` in a new migration, update `UserSettings` model, and add the key to `SettingsContext.tsx` + `FoodSettings.tsx`.
- The `food_daily_extras` unique constraint is named `uq_food_daily_extras_user_date` — use this name if you ever need to drop or modify it.
- `meal_logs.meal_type` values are enforced in the API layer only (no CHECK constraint) — if you need DB-level validation, add a CHECK constraint in a new migration.