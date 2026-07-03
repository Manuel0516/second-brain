# 0025 — Notes batch: popover primitive, drag depth, collapsible headings, §5.6 completion

Date: 2026-07-03
Status: accepted

## What changed

**Popover primitive (root of the batch)** — new `src/components/Popover.tsx`:
portalled to `<body>`, fixed-position, measured against its real rendered size
(no estimated heights), flips above the anchor when it would overflow, clamps
to both viewport axes, supports start/end alignment, repositions on
scroll/resize, and closes on outside pointerdown or Escape. Position is applied
by direct style mutation (coordinates are data; visuals live in the `.popover`
class in styles.css).

Consumers migrated onto it (finishing the 0023 pass properly):

- `Dropdown.tsx` reworked — actually portalled now (0023's claim was aspirational),
  all inline styles moved to `.dropdown-*` classes, keyboard nav preserved.
- `PropertyConfig` (extracted `PropertyHeader` in TableView owns the anchor ref),
  `PropertyCell` multi-select/relation popovers, DatabasePage's view-add menu.
- New `CreatePageMenu.tsx` — every "New page" button (topbar, empty state,
  sidebar +) now asks Page / Folder / Database.
- FolderPicker migrated from native select to Dropdown (by hand, same pass).
- Block grip: `placement: 'left-start'` + one-line-height gutter, centered on
  the first text line; `grabbing` cursor.
- Calendar and notes sidebar edit cards plus the page cover picker now use the
  same portalled primitive. Sidebar cards match their row width, cover cards
  align to the trigger, and crowded card actions wrap instead of overflowing.

**Sidebar tree drag — gap-based depth**: dropping between two rows now allows
a RANGE of depths (below row's depth … above row's depth + 1) picked by
pointer x; a plain vertical drag keeps the target's level, a deliberate
rightward drag nests, leftward out-dents (fully left in an open gap = root).
The old x-threshold "inside" branch — the cause of accidental depth changes —
is gone. The insertion line indents live (`--drop-depth-indent`). `move()`
now delegates to a shared `placeAt(id, parentId, index)`.

**Per-line list blocks**: DragHandle `nested={{ allowedContainers:
['bulletList','orderedList','taskList'] }}` — each list line is its own
draggable block; near the list's left edge the handle still grabs the whole
list. The gutter "+" inserts a sibling list item when hovering a line.

**Collapsible headings (details block removed)**: `@tiptap/extension-details`
uninstalled (its toggle button never rendered and the model was wrong for the
user). New `editor/CollapsibleHeading.ts`: every h1–h3 carries a persisted
`collapsed` attribute and a hover chevron (widget decoration); collapsing
hides all following top-level blocks until the next same-or-higher heading
(node decorations recomputed fresh per state — no DecorationSet mapping).
Editing into a hidden range auto-expands via `appendTransaction`.
`editor/migrateContent.ts#stripDetails` rewrites stored docs containing
details nodes (summary → h3, content unwrapped) at load time — mandatory,
TipTap throws on unknown nodes. Known limit: dragging a collapsed heading
moves only the heading, not its hidden section.

**Highlight + block color** (`editor/ColorExtensions.ts`, dep
`@tiptap/extension-highlight`): 4 semantic colors (accent/warm/neutral/
contrast) stored as names in doc JSON, rendered via token `color-mix` CSS in
both themes (no raw colors in documents — the stock inline-style rendering is
overridden). BubbleMenu gained a colors button with Text/Block swatch rows;
block background is a `blockColor` global attribute on paragraphs/headings.

**Code-block languages** (deps `lowlight` + `@tiptap/extension-code-block-lowlight`):
StarterKit's codeBlock replaced by `editor/CodeBlockView.tsx` — a NodeView
with a language Dropdown header (16 curated languages) and hljs classes
mapped to existing tokens.

**Permanent deletion**: backend `_purge_pages()` extracted from the 30-day
trash purge and reused by new `DELETE /api/pages/{id}/permanent` (owner-scoped,
409 unless trashed, purges subtree + links + database schema in one
transaction). TrashView gained a two-step "Delete forever" (arm → confirm,
3s auto-disarm) and an explanatory hint; restore and permanent delete show a
minimal toast (one state + timeout in Notes.tsx — deliberately not a toast
framework).

**Split-view pane header**: NotesPagePane has a sticky header — breadcrumb +
clickable title, linked-event chip (via backlinks), open-in-full-page button
(`Calendar.tsx` passes `onOpenFull` → `/notes/{id}`), and the close button.

> Post-ship fix (same day): the auto-expand `appendTransaction` also fired on
> TipTap's programmatic `setContent` sync (which parks the selection at the
> doc end), silently un-collapsing sections on load and persisting that via
> autosave. It now ignores transactions carrying `preventUpdate` meta.
> Verified headlessly in a real browser (chromium): `data-collapsed` survives
> load, hidden blocks stay hidden, API round-trips the attribute.

## Why

User batch: tree drops forced depth changes; lists dragged as one block; the
toggle block was broken and wrong-shaped; and the remaining §5.6 items of
`docs/work/plans/NOTES_MODULE_PLAN.md` (plus redoing the 0023 areas). A
follow-up request identified that the remaining sidebar and cover cards were
still clipped by their scroll containers and could overflow their narrow card.

## Files touched

- `apps/web/src/components/{Popover,Dropdown,FolderPicker}.tsx`, `src/styles.css` (popover/dropdown classes)
- `apps/web/src/modules/notes/{Sidebar,Notes,TrashView,NotesPagePane,CreatePageMenu,api}.tsx/.ts`
- `apps/web/src/modules/notes/{CoverPicker,PageView}.tsx` and
  `apps/web/src/modules/calendar/Sidebar.tsx` — portalled anchored cards
- `apps/web/src/modules/notes/database/{TableView,PropertyConfig,PropertyCell,DatabasePage}.tsx`
- `apps/web/src/modules/notes/editor/{BlockEditor,CollapsibleHeading,migrateContent,ColorExtensions,CodeBlockView}.tsx/.ts`
- `apps/web/src/modules/notes/notes.css` — drop-hint line, collapse chevron, palette, codeblock, pane header, toast, trash actions
- `apps/api/app/routes/notes.py` — `_purge_pages`, permanent endpoint
- Tests: `Sidebar.test.tsx` (depth hints + nest), `BlockEditor.test.tsx` (stripDetails, collapse), `tests/test_notes.py` (permanent delete)
- Deps: + `@tiptap/extension-highlight`, `@tiptap/extension-code-block-lowlight`, `lowlight`, `@tiptap/extension-heading` (explicit); − `@tiptap/extension-details`

## How the pieces connect

`Popover` is the one floating-panel primitive; Dropdown, the database
popovers, and CreatePageMenu are thin consumers, so viewport behavior is
fixed in exactly one place. In the tree, `dropTargetAt` is the single source
of truth for both the live hint and the drop (`placeAt`), so the indented
line always shows the real outcome. In the editor, collapse is decoration-
only (the doc keeps hidden blocks; the heading attribute is the state),
which is why persistence and undo work for free.

## How to modify this later

- Popover placement rules: `reposition()` in `Popover.tsx`.
- Drag depth feel: the pointer-depth formula and clamps in `dropTargetAt`.
- Collapse scope (e.g., h4): `CollapsibleHeading.configure({ levels })` +
  the CSS heading selectors.
- More highlight colors: extend `COLOR_NAMES` + one CSS rule per name (both
  mark- and block- variants).
- More code languages: the `LANGUAGES` list in `CodeBlockView.tsx` (must be
  in lowlight's `common` bundle or registered manually).
