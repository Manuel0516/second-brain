# 0276 — Native outfit connections, day-aware suggestions, and compact mobile navigation

Date: 2026-11-06
Status: accepted

## What changed
Removed the Wardrobe settings shortcut and category-creation hint from the module sidebar.
Centered clothes/outfit card actions and kept Edit/Schedule/Delete on one row. The phone
header follows Fitness: centered title, a 26px visible navigation toggle with a 44px tap
area, and compact 32px create buttons with expanded tap areas. Create buttons and the
page selector share a 280px maximum width.

Combined manual outfit scheduling and weather suggestions into one card with a shared
date/calendar. Outfit AI now includes visible calendar events for that selected timezone-
local day, with existing recurrence/sharing/visibility behavior. Suggestions exclude saved
combinations regardless of their name or item ordering and filter duplicate candidates.
The review shows the day context used for the suggestion.

Calendar has a native Wardrobe connection card and Linked-panel open/unlink controls,
matching Food/Fitness's `logged_from` graph relationship. Creating a wardrobe plan uses
the calendar's create path with `connections.wardrobe.outfit_id`, not an outfit URL.
Migration 040 normalizes older links and replaces generated URLs with native connections.
Copying and overriding events preserve their outfit connection. Disconnecting a plan
preserves the event and outfit; deleting an outfit clears its edges and connection intent.

## Why
The owner requested consistent native event connections, merged planning panels, centered
actions, smaller phone navigation, calendar-aware suggestions, and novel saved outfits.
The owner also explicitly requested committing and pushing the completed changes.

## Files touched
- `apps/web/src/modules/wardrobe/Wardrobe.tsx` — sidebar cleanup, one planning card, outfit-card layout, safe disconnected-plan text.
- `apps/web/src/modules/wardrobe/OutfitAssistant.tsx` — embedded planner mode, shared date, calendar context display.
- `apps/web/src/modules/wardrobe/api.ts` — selected-day calendar context response types.
- `apps/web/src/modules/wardrobe/wardrobe.css` — centered actions and compact Fitness-style mobile header.
- `apps/web/src/modules/settings/WardrobeSettings.tsx` — disclose selected-day calendar context in AI settings.
- `apps/web/src/modules/calendar/EventEditor.tsx` — outfit connection picker and native linked-item lifecycle.
- `apps/web/src/modules/calendar/EventEditor.test.tsx` — native connection serialization without outfit URLs.
- `apps/web/src/modules/calendar/types.ts` — wardrobe connection type.
- `apps/api/app/routes/calendar.py` — owned outfit validation and native event creation/edit/copy/override links.
- `apps/api/app/routes/notes.py` — clear outfit connection intent when unlinking through the shared graph API.
- `apps/api/app/routes/wardrobe.py` — reuse calendar creation, native schedule query, non-destructive disconnect, and outfit deletion cleanup.
- `apps/api/app/routes/wardrobe_ai.py` — selected-day calendar context and unordered combination exclusions.
- `apps/api/alembic/versions/040_wardrobe_event_connections.py` — normalize legacy outfit relations/URLs without removing events or outfits.
- `apps/api/tests/test_wardrobe.py` — event connection ownership/create/copy/edit/unlink regressions.
- `apps/api/tests/test_wardrobe_ai.py` — recurring/hidden/private calendar context and saved/repeated combination rejection.
- `docs/architecture/DATABASE.md` — current graph/data lifecycle and AI exclusions.
- `docs/product/CALENDAR_MODULE.md` — native wardrobe connection behavior.
- `docs/product/AI_ASSISTANT_MODULE.md` — day-aware, novel outfit proposals.
- `docs/history/CHANGELOG.md` — index this entry.

## How the pieces connect
Calendar's typed connection data identifies a saved outfit template. Its existing graph
API exposes the resulting `logged_from` edge in Linked, and the Calendar page opens the
outfit through the same callback pattern used for Food/Fitness. Unlink removes both the
edge and saved intent so future event edits cannot silently reattach it. Copies reuse
outfit templates rather than duplicating the wardrobe catalog.

The proposal endpoint calls the existing calendar query for the user's timezone-local
selected day, so recurrence expansion and visible/shared calendar rules remain centralized.
It supplies those events and existing saved outfit sets to the configured model. UUID-set
comparison independently prevents renamed/reordered duplicates; no proposal is persisted
until the user explicitly accepts it. The shared planner sends the same date/calendar for
manual and AI-generated plans.

## How to modify this later
Keep outfit intent synchronized with native edges in calendar create/edit/copy/override
and shared unlink handling. Never put outfit routes into the event's URL field. Preserve
calendar events when disconnecting outfits. Use new data migrations for deployed records;
040 intentionally does not recreate stale URLs on downgrade.

Keep calendar context on the existing get_events path and compare garment sets rather than
names or ordering. Do not send other users' inaccessible calendars or hidden calendars to
the model. Keep the phone title centered independently of the icon, visible buttons compact,
and expanded tap targets clear of neighboring controls. Run npm run check and the real
native-connection, combined-planner, AI review/save, and mobile geometry browser checks.

Verification: `npm run check` passed with 189 frontend tests and 233 API tests, plus
formatting, lint, strict type checks, and the production build. Real Chromium checks
verified native connection/open/unlink/reconnect, one shared planner/date/calendar,
centered single-row actions, centered phone titles, compact navigation and create buttons,
matching selector/button widths, and no horizontal overflow. AI integration was checked
with a temporary local model and live Lund weather; temporary records/configuration
were restored. API tests cover local-midnight boundaries, recurrence, calendar privacy,
and saved/repeated garment-set exclusions.
