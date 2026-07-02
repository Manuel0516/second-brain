# 0011 — Database pages backend foundation

Date: 2026-07-02
Status: accepted

## What changed

Phase 2 of the Notes module remake: schema and endpoints so every later phase
(database views UI, covers, templates) is frontend-only.

- Migration `011_databases.py`: `pages` gained `type` ("page"|"database"),
  `is_template`, `cover` (preset token or URL, no FK), and `properties` (JSON,
  record values keyed by property id). New tables `database_properties`
  (name, type, config, position; FK→pages CASCADE) and `database_views`
  (name, type, config, position; FK→pages CASCADE). Verified upgrade and
  downgrade both directions against the local Postgres.
- `app/routes/databases.py` (new): properties CRUD
  (`GET/POST /api/pages/{id}/properties`, `PATCH/DELETE /api/properties/{id}`),
  views CRUD (`GET/POST /api/pages/{id}/views`, `PATCH/DELETE /api/views/{id}`),
  and `POST /api/pages/{id}/duplicate` — deep-copies a page subtree with its
  database schemas/views, remapping page and property ids inside JSON blobs
  (record values, view configs, inline mentions) so clones reference clones.
  The copy is never a template; this endpoint powers "Use template".
- `app/routes/notes.py`: `PageCreate` accepts `type`; `PagePatch` accepts
  `type`/`is_template`/`cover`/`properties`; `PageResponse` returns the new
  fields. The trash endpoint now hard-purges pages deleted more than 30 days
  ago (detaching live children, removing their links/properties/views first).
- Property types shipped: text, number, select, multi_select, date, checkbox,
  url, relation (relation values reuse the existing `Link` table via
  `/api/links`). `formula` deferred; `person` dropped (single-user app).

## Why

The approved Notes remake plan adds Notion-style database pages (records are
child pages — dual identity), covers, and templates from
`docs/product/NOTES_MODULE.md`. Doing all schema/endpoint work in one phase
keeps migrations coherent and unblocks three UI phases.

## Files touched

- `apps/api/alembic/versions/011_databases.py` — new migration (see above).
- `apps/api/app/models.py` — new `Page` columns; `DatabaseProperty`, `DatabaseView` models.
- `apps/api/app/routes/databases.py` — new router (properties/views CRUD, duplicate).
- `apps/api/app/routes/notes.py` — schema fields, create/patch support, trash purge.
- `apps/api/app/main.py` — mounts `databases.router`.
- `apps/api/tests/test_databases.py` — new; CRUD + ownership boundaries, non-database 422, duplicate remapping, trash purge.
- `docs/architecture/DATABASE.md` — new columns/tables + migration history row.

## How the pieces connect

A database is just a `Page` with `type="database"`; its records are ordinary
child `Page` rows, so the whole page tree, trash, mentions, and backlinks work
on records for free. The record's cell values live in `pages.properties`
keyed by `database_properties.id`; filtering/sorting/grouping happens in the
frontend over the already-loaded record list (single user). `databases.py`
reuses `_owned_page`, `_descendant_ids`, `_sync_mentions`, and `PageResponse`
from `notes.py` — ownership and mention-link behavior stay identical across
both routers.

## How to modify this later

- New property type: extend `PropertyType` in `routes/databases.py` (DB column
  is a plain string, no migration needed) and add a cell editor in Phase 3's UI.
- Server-side filtering at scale: extract `pages.properties` into a values
  table (see the `# ponytail:` comment in `models.py`).
- Purge window: the `timedelta(days=30)` cutoff in `list_trash`
  (`routes/notes.py`); move to a cron job if opening the trash ever feels slow.
- Duplicate semantics (id remapping): `_remap_ids` + `duplicate_page` in
  `routes/databases.py` — it text-replaces UUIDs inside serialized JSON blobs,
  which is safe because UUIDs are unambiguous.
