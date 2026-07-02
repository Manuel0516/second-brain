# What's happening now

Last updated: 2026-07-02

---

## Active work

**Notes module remake — ALL 5 PHASES DONE (2026-07-02, history 0010–0011, 0019–0021)**
- Phase 1: UI rebuilt to calendar parity (shared shell/sidebar/topbar/mobile drawer).
- Phase 2: backend for database pages (migration 011, properties/views CRUD, duplicate, trash purge).
- Phase 3: database pages UI (table/list/board, typed property cells, sort/group).
- Phase 4: covers (preset gradients + URL) and templates.
- Phase 5: gallery + calendar views, location block (OSM, zero deps).
- Deferred: spreadsheet block formulas (needs HyperFormula approval); cover image uploads (needs `minio` dep + files route); filter-editing UI (filters.ts already applies `config.filters`); board drag on touch.

**Event↔note linking rework + folders (2026-07-02, history 0022)**
- Folder page type; FolderPicker component; event creation asks folder + title + link-existing; edit mode = toggle-only connections card + Linked card for all management; toggle-off unlinks everything (notes survive).

**Project governance restructure**
- AGENTS.md rewritten as universal guide (Claude + Codex + Copilot).
- docs/ folder reorganized: design/, architecture/, work/, history/.
- STYLE_GUIDE.md created from calendar/settings patterns.
- Old decisions/ converted to history/ with richer format.

---

## Up next (rough priority order)

1. Finance module — Phase 3 (see `docs/product/FINANCE_MODULE.md`).
2. Settings → Security page — wire up TOTP 2FA UI.
3. Google Calendar sync — Phase 1 completion.
4. Notes deferred items (spreadsheet formulas, cover uploads, filter UI) — pick up on demand.

---

## Known issues

See `FIXES.md` for the bug queue.

---

## Plans

See `plans/` for upcoming feature implementation plans.
