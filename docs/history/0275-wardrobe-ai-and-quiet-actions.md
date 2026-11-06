# 0275 — Wardrobe AI proposals, weather planning, and quieter actions

Date: 2026-11-06
Status: accepted

## What changed
Wardrobe settings now explicitly inherit the app UI font. Secondary buttons use neutral
ghost styling; destructive controls stay muted until hover instead of prominent red
outlines. Removed the Back to wardrobe link from Settings.

Added independent, persisted switches for AI outfit creation and weather-based planning,
both off by default, and a city field. The isolated test account uses Lund, Sweden.
Enabled features show native proposal forms in Outfits/Schedule. Suggestions can be
reviewed, saved, or explicitly saved and scheduled. Weather proposals show the real
selected-date forecast and Open-Meteo attribution. Scheduling retries reuse an already
saved outfit instead of creating duplicates.

## Why
The owner requested matching typography, less prominent destructive buttons, removal
of the settings back link, and optional AI creation/weather planning using Lund.

## Files touched
- `apps/web/src/modules/settings/WardrobeSettings.tsx` — feature switches and weather city; remove back navigation.
- `apps/web/src/modules/wardrobe/wardrobe.css` — inherited settings typography, quieter action styles, proposal cards, forecast summary.
- `apps/web/src/modules/wardrobe/Wardrobe.tsx` — display AI controls only for enabled modes.
- `apps/web/src/modules/wardrobe/OutfitAssistant.tsx` — generate/review/save/schedule UI with recoverable errors.
- `apps/web/src/modules/wardrobe/OutfitAssistant.test.tsx` — explicit writes, scheduling retry without duplicates, provider errors.
- `apps/web/src/modules/wardrobe/api.ts` — preferences and structured proposal response types.
- `apps/api/app/models.py` — opt-in booleans and weather city.
- `apps/api/alembic/versions/039_wardrobe_ai_options.py` — additive migration with disabled defaults.
- `apps/api/app/routes/wardrobe.py` — persist/preserve the three AI preferences.
- `apps/api/app/routes/wardrobe_ai.py` — owner-scoped proposal generation and forecast retrieval; validate model output.
- `apps/api/app/main.py` — mount proposal endpoint.
- `apps/api/app/modules/ai/providers.py` — omit empty tool definitions for ordinary completion requests.
- `apps/api/tests/test_wardrobe.py` — updated preference response expectations.
- `apps/api/tests/test_wardrobe_ai.py` — auth/opt-in checks, proposals without writes, unknown/archived IDs, invalid output, forecast date limits, missing configuration.
- `docs/architecture/DATABASE.md` — AI preference schema and request lifecycle.
- `docs/product/AI_ASSISTANT_MODULE.md` — wardrobe proposal behavior and data flow.
- `docs/history/CHANGELOG.md` — index this entry.

## How the pieces connect
Both forms reuse the existing AI provider factory and configured user model. The new
endpoint supplies a bounded catalog of active owned garments and accepts only validated
JSON proposals whose UUIDs belong to that catalog. Weather mode calls fixed Open-Meteo
geocoding/forecast hosts with the configured city and selects the requested date's data.
The model receives no write tools. Existing authenticated outfit and calendar endpoints
perform writes only after the user accepts a proposal. A saved outfit ID is retained
if scheduling fails, making retries safe.

## How to modify this later
Keep feature gates enforced in the backend as well as the UI. Preserve disabled defaults
and never send archived garments, foreign IDs, secrets, or photos in the prompt. Extend
weather fields only through the fixed forecast endpoint and keep the date-range check.
Validate model results before showing them and retain review-before-save behavior.
Keep API failures actionable and do not silently fall back to invented weather. Use the
existing provider setup; live cloud calls need the server's configured OpenRouter key,
or a configured local OpenAI-compatible endpoint. Run `npm run check`, AI API tests,
and the proposal/save/scheduling browser flow before shipping.

Migration 039 was applied only to the isolated development database. A real-browser test
used a temporary local provider and live Lund weather; it restored provider/preferences
and removed its temporary outfit/event. No paid model request was made.

Verification: covered by the final complete check and real-browser workflows recorded
in history 0276. Both feature gates and explicit review-before-write behavior were tested.
