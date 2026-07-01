# Plan D — Notes / Pages (Phase 2), calendar-first

> Audience: implementing AI or developer. Self-contained build spec for the
> first Notes phase. Read order: this plan → `docs/product/NOTES_MODULE.md`,
> `docs/product/CALENDAR_MODULE.md §3`, `docs/product/ARCHITECTURE.md §4` →
> `docs/product/DESIGN_SYSTEM.md` + the Design Canvas
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

- Follow `DESIGN_SYSTEM.md` tokens (already in `styles.css`): Inter/JetBrains
  Mono, 4px spacing, 2–12px radius, 120–200ms motion, **shadows only on
  overlays**, cyan accent for interactive states only.
- Match the **Design Canvas** (`docs/design/design-canvas/Second Brain.dc.html`)
  for editor chrome, page tree, and block styling — read it during the visual
  pass (per web `AGENTS.md`).
- **KaTeX** CSS themed to the tokens (text colors from `--text-*`), not KaTeX
  defaults. Tables use `--border`/`--border-grid`, header row on `--bg-raised`.
- Accessibility: semantic headings, visible focus rings, keyboard support for
  the slash menu and mention popover, ≥44px touch targets on mobile.

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

---

## 7. Sub-phases & verification

Ship in order; each ends green on `npm run check` / `check:api`.

| # | Scope | Done when |
|---|---|---|
| N1 | `Page` model + migration 009; `notes.py` pages CRUD, soft delete/restore, backlinks, search; tests | API tests pass; pages persist and isolate by user |
| N2 | `BlockEditor` with StarterKit + tasks + tables + KaTeX + placeholder; slash menu + selection toolbar, token-styled | Renders/edits all block types; inline & block LaTeX render; `npm run check` green |
| N3 | `/notes` route + rail wiring; page tree sidebar; page view (title/icon/breadcrumb/editor); trash; autosave | Create/nest/rename/delete/restore pages; edits autosave |
| N4 | Split view in `Calendar.tsx`; `POST /events/{id}/note`; event Linked panel; `[[` mentions (page+event) → `Link`; backlinks panels | Saving an event-with-note splits desktop / full-screen mobile; mentions create edges; backlinks show both directions |
| N5 | Polish: empty states, "Saved" affordance, keyboard/a11y, responsive sheet, motion, design-canvas fidelity pass | Matches design system; a11y checks pass |

---

## 8. Explicitly out of scope (future phases)

Databases (properties/records-as-pages/filters/views incl. calendar-view),
spreadsheet/formula blocks, image/file blocks + MinIO uploads, templates,
cover images, Google/notes sync, AI capture, semantic (pgvector) search,
multi-user/workspaces. Each extends this foundation without redesign — the
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
