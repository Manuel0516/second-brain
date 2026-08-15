# 0226 — Per-user model + editable prompt for food photo analysis

Date: 2026-08-15
Status: accepted

## What changed

`POST /api/food/logs/{id}/analyze` (meal photo → calories/macros via OpenRouter vision)
previously used a fixed global OpenRouter model (`app.config.get_settings().openrouter_model`,
env-var only) and a hardcoded prompt constant — neither was user-configurable. Added:

- `UserSettings.food_analyze_model` (str, default `google/gemini-2.5-flash`) and
  `UserSettings.food_analyze_prompt` (text, default = the previous hardcoded prompt) —
  same per-user settings row every other Food/Fitness setting already lives on.
- Two new cards on the Food settings page: **"AI photo analysis"** (the OpenRouter model
  id) and **"Analysis prompt"** (the full prompt text, editable, with a "Reset to default"
  button). The prompt gets a visibly distinct monospace/raised-background textarea — same
  "this is a procedure sent to a model, not prose" treatment as the AI settings skill cards
  (`0224`) — via a new shared `.settings-prompt-field` class.
- New `SettingsTextField` component (`modules/settings/`), mirroring the exact interaction
  idiom `SettingsNumberField` already established for this settings section: local draft
  state, PATCH only on blur/Enter (never per-keystroke), Escape reverts. Supports both
  single-line and multiline (prompt) use.

## Why

User request: make the food-photo-analysis model and prompt user-configurable from the
Food settings page, styled consistently with the rest of the settings UI.

## Files touched

- `apps/api/app/models.py` — `DEFAULT_FOOD_ANALYZE_PROMPT`; two new `UserSettings` columns.
- `apps/api/alembic/versions/034_food_analyze_settings.py` — new migration (down_revision
  `033`).
- `apps/api/app/routes/settings.py` — `food_analyze_model`/`food_analyze_prompt` added to
  `SettingsResponse`/`SettingsPatch`/`_settings_to_response`.
- `apps/api/app/routes/food.py` — `analyze_meal_photo` now reads the user's settings row
  (via the existing `_get_or_create_settings`, reused rather than duplicated) instead of
  the global config + hardcoded prompt constant (removed).
- `apps/web/src/context/SettingsContext.tsx` — new fields on `UserSettings`/`DEFAULTS`;
  `DEFAULTS` now exported (used by the reset-to-default button, so the frontend default
  text lives in exactly one place).
- `apps/web/src/modules/settings/SettingsTextField.tsx` — new shared component.
- `apps/web/src/modules/settings/FoodSettings.tsx` — two new `SettingsCard`s.
- `apps/web/src/styles.css` — `.settings-prompt-field textarea` (mono, raised bg, focus
  ring) — parallels `.ai-skill-card textarea` from `0224` without coupling the two pages.

## How the pieces connect

`analyze_meal_photo` already had `get_settings()` for the OpenRouter API key (still a
global secret, correctly not per-user) — it now *also* loads the caller's `UserSettings`
row for the model/prompt, via the same `_get_or_create_settings` helper `routes/settings.py`
itself uses, so a user's first-ever analyze call still gets sane defaults even if they've
never opened Settings. `SettingsTextField` is intentionally scoped to
`modules/settings/` (not `src/components/`) since — like `SettingsNumberField` before it —
it's a settings-page-specific interaction idiom, not a general-purpose input.

## How to modify this later

If the prompt is edited into something that doesn't ask for JSON, `analyze_meal_photo`'s
existing JSON-parse step will fail with its existing error handling (unchanged) — the
"Reset to default" button is the intended recovery path, not new server-side validation of
prompt content (deliberately not attempted: it's a prompt, not structured input).
