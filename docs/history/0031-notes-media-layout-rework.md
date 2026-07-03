# 0031 — Notes media & layout rework: drag-to-column, image controls, table fix

Date: 2026-07-03
Status: accepted

## What changed

Cleaned up and reworked the Plan E implementation (0030) after review found
real defects, not just rough UI:

**Columns are now built from blocks by dragging (the requested behavior)**

- Dragging a block onto the left/right edge of another top-level block wraps
  both into a `columnList` of `column` nodes; dropping on the edge of an
  existing layout adds a third column (cap 3). A vertical accent bar previews
  the drop zone (the default horizontal dropcursor is hidden meanwhile).
- Fixed `setColumnLayout` (slash `/2 columns`): it previously *inserted a
  copy* of the current block into a new layout without removing the original
  (duplication). It now replaces the block in place and puts the caret in the
  new empty column.
- Fixed the normalizer: it previously **deleted the whole columnList with its
  content** when a layout dropped to one column (data loss). It now lifts the
  content back to top level, flattens accidentally nested layouts, and
  dissolves empty columns unless the caret is inside them.
- `columnList` content changed `column{2,3}` → `column{1,3}` so removing a
  column stays schema-valid for the one transaction the normalizer needs.
- Drag handle rules updated so blocks *inside* columns are individually
  draggable (previously hovering them targeted the whole layout);
  duplicate/delete-block and the slash gutter work at column depth.

**Images**

- `ImageNode.ts` → `ImageNode.tsx`: React NodeView with a width drag grip
  (committed on pointer-up, one undo step) and hover-revealed align
  left/center/right buttons — the controls the plan specified but 0030 skipped.
- Paste handles multiple images and screenshots; drop inserts at the drop
  position (`posAtCoords`) instead of wherever the caret was.
- All uploads go through one `uploadImageFile()` helper using `apiCall`
  (token refresh), replacing three copies of raw `fetch`.

**Tables**

- **Bug:** the table NodeView rendered `NodeViewContent` as a `<div>`, so
  rows rendered inside a div — no real `<table>` element existed in the DOM.
  This also broke the editor test suite ("pre-existing jsdom failure" in
  0030 was actually this regression). Fixed with `<NodeViewContent as="table">`.
- Column resizing (`resizable: true`) removed — it needs the stock table
  view's colgroup management, which the controls NodeView replaces; it had no
  styled handles before, so nothing usable was lost (ponytail note in code).
- The controls toolbar now floats above the table as a hover overlay instead
  of reserving an always-present chrome row.
- Deleted the dead `createTableBubbleMenuItems` fallback (with its
  `eslint-disable any`).

**Bookmarks**

- Remove button used `deleteSelection` (no-op for an unselected atom node);
  now uses the NodeView's `deleteNode`.
- `new URL(url).hostname` crash on malformed URLs guarded.
- Paste-URL failure path previously swallowed the paste entirely (prevented
  default, inserted nothing); now always inserts a fallback card.
- Card restyled to the style guide: resting shadow removed (shadows are for
  overlays only), `--bg-raised` hover, `overflow: hidden` so the thumbnail
  respects the card radius.

**Tests**

- New `ColumnNodes.test.ts`: slash creation without duplication + caret
  placement, edge-drop creates a 2-column row, third column append, and
  dissolution preserving content.

## Why

User review of 0030: paste-to-image and columns didn't behave as requested —
columns had to be "a double column of blocks … that appears when I drag to
the right a new block", not a block containing columns — and the UI needed
cleanup to match the project style. Investigation also surfaced the data-loss
normalizer, the duplication bug, and the broken table DOM.

## Files touched

- `apps/web/src/modules/notes/editor/ColumnNodes.ts` — drag-to-edge target
  detection (`getColumnDropTarget`), drop transaction (`applyColumnDrop` /
  `handleColumnDrop`), fixed `setColumnLayout`, safe normalizer
- `apps/web/src/modules/notes/editor/ColumnNodes.test.ts` — new regression
  tests for the above
- `apps/web/src/modules/notes/editor/ImageNode.tsx` — replaced `ImageNode.ts`;
  NodeView with width/align controls, `uploadImageFile` helper
- `apps/web/src/modules/notes/editor/BookmarkNode.tsx` — `fetchBookmarkMeta`
  helper, `deleteNode` removal, hostname guard
- `apps/web/src/modules/notes/editor/TableNodeView.tsx` — real `<table>`
  content element, dead code removed
- `apps/web/src/modules/notes/editor/BlockEditor.tsx` — rewritten paste/drop
  handlers (multi-image, drop position, column edge-drop), drop indicator
  overlay, column-aware drag rules and block helpers, slash items on the
  shared helpers, table resizing off
- `apps/web/src/modules/notes/notes.css` — image NodeView styles (`.notes-image*`),
  floating table toolbar, column drop indicator, bookmark restyle

## How the pieces connect

`BlockEditor`'s `editorProps.handleDrop` is the dispatcher: image files →
upload + insert at `posAtCoords`; internal block moves (`moved && slice`) →
`handleColumnDrop`, which asks `getColumnDropTarget` whether the pointer is
in a ~56px edge band of a top-level block and, if so, replaces that block
with `columnList(column(target), column(dragged))` in one transaction
(deleting the dragged source via the drag's node selection). A `dragover`
listener in BlockEditor calls the same `getColumnDropTarget` to position the
`.notes-column-drop-indicator` overlay, so preview and drop can never
disagree. The ColumnList `appendTransaction` normalizer is the safety net
that keeps layouts sane after any edit (drags out, deletes, pastes).

## How to modify this later

- **Edge zone size / column cap**: `EDGE_ZONE` and the `childCount >= 3`
  check in `ColumnNodes.ts` `getColumnDropTarget`.
- **Column widths**: equal-width flex only; add a `width` attr on `column`
  plus a divider drag, mirroring the image grip pattern.
- **Empty-column lifetime**: the normalizer dissolves an empty column once
  the caret leaves it. To make empty columns persistent (full Notion parity),
  drop the empty-column rule in the `appendTransaction` and dissolve only
  from `handleColumnDrop`.
- **Table column resizing**: needs a NodeView that renders and maintains a
  `<colgroup>` from cell `colwidth` attrs — see the ponytail note where
  `NotesTable` is registered in `BlockEditor.tsx`.
- **Image controls**: width bounds are clamped 20–100% in `ImageBlockView`'s
  `startResize`; alignment is pure CSS keyed off `data-align`.
