# 0274 — Wardrobe action buttons and preferences

Date: 2026-11-06
Status: accepted

## What changed
Fixed a dangling CSS selector that grouped action controls with the page typography
rule. Wardrobe links and buttons now have consistent padding, alignment, typography,
hover states, rounded borders, and destructive-action treatment; mobile targets are 44px.
Added Wardrobe to the Settings navigation and a shortcut in the module sidebar.
Settings support adding, renaming, and removing categories and selecting a default
local calendar for outfit scheduling. Preferences persist per user across devices.
Renames update existing active and archived garments; categories in use cannot be removed.

## Why
The owner reported cramped, misaligned schedule links, requested updated Edit/Delete
button styling, and selected category management and default calendar as Wardrobe settings.

## Files touched
- `apps/web/src/modules/wardrobe/wardrobe.css` — fix the malformed selector and unify action sizing/styles; style settings rows with existing tokens.
- `apps/web/src/modules/wardrobe/Wardrobe.tsx` — load persisted categories/default calendar and link to Wardrobe settings.
- `apps/web/src/modules/wardrobe/api.ts` — typed wardrobe preferences contract.
- `apps/web/src/modules/wardrobe/Wardrobe.test.tsx` — preference fixtures and wardrobe-calendar precedence regression.
- `apps/web/src/modules/settings/WardrobeSettings.tsx` — preferences UI using existing SettingsCard, Field, Dropdown, and ConfirmDialog components.
- `apps/web/src/modules/settings/SettingsLayout.tsx` — Wardrobe navigation item.
- `apps/web/src/App.tsx` — protected settings route.
- `apps/api/app/models.py` — per-user wardrobe category list and nullable calendar foreign key.
- `apps/api/alembic/versions/038_wardrobe_preferences.py` — additive preference migration.
- `apps/api/app/routes/wardrobe.py` — owner-scoped preference persistence and atomic category renaming.
- `apps/api/tests/test_wardrobe.py` — authentication, persistence, calendar ownership, category rename/isolation, deletion safeguards, and validation.
- `docs/architecture/DATABASE.md` — preference schema and lifecycle.
- `docs/history/CHANGELOG.md` — index this change.

## How the pieces connect
Wardrobe and its Settings page share the wardrobe API client's preferences type.
The API reuses the existing user-settings record; the general settings response contract
is unchanged. Category navigation combines persisted names with garment categories so
legacy custom values remain accessible. A wardrobe-specific calendar takes precedence
when the schedule form selects its initial calendar, while manual choices still work.
Renaming updates garment categories and the preference array in one transaction. Removing
in-use names is rejected before writes. The new database foreign key clears a removed
calendar preference automatically.

## How to modify this later
Keep action rules scoped to Wardrobe and avoid dangling selector lists. Treat links as
full button surfaces with explicit display, padding, and line-height; verify them at
mobile and desktop sizes. Extend preference fields in the API schemas, model, new
migration, TypeScript type, and settings form together. Preserve ownership checks for
calendar selection and category renames. Do not remove categories while garments still
use them, including archived items. Run `npm run check` and exercise the Settings page
against the isolated development account. Migration 038 was applied only to the local
Wardrobe test database; production still needs the normal migration/deployment process.

Verification: `npm run check` passed with 186 frontend tests and 220 API tests.
Real Chromium checks covered preferences, category safeguards, action padding/alignment,
and mobile overflow.
