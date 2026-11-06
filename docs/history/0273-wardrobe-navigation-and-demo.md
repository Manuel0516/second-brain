# 0273 — Wardrobe navigation, styled selectors, and sample data

Date: 2026-11-06
Status: accepted

## What changed
Wardrobe now uses the shared app sidebar, compact module topbar, UI/monospace typography,
and dropdown menus. Its sidebar contains clothes, saved outfits, scheduling, all built-in
and custom categories with active counts, and archived clothes. Category selection scopes
new garments; the editor supports a styled category picker and a custom-category field.
Outfit/calendar pickers use the same shared custom dropdown instead of native selects.
Cards are smaller, use the existing typography, and have neutral vector placeholders.
Mobile navigation closes after choosing a section/category and collapses at the app's
existing breakpoint. Selected outfit/calendar values fall back safely after deletion.

The isolated `wardrobe@example.com` account received 13 sample garments (one archived),
13 uploaded SVG illustrations, four saved outfits, and three calendar plans. Sample data
was added through real authenticated upload and wardrobe APIs; it is editable/deletable.
The ignored `.dev/seed-wardrobe-test.py` script is idempotent and restricted to that account.

## Why
The owner requested navigation and typography consistent with the rest of Second Brain,
complete category/menu behavior, custom-styled selector options, and data for testing.

## Files touched
- `apps/web/src/modules/wardrobe/Wardrobe.tsx` — shared navigation, category counts/filtering, custom category entry, styled selectors, and safe selection defaults.
- `apps/web/src/modules/wardrobe/wardrobe.css` — module typography, sidebar rows, compact responsive cards, and calendar link buttons using existing tokens.
- `apps/web/src/modules/wardrobe/Wardrobe.test.tsx` — styled-selector interactions, category filtering, and custom-category creation coverage.
- `docs/history/CHANGELOG.md` — index this entry.

Development fixture scripts and local account data live outside tracked production code.

## How the pieces connect
SidebarShell and AppRail provide the same navigation structure as Food/Fitness. Existing
Segmented controls switch the three views; shared Dropdown/Popover components provide
styled, keyboard-accessible options. Categories continue to be garment data, so custom
categories appear automatically after a successful save without another taxonomy table.
Counts derive from the full active collection while search/filtering scopes the visible
cards. The existing API, storage, graph, and calendar contracts are unchanged.

## How to modify this later
Adjust category defaults at the top of `Wardrobe.tsx`; preserve user-entered category
names and derive navigation from both defaults and saved data. Reuse shared Dropdown for
selectors rather than adding native select/datalist controls. Keep UI labels/body text on
`--font-ui`, metadata/section labels on `--font-mono`, and all chrome on existing tokens.
Run `npm run check` and verify desktop/mobile navigation, custom category creation/edit,
archive filtering, outfit assembly, scheduling, and deletion against the isolated account.
Never seed sample data into production or an unrelated account.

Verification: `npm run check` passed with 185 frontend tests, 213 API tests, formatting,
lint, type checks, and a production build. Real Chromium checks against the isolated
account covered uploads/downloads, custom category creation/edit/delete, archive filtering,
outfit assembly, scheduling/removal, desktop/mobile navigation, styled menus, and all
four appearance combinations. Temporary UI test records were removed; sample counts
remain 13 garments, four outfits, and three scheduled looks.
