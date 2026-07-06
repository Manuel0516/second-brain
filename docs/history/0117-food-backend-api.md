# 0117 — Food module backend API: routes, settings, and OpenRouter config

Date: 2026-07-06
Status: accepted

## What changed
Implemented the full Food module backend API (Phase 1 per `FOOD_PAGE_PLAN.md`):
- Replaced the 4-line scaffold in `apps/api/app/routes/food.py` with 7 endpoints covering meal log CRUD, AI photo analysis via OpenRouter, per-day summary aggregation, and daily extras upsert.
- Added 8 `food_*` fields to `SettingsResponse`, `SettingsPatch`, and `_settings_to_response()` in `apps/api/app/routes/settings.py`.
- Added `openrouter_api_key` and `openrouter_model` env vars to `apps/api/app/config.py`.

## Why
The Food module is the last unbuilt core module. This provides the complete backend API surface needed before the frontend (Phases 2–4) can be built. The AI photo analysis endpoint is the module's centerpiece feature — log a meal by taking a photo, with OpenRouter vision model extracting nutrition data.

## Files touched
- `apps/api/app/routes/food.py` — Full rewrite (4 lines → 498 lines). 7 endpoints: `GET /logs`, `POST /logs`, `PATCH /logs/{log_id}`, `DELETE /logs/{log_id}`, `POST /logs/{log_id}/analyze`, `GET /summary`, `PATCH /extras`. Pydantic models: `MealLogCreate`, `MealLogPatch`, `MealLogResponse`, `AnalyzeRequest`, `DaySummary`, `FoodSummary`, `ExtrasPatch`, `FoodDailyExtrasResponse`. Helper: `_owned_meal_log()`, `_start_of_day()`.
- `apps/api/app/routes/settings.py` — Added 8 `food_*` fields to `SettingsResponse` (after `fitness_*`), `SettingsPatch` (all optional with `ge` validation), and `_settings_to_response()` mapping.
- `apps/api/app/config.py` — Added `openrouter_api_key: str = ""` and `openrouter_model: str = "google/gemini-2.5-flash"` to the `Settings` class.

## How the pieces connect
- **Router**: `food.py` uses `APIRouter(prefix="/api/food", tags=["food"])`, already registered in `main.py` via `app.include_router(food.router)`.
- **Auth**: Every endpoint uses `Depends(get_current_user)` + `Depends(get_async_session)` — same pattern as `fitness.py`.
- **Meal log CRUD**: Mirrors `fitness.py` session endpoints. `DELETE` also removes the linked photo file from MinIO (`storage.remove`) + `File` model row + `Link` rows where `target_type="meal_log"`.
- **AI analysis** (`POST /logs/{id}/analyze`): Fetches image bytes from MinIO via `storage.download()`, base64-encodes, sends to OpenRouter chat completions API with a strict JSON prompt, parses the response, writes nutrition data onto the meal log. Graceful errors: 400 if `OPENROUTER_API_KEY` is empty, 502 if API call or parsing fails (log is NOT modified on error). Uses `httpx.AsyncClient`.
- **Summary** (`GET /summary`): Iterates every day in the `from_date`–`to_date` range, fetches `meal_logs` + `food_daily_extras` for each day, sums calories/macros/water/veg/fruit, counts planned vs logged meals. Returns `FoodSummary` with `days: list[DaySummary]`.
- **Extras** (`PATCH /extras`): Upserts `food_daily_extras` — if a row exists for `(user_id, date)`, updates non-null fields; otherwise creates a new row.
- **Settings**: The 8 `food_*` fields flow from `UserSettings` model columns → `_settings_to_response()` → `SettingsResponse` / `SettingsPatch` → frontend `SettingsContext`. Validation: `food_daily_meal_goal` is `ge=1, le=20`; all numeric targets are `ge=0`.
- **Config**: `openrouter_api_key` and `openrouter_model` are read from env vars (`.env` / Compose) via `get_settings()`, used only by the `/analyze` endpoint.

## How to modify this later
- To add a new food endpoint: add it to `food.py` following the existing pattern (Pydantic model at top, route function with `Depends(get_current_user)` + `Depends(get_async_session)`).
- To change the AI prompt: edit `_ANALYZE_PROMPT` at the top of `food.py`.
- To change the OpenRouter model: update the `openrouter_model` env var or default in `config.py`.
- To add a new food setting: add the column to `UserSettings` in `models.py` + migration, then add the field to `SettingsResponse`, `SettingsPatch`, and `_settings_to_response()` in `settings.py`.
- The `/analyze` endpoint does NOT modify the log on error — this is intentional. If you need partial writes on parse failure, restructure the try/except block.
- The `/summary` endpoint iterates every calendar day in range — if the range is very large (years), consider switching to a DB-level `GROUP BY date` approach.