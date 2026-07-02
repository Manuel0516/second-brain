# 0019 — Database pages UI (table, list, board)

Date: 2026-07-02
Status: accepted

## What changed

Phase 3 of the Notes module remake: Notion-style database pages in the frontend.

- New `apps/web/src/modules/notes/database/` module:
  - `DatabasePage.tsx` — orchestrator rendered by `PageView` when
    `page.type === 'database'`: loads properties/views, view tabs (with add/
    delete), persists view config. A virtual default Table view exists before
    any view is saved; the first config edit persists it.
  - `TableView.tsx` — token-styled table; column headers open `PropertyConfig`;
    typed inline cells; the title cell opens the record as a full page
    (records are pages — dual identity). "+" header adds a property; "+ New"
    adds a record.
  - `ListView.tsx` — the table minus columns.
  - `BoardView.tsx` — kanban grouped by a select property (`config.group_by`),
    HTML5 drag between columns patches the record's value.
  - `PropertyCell.tsx` — native inputs where possible (number/date/checkbox/
    select/text/url); multi_select = pill popover; relation = search popover
    over pages (value = page id).
  - `PropertyConfig.tsx` — column popover: rename, type select, options
    textarea (select/multi), asc/desc sort toggles, delete.
  - `filters.ts` + `filters.test.ts` — pure filter/sort/group functions.
- `types.ts`/`api.ts` extended (Page fields, DatabaseProperty/View,
  properties/views/duplicate endpoints).
- `PageView` gained optional `pages`/`onPatchPage`/`onCreatePage` props;
  `Notes.tsx` passes them (with a non-navigating `createPage` for records);
  `NotesPagePane` passes a generic `patchById` so database pages work in the
  calendar's note pane too.
- Sidebar: database records are hidden from the tree; database pages default
  to a '▦' icon; the row menu gained a Type select (page ↔ database).

## Why

Approved remake plan Phase 3 — the unbuilt `docs/product/NOTES_MODULE.md`
database features (records-as-pages, typed properties, multiple views).

## Files touched

- `apps/web/src/modules/notes/database/*` — new (see above).
- `apps/web/src/modules/notes/{types,api}.ts` — extended.
- `apps/web/src/modules/notes/{PageView,Notes,NotesPagePane,Sidebar}.tsx` — wiring.
- `apps/web/src/modules/notes/notes.css` — view tabs, table, cells, popovers, board, list, mobile sticky title column.
- `apps/web/src/modules/notes/Sidebar.test.tsx` — Page factory updated for new fields.

## How the pieces connect

Records are ordinary child pages of the database page, so `Notes.tsx`'s
existing pages array is the single source of truth; `PageView` filters
children and hands them to `DatabasePage`. Cell edits go through the same
optimistic `patchPage` used for titles/content — `pages.properties` is just
another patchable field. View/property schema state lives inside
`DatabasePage` (loaded from `/api/pages/{id}/properties|views`), while record
data flows down from the page owner, so the sidebar/canvas never desync.

## How to modify this later

- New view type (gallery/calendar): add to `ADDABLE_VIEWS` in
  `DatabasePage.tsx`, branch in its render, new component in `database/`.
- New property type: extend `PropertyType` (types.ts + backend Literal),
  add a case in `PropertyCell.tsx` and a label in `PropertyConfig.tsx`.
- Filter UI: `config.filters` is already applied by `filters.ts`; only a
  popover to edit the filter list is missing.
- Board drag on touch: HTML5 drag is desktop-only; records can still be
  edited by opening them as pages. Add long-press drag if it ever matters.
