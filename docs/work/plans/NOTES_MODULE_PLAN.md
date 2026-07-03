# Plan D — Notes / Pages (Phase 2), calendar-first

> ## STATUS (2026-07-03) — plan essentially COMPLETE except N6
>
> Everything below shipped, plus a lot this plan deferred (see history
> 0010–0011, 0019–0025):
>
> - **N1–N5, N7, N8 done.** The only open sub-phase is **N6 (notes settings:
>   bullet/numbered list marker schemes)** — not started.
> - **Beyond this plan, also built:** database pages with properties +
>   table/list/board/gallery/calendar views (0019, 0021); covers (preset
>   gradients + URL) and templates (0020); folder page type + the
>   event↔note linking rework with folder picker and Linked card (0022);
>   custom Dropdown + portalled Popover primitive (0023, 0025); tree drag
>   with instant mouse drag, live drop indicator, and gap-based depth choice
>   (0024–0025); per-line list dragging; collapsible headings (replaced the
>   short-lived details toggle — includes a `stripDetails` load migration);
>   expanded slash menu (formatting commands, callout, location,
>   duplicate/delete block); split-view pane header; create-page type
>   prompt; permanent deletion + trash rework + toast.
> - **Migration numbering drifted:** pages landed as migration **010** (not
>   009); database tables as 011.
> - **Next work is Plan E** (`NOTES_MEDIA_AND_LAYOUT_PLAN.md`): file upload
>   service (MinIO), image blocks, bookmark cards, table row/column
>   controls, multi-column layouts.

> Audience: implementing AI or developer. Self-contained build spec for the
> first Notes phase. Read order: this plan → `docs/product/NOTES_MODULE.md`,
> `docs/product/CALENDAR_MODULE.md §3`, `docs/product/ARCHITECTURE.md §4` →
> `docs/design/STYLE_GUIDE.md` + the Design Canvas
> (`docs/design/design-canvas/Second Brain.dc.html`) for the visual pass →
> nearest `AGENTS.md`. Run `npm run check` (web) and `npm run check:api` before
> any task is "done". Reuse the tokens/components already in
> `apps/web/src/styles.css` — **no new visual language**.

---

## 1. Outcome

A Notes module that feels like part of the calendar, not a bolted-on section.

- A **standalone Notes area** (app-rail → `/notes`): a nested page tree in the
  contextual sidebar, a block editor as the main canvas — the same rail →
  sidebar → canvas shell as Calendar and Settings.
- **Notes attached to events**: enabling "Notes" on an event and saving creates
  a real linked **Page**; the calendar then **splits** — grid on one side, the
  note editor on the other (desktop/tablet). On mobile the note opens as a
  full-screen sheet.
- The block editor supports **rich text, headings, lists, to-dos, quotes, code,
  dividers, tables, and LaTeX** (inline `$…$` and block `$$…$$`), plus **`[[`
  mentions** of other pages/events that write real graph edges.
- Every event and page shows a **Linked panel** (backlinks) — the "second brain"
  payoff: open anything, see everything connected to it.

### Locked decisions (from review)

| Decision | Choice |
|---|---|
| Editor engine | **Tiptap** (ProseMirror, headless) + official extensions |
| Table scope | **Simple content tables + LaTeX**; databases/spreadsheets deferred |
| Notes surface | **Standalone page tree + event-attached notes** (both, this phase) |
| Split view | **Desktop/tablet split; mobile full-screen sheet** |

---

## 2. New dependencies (approved via review)

Per `ARCHITECTURE.md` the rich editor is Tiptap/BlockNote — hand-rolling tables,
LaTeX, selection, and undo is far more code and risk. Add to `apps/web`:

- `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`
- `@tiptap/extension-task-list`, `@tiptap/extension-task-item`
- `@tiptap/extension-table`, `-table-row`, `-table-cell`, `-table-header`
- `@tiptap/extension-placeholder`, `@tiptap/extension-mention`
- `katex` + a Tiptap math extension (`@tiptap/extension-mathematics` or
  `@aarkue/tiptap-math-extension` — pick the one that renders inline **and**
  block KaTeX; document the choice in the editor file header).

No new backend dependencies. `content` is stored as JSON with the existing
`JSON` column type.

---

## 3. Data model & migration (backend)

File: `apps/api/app/models.py`. New Alembic migration
`apps/api/alembic/versions/009_pages.py` (down_revision = `"008"`).

