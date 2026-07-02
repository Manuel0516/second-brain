# 0021 — Gallery/calendar database views + location block

Date: 2026-07-02
Status: accepted

## What changed

Phase 5 (final) of the Notes module remake.

- `database/GalleryView.tsx` — card grid; record covers (from 0020) render as
  card banners, otherwise the record icon.
- `database/CalendarView.tsx` — month grid mapping a date property
  (`config.date_by`, defaults to the first date property; selector when there
  are several). Weeks start Monday like the calendar module; records render as
  accent chips that open the record. Self-contained month math — deliberately
  does not import the calendar module.
- `editor/LocationNode.tsx` — zero-dependency location block: a TipTap atom
  node `{address, lat, lng}` rendered as an OpenStreetMap iframe embed + an
  address line. Inserted from the slash menu ("Location"): prompt → one-off
  Nominatim geocode fetch → insert. Registered in BlockEditor's extensions.
- New pytest `test_patch_content_with_unknown_block_types_is_safe` proves the
  backend mention walker ignores new node types.
- **Deferred: spreadsheet block.** Formulas need the HyperFormula dependency
  (approval required); per spec §3 most tabular needs are better served by
  database pages. Revisit when a real formula use case appears.

## Why

Approved remake plan Phase 5 — the last unbuilt NOTES_MODULE.md features that
need no new dependencies.

## Files touched

- `apps/web/src/modules/notes/database/GalleryView.tsx` — new.
- `apps/web/src/modules/notes/database/CalendarView.tsx` — new.
- `apps/web/src/modules/notes/database/DatabasePage.tsx` — gallery/calendar in `ADDABLE_VIEWS` + render branches.
- `apps/web/src/modules/notes/types.ts` — `date_by` on `ViewConfig`.
- `apps/web/src/modules/notes/editor/LocationNode.tsx` — new node + `insertLocation`.
- `apps/web/src/modules/notes/editor/BlockEditor.tsx` — extension + slash item.
- `apps/web/src/modules/notes/notes.css` — `.notes-gallery*`, `.notes-dbcal*`, `.notes-location*`.
- `apps/api/tests/test_notes.py` — walker-safety test.

## How the pieces connect

Both new views plug into `DatabasePage`'s existing view-switcher: they receive
the already filtered/sorted records and persist their one config key
(`date_by`) through the same `patchConfig` path as sort/group_by. The location
block lives entirely inside the page's TipTap JSON — no schema change; the
backend treats it as an unknown block type (covered by the new test), and the
OSM iframe URL is derived from the attrs at render time.

## How to modify this later

- Calendar view ↔ real Calendar module integration (records as events) is a
  separate feature; start from `CalendarView.tsx` and the Link table.
- Location display (map height, zoom bbox `d = 0.005`) lives in
  `LocationNode.tsx` `renderHTML`.
- Spreadsheet block: create a TipTap atom node with
  `{cells: {"A1": {value, formula}}}` attrs; add HyperFormula only after
  approval.
