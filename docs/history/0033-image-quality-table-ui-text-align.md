# 0033 — Image quality cap, table UI rework, block text alignment

Date: 2026-07-03
Status: accepted

## What changed

**Images never lose quality**
- Upload/storage already keeps original bytes untouched; the only lossy step
  was display: `width: 100%` blocks stretched small images past their native
  resolution. The image NodeView now reads `naturalWidth` on load and caps
  the block's `max-width` at it — images render at most 1:1, never upscaled.

**Tables**
- Replaced the table NodeView + edge "+" buttons with a floating toolbar
  (`TableToolbar.tsx`) that appears above the table's right edge only while
  the caret is inside it — `.cal-card`-style surface, `popIn` motion, icon
  buttons for add/delete row/column, header toggle, delete table.
- Dropping the NodeView restores prosemirror-tables **native column
  resizing** (`resizable: true`): drag any cell edge; the handle renders as
  an accent guide. Row heights follow their content (row-height dragging is
  not supported by prosemirror-tables; deferred until really needed).
- Tables now size to their columns (`width: auto`, `table-layout: fixed`,
  min 320px) and sit **horizontally centered**; the wrapper scrolls when a
  table outgrows the page column. Cell selection tints with `--accent-tint`.

**Block text alignment**
- New `TextAlignExtension.ts` — hand-rolled `textAlign` attribute on
  paragraphs and headings, serialized as inline `text-align` (same shape as
  the official @tiptap/extension-text-align, so documents stay compatible if
  it's ever adopted). Left is the default and stored as null.
- Four new selection-toolbar buttons: align left / center / right / justify,
  with pressed states.

## Why

User requests: images must not lose quality; the table add-row/column
buttons "felt weird" and didn't match the app style; tables should center
and be resizable; text blocks need alignment controls like images have.

## Files touched

- `apps/web/src/modules/notes/editor/ImageNode.tsx` — naturalWidth cap
- `apps/web/src/modules/notes/editor/TableToolbar.tsx` — new floating
  toolbar (replaces deleted `TableNodeView.tsx`)
- `apps/web/src/modules/notes/editor/TextAlignExtension.ts` — new alignment
  attribute + `setTextAlign` command
- `apps/web/src/modules/notes/editor/BlockEditor.tsx` — stock resizable
  Table, TextAlign registered, toolbar overlay rendered, align buttons in
  the BubbleMenu
- `apps/web/src/modules/notes/notes.css` — centered/auto-width tables,
  column-resize handle + cursor + selectedCell styles, `.notes-table-toolbar`
  (edge-button CSS removed)

## How the pieces connect

The TableToolbar is an overlay inside `.notes-editor` (like the slash menu),
not a NodeView — that distinction is what keeps prosemirror-tables' own
table view (colgroup management, column resizing) intact. It listens to
editor transactions, walks the selection's ancestors for a `table` node, and
positions itself from `view.nodeDOM(tablePos)`. Text alignment is a global
attribute like `BlockColor` in `ColorExtensions.ts`; the bubble-menu buttons
call `setTextAlign`, which maps left→null so untouched documents stay clean.

## How to modify this later

- **Row-height dragging**: would need a custom `height` attr on `tableRow`
  plus pointer handles — start from the image grip pattern.
- **More alignable node types**: add the type name to the `types` array in
  `TextAlignExtension.ts` `addGlobalAttributes` and to `setTextAlign`.
- **Toolbar placement**: transform/offsets in `.notes-table-toolbar`;
  position math in `TableToolbar.tsx` `update()`.
- **Image upscaling**: if intentional upscaling is ever wanted, remove the
  `maxWidth: naturalWidth` cap in `ImageBlockView` — quality loss returns.
