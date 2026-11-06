# 0271 — Native wardrobe tab

Date: 2026-11-06
Status: accepted

## What changed
Added a protected Wardrobe tab with a searchable clothing catalog, custom categories,
photo upload, brand/size/color/notes, archiving, saved outfits, and an outfit schedule.
Outfits can be planned as all-day calendar events and opened from the event editor.
The module is implemented natively; it does not embed or copy Libre Closet's code.
Automatic background removal, weather, sharing, and a separate offline data cache are
outside this initial module.

## Why
The owner requested Libre Closet's wardrobe workflow as a new Second Brain tab and
selected a native module to match the existing app and integrate with its calendar.

## Files touched
- `apps/api/app/models.py` — garment/outfit tables and constrained outfit membership.
- `apps/api/alembic/versions/037_wardrobe.py` — additive schema migration.
- `apps/api/app/routes/wardrobe.py` — authenticated owner-scoped catalog, outfits, and schedules.
- `apps/api/app/routes/notes.py` — resolve wardrobe outfits through the existing graph API.
- `apps/api/app/main.py` — mount the wardrobe router.
- `apps/api/tests/test_wardrobe.py` — API contracts, authentication, ownership, photos, deletion, DST scheduling.
- `apps/web/src/modules/wardrobe/api.ts` — typed same-origin API client.
- `apps/web/src/modules/wardrobe/Wardrobe.tsx` — catalog, outfit editor, filters, and calendar scheduling.
- `apps/web/src/modules/wardrobe/wardrobe.css` — responsive layout using existing design tokens and card/form patterns.
- `apps/web/src/modules/wardrobe/Wardrobe.test.tsx` — catalog filters, saving, scheduling, and recoverable API failures.
- `apps/web/src/lib/files.ts` — existing food upload helper moved into shared infrastructure.
- `apps/web/src/modules/food/api.ts` — re-export shared upload API without changing callers.
- `apps/web/src/App.tsx` — lazy protected wardrobe route.
- `apps/web/src/components/AppRail.tsx` — wardrobe navigation entry.
- `apps/web/src/modules/calendar/EventEditor.tsx` — open linked outfits.
- `apps/web/src/pages/Calendar.tsx` — navigate from event editor to the selected outfit.
- `docs/architecture/DATABASE.md` — wardrobe schema, ownership, and scheduling lifecycle.
- `docs/history/CHANGELOG.md` — index this entry.

## How the pieces connect
The protected route uses the existing session and SettingsContext. Clothes reference
owned image files from the existing upload API; outfits hold foreign-key-backed garment
memberships. The wardrobe router validates every owner boundary before saving.
Scheduling creates a regular local-calendar event with timezone-aware day boundaries,
then connects it to the outfit using an `event` → `wardrobe_outfit` graph edge. The event
editor reads that edge through the existing graph API. Calendar changes are announced
through the existing websocket notification helper. The schedule reads calendar events
rather than duplicating their dates in another table.

Deleting a scheduled outfit removes its event; deleting a saved outfit removes its
memberships and graph edges and clears outfit URLs, but keeps calendar history. A garment used in an outfit
must be removed from the outfit before deletion, or archived. Image files remain available
because other content can reference them. No dependencies or deployment services were added.

Verification: `npm run check` passed (179 web tests and 213 API tests, plus formatting,
lint, type checking, and production build). Migration 037 generates valid PostgreSQL
SQL. A Chromium preview with fixture data verified desktop/mobile layouts, outfit
navigation, the scheduling form, and the mobile rail.

## How to modify this later
Start with the input/response models and owner-scoped queries in `routes/wardrobe.py`.
Keep schema additions synchronized between `models.py` and a new Alembic migration;
never rewrite migration 037 after deployment. Update the TypeScript API types and the
corresponding form in `Wardrobe.tsx` when changing fields. Keep calendar scheduling as
regular events plus graph links, and preserve IANA timezone day boundaries across DST.
Use the existing shared upload helper and design tokens. Run `npm run check` and the
wardrobe ownership/scheduling tests before shipping. Apply migration 037 through the
normal deployment process before serving the new module; this task does not deploy it.