### 3.1 `Page`

```python
class Page(Base):
    __tablename__ = "pages"
    id            UUID  pk
    user_id       FK users.id          # single user, but scope every query by it
    parent_page_id UUID | null (self FK, index)   # nesting
    title         String(255)  default "Untitled"
    icon          String(16) | null    # emoji
    content       JSON  default {}      # a single Tiptap document (see §3.3)
    position      String               # fractional index among siblings (reuse
                                        # the calendar-order idea; simple "aN" is fine)
    created_at, updated_at
    deleted_at    DateTime | null       # soft delete → trash/restore
```

Only the Phase-1 subset of the spec's `Page`. **Deferred** (note in the
migration comment, do not add columns now): `workspace_id`, `cover_image_id`,
`type: database`, `is_template`.

### 3.2 Links (reuse the existing `Link` table — no schema change)

`Link` already exists (`source_type/id`, `target_type/id`, `relation`, unique
edge). Use it for:

- **Event → note**: `source_type="event"`, `target_type="page"`,
  `relation="note"`. Written when a note is attached to an event.
- **Mentions**: `source_type="page"`, `target_type="page"|"event"`,
  `relation="mentions"`. Written when `[[` inserts a mention.

Backlinks = query `Link` where `target_type/target_id` = the node.

> `CalendarEvent.connections.notes` currently holds only a draft `{title}`.
> Keep the toggle, but a saved note is now a **real `Page` + `Link`**, per
> `CALENDAR_MODULE.md §3` ("every target_id must identify a real target
> record"). The `connections.notes` draft becomes provenance only.

### 3.3 Why one Tiptap doc per page (not Block-per-row)

`NOTES_MODULE.md §1/§4` describes polymorphic `Block` rows with fractional
indexing. **Phase 1 stores the whole Tiptap document as one `content` JSON blob
per page** instead.

`# ponytail: one JSON doc per page; split into Block rows only if per-block
backlinks or huge-page perf demand it.` Tiptap owns document JSON natively, so
this is a fraction of the code and still supports tables/LaTeX/mentions. Mentions
still create `Link` rows, so cross-node backlinks work without block decomposition.
Upgrade path: migrate the doc into `Block` rows keyed by node id later.

---

## 4. Backend API

New router `apps/api/app/routes/notes.py` (thin, per API `AGENTS.md`), mounted
under `/api`. All routes require the authenticated user and filter by `user_id`.

```
GET    /api/pages                     # flat list (client builds the tree); excludes trashed
GET    /api/pages/{id}                # 404 if trashed or not owned
POST   /api/pages                     # { title?, icon?, parent_page_id? } → Page
PATCH  /api/pages/{id}                # { title?, icon?, content?, parent_page_id?, position? }
DELETE /api/pages/{id}                # soft delete (set deleted_at); cascade-soft children
POST   /api/pages/{id}/restore        # clear deleted_at
GET    /api/pages/trash               # trashed pages
GET    /api/nodes/{type}/{id}/backlinks   # Link rows targeting this node, resolved to titles
GET    /api/search?q=                 # Postgres ILIKE/FTS over page title + plaintext

# calendar bridge
POST   /api/events/{event_id}/note    # create Page + Link(event→page,"note") atomically → Page
GET    /api/events/{event_id}/links   # linked nodes for the event's Linked panel
POST   /api/links  /  DELETE /api/links/{id}   # generic edge (used by [[ mentions)
```

- **Mentions sync**: on `PATCH /pages/{id}` with new `content`, re-derive
  `mentions` links from the document (extract `mention` nodes) and reconcile the
  `Link` rows for that page (`relation="mentions"`). Keep it simple: delete this
  page's `mentions` links, re-insert from the current doc. Small docs, single
  user — fine.
- **Search**: start with `ILIKE` on title + a `content`-to-plaintext column or
  on-the-fly extraction. `# ponytail: ILIKE now; pg_trgm / tsvector / pgvector
  when the corpus grows.`
- Pydantic response models explicit and stable (`PageResponse`,
  `BacklinkResponse`). Never leak internal fields.

Tests (`apps/api/tests/test_notes.py`): page CRUD + ownership isolation, soft
delete/restore, event→note creates page+link atomically, mention reconcile,
backlinks query, search hit.

---

## 5. Frontend

### 5.1 Shared editor — `apps/web/src/modules/notes/editor/`

`BlockEditor.tsx` — the one Tiptap component, used by both the standalone page
view and the event split-view.

- Extensions: StarterKit (paragraph, h1–h3, bullet/ordered lists, blockquote,
  inline code, code block, hr, marks), TaskList/TaskItem, Table suite,
  Placeholder, Mathematics (inline `$…$`, block `$$…$$`, KaTeX), Mention
  (trigger `[[`, async suggestion querying `/api/search`, inserts a `mention`
  node carrying `{type, id, label}`).
- **Slash `/` menu** for block insertion, styled like the existing popover
  (`.cal-card` / event-editor popover language) — not a new visual system.
- **Bubble/selection toolbar** for inline marks (bold/italic/code/link/math),
  same token set.
- Controlled by page `content`; emits changes up via a debounced callback.
- **Autosave**: debounce ~600 ms after typing stops → `PATCH /api/pages/{id}`
  (per `NOTES_MODULE.md §8.1`). Show a subtle "Saved" affordance; never a
  blocking spinner.

### 5.2 Standalone Notes module — `apps/web/src/modules/notes/`

- Route `/notes` and `/notes/:pageId` (add to `App.tsx`; wire the **already
  present but inert** `RailBtn title="Notes"` in `AppRail.tsx` → `nav('/notes')`,
  with `active` state).
- **Page tree sidebar** (contextual sidebar slot): nested pages, expand/collapse,
  create child, rename inline, drag-to-reorder/re-nest (reuse the sidebar
  long-press/drag patterns already built for calendars where sensible), icon
  (emoji) picker reusing the event editor's emoji picker.
- **Page view** (canvas): icon + title (borderless, prominent — same pattern as
  the event editor title), breadcrumb of ancestors, the `BlockEditor`, and a
  **Linked panel** (backlinks) at the bottom.
- **Trash** view with restore; soft-delete with a confirm dialog reusing the
  `.scope-prompt`/`.scope-card` overlay (as the calendar delete does).

### 5.3 Calendar integration — the headline

- **Split view.** `Calendar.tsx` gains an optional right pane driven by
  `openNotePageId` state. Layout becomes **grid | drag-divider | editor**;
  divider width persisted to `localStorage`. Under 640px the editor is a
  **full-screen sheet** (reuse the existing slide-over/bottom-sheet pattern),
  never a side-by-side split.
- **Trigger.** In `EventEditor`, the existing **Notes** connection card gains an
  "Open note" action. On **Save** with Notes enabled and no page yet linked:
  call `POST /api/events/{id}/note`, then set `openNotePageId` and dismiss the
  event editor — the note opens beside the grid. If a page is already linked,
  Save just re-opens it.
- **Linked panel in the event editor**: list `GET /api/events/{id}/links`
  (notes now, other modules later) with open buttons, plus "New linked note".
- **Mentions bridge**: `[[` can mention events as well as pages; selecting an
  event inserts an `event_mention` and writes a `Link`. Clicking an event
  mention navigates to that day and opens the event.

### 5.4 Design & visual rules (required)

- Follow `docs/design/STYLE_GUIDE.md` tokens (already in `styles.css`): Inter/JetBrains
  Mono, 4px spacing, 2–12px radius, 120–200ms motion, **shadows only on
  overlays**, cyan accent for interactive states only.
- Match the **Design Canvas** (`docs/design/design-canvas/Second Brain.dc.html`)
  for editor chrome, page tree, and block styling — read it during the visual
  pass (per web `AGENTS.md`).
- **KaTeX** CSS themed to the tokens (text colors from `--text-*`), not KaTeX
  defaults. Tables use `--border`/`--border-grid`, header row on `--bg-raised`.
- Accessibility: semantic headings, visible focus rings, keyboard support for
  the slash menu and mention popover, ≥44px touch targets on mobile.

### 5.5 Notes settings — list marker schemes

Enable the existing `/settings/notes` navigation item and add a small Notes
settings panel for editor-wide list defaults.

- **Bullet list style**: choose `Disc` (default), `Circle`, `Square`, or `Dash`.
- **Numbered list style**: choose `Decimal` (default), `Lower alpha`,
  `Upper alpha`, `Lower Roman`, or `Upper Roman`.
- Show a short live preview beside each control so the marker is visible before
  saving; labels must remain textual and not rely on the marker alone.
- Persist the choices with the existing user Settings API as
  `notes_bullet_style` and `notes_numbered_style`. Validate values on the API;
  unknown values fall back to `disc` and `decimal`.
- Apply both choices to every `BlockEditor` surface: standalone Notes pages and
  event-attached note panes. A settings change updates open editors immediately.
- Implement presentation with editor-root data attributes and native CSS
  `list-style-type`; do not rewrite Tiptap document JSON. The `Dash` option may
  use a `::marker` rule because CSS has no portable dash `list-style-type`.
- The selected style applies at every nesting depth. Per-list and per-depth
  overrides are out of scope until a real use case requires them.

Verification: changing either setting updates existing lists without modifying
their saved content, survives reload, works in dark and light themes, and keeps
list semantics intact for assistive technology.

### 5.6 Future editor controls and permanent deletion

> STATUS 2026-07-03: **all items below are implemented** (history 0022–0025).
> Link-existing-note → 0022; dropdowns/popovers/grip → 0023 + finished properly
> in 0025 (portalled Popover primitive); highlight/block color, code-block
> language, permanent deletion, trash rework, pane header, create-type prompt
> → 0025.

These are approved future Notes improvements, not part of the current link-toolbar
implementation:

- **Link existing note in connections card**: the event editor's Notes connection
  card currently only creates a new note page. Add an option to link an existing
  page instead, using the same search-and-select pattern already inside the
  "Linked" fieldset (the `event-link-search` input). The connection card should
  show two modes: **"Create new"** (current, creates a fresh Page + Link) and
  **"Link existing"** (search existing pages by title, select one, writes a
  `Link` row without creating a page). This way the user can connect an existing
  note to an event directly from the connection card without opening the "Linked"
  section.

- **Text highlight and block color**: add selection-toolbar controls for a text
  highlight mark and a block background attribute. Use a small, design-approved,
  token-backed palette shared by dark and light themes; do not accept arbitrary
  colors in the first version. Store the selected value in Tiptap JSON so it
  survives reload and copy/paste.
- **Code-block language**: add a language selector to code blocks, persist the
  language as a code-block attribute, show the active language in the block, and
  apply syntax highlighting. Reuse an installed highlighter if one exists when
  implemented; otherwise request dependency approval before adding one. Plain
  text remains the default and unsupported languages fall back safely.
- **Permanent note deletion**: add `Permanently delete` to Trash only, behind an
  explicit irreversible confirmation. Add an ownership-scoped hard-delete API
  that removes the selected page subtree and its graph links in one transaction.
  Restore remains the primary action; permanent deletion must never appear on an
  active note.
- **Center drag handle on block height**: the block gutter's drag-to-move
  button (`.notes-block-grip`) should be vertically centered within each block's
  rendered height, not pinned to a fixed offset. Use `position: absolute; top: 50%;
  transform: translateY(-50%)` inside a positioned block-wrapper so the grip
  follows blocks of any height (single-line text, multi-line paragraphs, nested
  lists, code blocks, etc.). On touch devices the grip remains hidden (the slash
  menu covers insertion/reordering); this only affects pointer/hover devices.
- **Popover clipping and overflow**: several popovers clip incorrectly or overflow
  the viewport because they use hardcoded `left: 0` / `right: 0` positioning:
  - Sidebar page context menu (`.calendar-menu`) — `position: absolute; left: 0;
    right: 0` stretches to the sidebar row width. If the sidebar is narrow or the
    card content is wider than the row, the menu overflows without visible overflow
    handling. Fix: use `min-width: max-content` on the card, cap it with
    `max-width: min(320px, 90vw)`, and add `overflow: hidden auto` so the menu
    sizes to its content rather than the row.
  - Database property config popover (`.notes-property-config`) — `left: 0` anchors
    to the column header's left edge. If the column is near the right edge of the
    table, the popover extends beyond the viewport. Fix: use `left: auto; right: 0`
    or a `positional` utility that flips the popover when it would overflow, plus
    `max-width: min(320px, 90vw)`.
  - Cell popovers (`.notes-cell-popover`) in database table rows — same `left: 0`
    issue. If the cell is near the right viewport edge (especially on mobile), the
    popover clips. Fix: wrap each popover in a portal to `document.body` with
    dynamic position calculation (or at minimum add a `right: 0` fallback and
    `max-width: min(300px, 90vw)`).
  - Cover picker popover (`.notes-cover-picker`) — positioned with
    `right: 10px; bottom: 46px` relative to the cover banner, with a fixed
    `width: 260px` and no viewport-aware sizing. On narrow viewports or when the
    cover banner is near the edge of the `.notes-page` container (which caps at
    `720px`), the popover overflows the right side. Fix: change to
    `max-width: min(260px, 90vw)` and reposition using `left: auto; right: 10px`
    with a `transform: translateX(0)` fallback, or wrap in a portal that keeps
    it visible. Also add `overflow: hidden auto` to handle tall URL inputs
    without breaking the layout.
- **Custom dropdown UI for all selects**: the project currently uses 9 native
  `<select>` elements across the notes and calendar modules. These render with
  the OS-native widget, which looks inconsistent with the custom UI language
  (rounded cards, cyan accents, monospace labels). Replace all of them with a
  shared custom dropdown component using the existing popover/card pattern:
  - **Page type selector** (notes `Sidebar.tsx` — Page / Database / Folder).
  - **Property type selector** (database `PropertyConfig.tsx` — Text, Number,
    Select, Multi-select, Date, Checkbox, URL, Relation).
  - **Select cell value** (database `PropertyCell.tsx` — picks from property
    options).
  - **Date property picker** (database `CalendarView.tsx` — which date property
    drives the calendar view).
  - **Group-by picker** (database `BoardView.tsx` — which select property
    groups the Kanban columns).
  - **Finance type** (calendar `EventEditor.tsx` — Expense / Income).
  - **Meal type** (calendar `EventEditor.tsx` — Breakfast / Lunch / Dinner /
    Snack).
  - **Reminder timing** (calendar `EventEditor.tsx` — None / 5min / 15min /
    30min / 1hr / 1day).
  - **Recurrence frequency** (calendar `EventEditor.tsx` — Daily / Weekly /
    Monthly / Yearly).

  The shared component should:
  - Render a trigger button that shows the selected value (styled like a
    `.cal-field` input) and a chevron icon.
  - Open a portalled popover (`.cal-card` / `.notes-cell-popover` pattern)
    anchored to the trigger, with each option as a clickable row.
  - Support keyboard navigation (arrow keys, Enter to select, Escape to close).
  - Accept the same shape of props: `options: Array<{value, label}>`,
    `value`, `onChange`, `ariaLabel`, optional `className`.
  - Reuse the existing animation (`popIn 120ms`), border-radius tokens, and
    color tokens. No new visual language.

  Defer to when a dedicated UI pass is done for the database module, since
  most native selects live in database views.
- **Split-view pane header**: the calendar split-view note pane
  (`.notes-pane`) currently has only a sticky close button (`×`) floating at
  the top-right with nothing balancing the top area. Add a sticky header bar
  with:
  - The note's **title** on the left (truncated, clickable to open full page).
  - A small **breadcrumb** of ancestors above or beside the title.
  - An **"Open in full page"** icon button on the right (next to the close
    button) that navigates to `/notes/{pageId}` in the main Notes area.
  - A **linked event indicator** showing which event the note is attached to
    (if any), styled as a small chip with the event's icon and title.
  The header should use the same visual language as the calendar topbar
  (`.cal-topbar`) — compact, with a subtle bottom border.
- **Create page type prompt**: the "New page" button in the topbar and sidebar
  heading currently creates a page with a hardcoded type (`page`). Instead, show
  a small popover (reusing the `.notes-cell-popover` or `.cal-card` pattern) with
  three options — **Page**, **Folder**, **Database** — each with a short description,
  and create the page with the selected type. The empty-state "New page" button
  should also trigger the same prompt. This matches how Notion and similar tools
  handle creation.
- **Delete/trash UI rework**: the current delete flow uses the generic
  `ConfirmDialog` component (`.scope-prompt` / `.scope-card`), which is bare-bones.
  Improve it with:
  - A **trash-first** model: the primary action is "Move to trash" (already
    implemented), but show a clearer explanation of what happens to child pages
    and linked events. Use the `.scope-options` pattern with a single prominent
    action button rather than a two-button confirm/cancel layout.
  - A **restore confirmation** when restoring from trash — just a toast, not a
    dialog, since restore is safe and reversible.
  - A **permanent delete** action inside the trash view only (not on active notes),
    using a two-step confirm: first click marks the item (visual highlight), second
    click executes. This prevents accidental permanent deletion while keeping the
    flow fast for intentional use.

Verification: highlight/block colors remain readable in both themes, code blocks
retain their selected language, and permanent deletion removes pages, descendants,
and links without affecting another user's data.

---

## 6. Edge cases to decide now

1. **Autosave conflicts** — single user, single tab assumed; last-write-wins on
   `PATCH`. No OT/CRDT (`# ponytail: LWW; revisit only if multi-tab editing
   becomes real`).
2. **Deleting a page that's mentioned** — keep the `Link` rows; the mention node
   renders as "Untitled/(deleted)" and the backlink resolver skips trashed
   targets. Don't cascade-delete edges on soft delete.
3. **Deleting an event with a linked note** — the note **Page survives**
   (it's real content); only the `Link` is removed. Surface this in the event
   delete confirm ("its note will be kept in Notes").
4. **Empty note** — a note created from an event but left empty is fine; show an
   empty-state placeholder, don't auto-delete.
5. **Heading toggle hover affordance** — the current hover/latch experiment was
   rejected. Rework the heading toggle and drag lane together in a later notes
   pass instead of layering more CSS on top of the current behavior.

---

## 7. Sub-phases & verification

Ship in order; each ends green on `npm run check` / `check:api`.

| # | Status | Scope | Done when |
|---|---|---|---|
| N1 | ✅ done (0010–0011; landed as migration 010) | `Page` model + migration; `notes.py` pages CRUD, soft delete/restore, backlinks, search; tests | API tests pass; pages persist and isolate by user |
| N2 | ✅ done (0010, 0015–0017, 0024) | `BlockEditor` with StarterKit + tasks + tables + KaTeX + placeholder; slash menu + selection toolbar, token-styled | Renders/edits all block types; inline & block LaTeX render; `npm run check` green |
| N3 | ✅ done (0010, rebuilt to calendar parity) | `/notes` route + rail wiring; page tree sidebar; page view (title/icon/breadcrumb/editor); trash; autosave | Create/nest/rename/delete/restore pages; edits autosave |
| N4 | ✅ done (0010, reworked in 0022 with folders + Linked card) | Split view in `Calendar.tsx`; `POST /events/{id}/note`; event Linked panel; `[[` mentions (page+event) → `Link`; backlinks panels | Saving an event-with-note splits desktop / full-screen mobile; mentions create edges; backlinks show both directions |
| N5 | ✅ done (0010, 0012–0014, 0023, 0025) | Polish: empty states, "Saved" affordance, keyboard/a11y, responsive sheet, motion, design-canvas fidelity pass | Matches design system; a11y checks pass |
| N6 | ⬜ **not started — the only open item** | Notes settings: bullet and numbered-list schemes, live previews, Settings API persistence | Existing lists restyle without content changes; preferences survive reload and apply to standalone/split editors |
| N7 | ✅ done (0025) | Editor formatting: text highlight, block colors, and code-block language selection | Formatting persists in Tiptap JSON; palette is theme-safe; unsupported code languages fall back to plain text |
| N8 | ✅ done (0025) | Trash lifecycle: permanent page-subtree deletion and link cleanup | Irreversible confirmation is required; ownership tests pass; no orphaned page links remain |

---

## 8. Explicitly out of scope (future phases)

> 2026-07-03 update — much of this list has since shipped:
> **built** — databases (properties/records-as-pages/table/list/board/gallery/
> calendar views, 0019+0021), templates (0020), cover images (preset
> gradients + URL, 0020; uploads pending the files service).
> **planned in Plan E** — image blocks + MinIO uploads, bookmark/embed
> cards, table controls, multi-column layout.
> **still future** — spreadsheet/formula blocks (HyperFormula approval
> pending), Google/notes sync, AI capture, semantic (pgvector) search,
> multi-user/workspaces, filter-editing UI for database views, board drag
> on touch.

Each extends this foundation without redesign — the
`Link` table and one-editor/one-storage decisions are what keep that true.

---

## 9. Open risks

- **Math extension choice** — verify a single Tiptap extension gives both inline
  and block KaTeX with clean serialization before committing; swap if not.
- **Mention reconcile churn** — delete-and-reinsert on every save is simplest;
  if it causes noticeable write load, diff instead.
- **Split-view + existing calendar gestures** — ensure the divider drag and the
  grid's own pointer gestures (move/resize/pinch) don't fight; the divider is
  its own pointer-captured element, and the grid keeps its column width logic.
