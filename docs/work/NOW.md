# What's happening now

Last updated: 2026-07-06

---

## Active work

**Food module — DONE (2026-07-06, history 0116–0122)**
- Migration 022: `meal_logs` table, `food_daily_extras` table, `food_*` settings keys.
- Backend API: CRUD for meal logs, AI photo analysis via OpenRouter (vision model), summary aggregates, daily extras upsert, calendar hook (event → planned meal).
- Frontend: dedicated `/food` page with shell mirroring Fitness, sidebar with 7 cards (week bars, calorie ring, macros, water, veg, fruit, body weight), Overview/Stats/History tabs, MealLogModal with AI photo capture flow, FoodSettings page.
- Calendar event editor: food connection card simplified to Meal + Notes, linked-meal card on edit.
- All 4 phases of `docs/work/plans/FOOD_PAGE_PLAN.md` complete.

**Notes + component architecture plans — CLOSED (2026-07-04, history 0047–0048)**
- `NOTES_MODULE_PLAN.md` and `COMPONENT_ARCHITECTURE_PLAN.md` both marked done.
- Cleaned up 13 stray duplicate `" 2"` files left by an editor/sync conflict
  (0047). Sidebar page-tree expand/collapse and collapsible-heading expand now
  animate instead of snapping (0048). `SaveIndicator`/`SearchField`/
  `LinkedItems` remain deferred until a second consumer exists.

**Mobile fixes + notes front page (2026-07-03, history 0034–0036, 0038)**
- Mobile page padding, stable heading toggle controls/rail (0034–0036).
- Todo-check save churn fixed (content reference kept + 1200 ms debounce with
  unmount flush); emoji picker usable on iOS; "Delete block" in a list now
  deletes only the line (was wiping the list — regression-tested); keyboard
  no longer pans the notes topbar away (viewport meta + dvh shell); `/notes`
  front page is now an overview tree of all notes (0038).

**Notes settings page — N6 DONE (2026-07-03, history 0037)**
- `/settings/notes`: bullet (disc/circle/square/dash) and numbered (decimal/
  alpha/roman) marker schemes with live previews; persisted via Settings API
  (migration 013); applied as pure CSS via editor-root data attributes.
- `NOTES_MODULE_PLAN.md` is now fully complete.

**Notes media & layout — DONE, reworked, polished (2026-07-03, history 0030–0033)**
- Backend file service: `minio` dep, `files` table (migration 012), `storage.py`,
  `POST/GET/DELETE /api/files`, SSRF-guarded `GET /api/embed`. MinIO env wired
  into the `api` service in `compose.yaml` (`MINIO_ENDPOINT: minio:9000` +
  `MINIO_ROOT_*` passthrough) — see 0032 for the three config traps hit locally.
- Image blocks: paste (incl. screenshots, multiple files), drop at pointer
  position, `/image` picker; NodeView with width drag grip + align controls;
  never upscaled past natural width (no quality loss).
- Bookmark cards: `/bookmark` or paste a bare URL on an empty line.
- Tables: floating toolbar (row/col add/delete, header, delete) above the
  active table, native column resizing, horizontally centered, auto width.
- Multi-column layout: drag a block onto the left/right edge of another →
  columns of blocks (cap 3, accent drop indicator); `/2 columns`, `/3 columns`;
  safe dissolution (content lifted, never deleted). Regression-tested in
  `ColumnNodes.test.ts`.
- Block text alignment: left/center/right/justify in the selection toolbar
  (hand-rolled `TextAlignExtension.ts`, official-extension-compatible format).
- Cover image uploads are now unblocked (files service exists) but not wired.

**Notes batch 2 DONE (2026-07-03, history 0025)** — Popover primitive (Dropdown/database popovers portalled for real), gap-based tree drag depth (order without forced nesting; fully-left = root where valid), per-line list drag, collapsible headings (details block removed + stripDetails migration), highlight/block colors, code-block languages, permanent deletion + trash rework + toast, split-view pane header, create-page type prompt.

**Notes module remake — ALL 5 PHASES DONE (2026-07-02, history 0010–0011, 0019–0021)**
- UI to calendar parity; database pages backend (011) + UI (table/list/board/
  gallery/calendar views); covers + templates; location block.
- Still deferred: spreadsheet block formulas (needs HyperFormula approval);
  cover image uploads (files service now exists, wiring pending); filter-editing
  UI; board drag on touch; row-height dragging in editor tables.

**Notes drag-and-drop + block commands (2026-07-03, history 0024)**
- Tree: instant mouse drag with live drop indicator (line/nest tint); touch keeps long-press. Blocks: accent drop cursor + dragged-block ring. Slash menu: formatting commands, H3, Toggle (`@tiptap/extension-details`), Callout, Duplicate/Delete block.

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
4. Notes deferred items (spreadsheet formulas, cover upload wiring, filter UI,
   table row-height dragging) — pick up on demand.

---

## Known issues

See `FIXES.md` for the bug queue.

---

## Plans

See `plans/` for upcoming feature implementation plans.
