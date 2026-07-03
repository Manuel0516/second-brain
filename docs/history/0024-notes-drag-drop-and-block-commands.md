# 0024 — Notes drag-and-drop + block commands

Date: 2026-07-03
Status: accepted

## What changed

**Sidebar tree drag (Sidebar.tsx):**
- Mouse/pen: instant drag — no more 375ms hold; the drag arms after 6px of
  movement, so a plain click still opens the row ⋯ menu. Touch keeps the
  long-press (scroll-safe).
- Live drop indicator while dragging: an accent insertion line above/below the
  target row (`drop-before`/`drop-after`, inset box-shadow) or an accent tint
  when hovering to nest inside a page (`drop-inside`).
- The release-time target math was extracted into `dropTargetAt(x, y, id)`,
  now shared by the live hint (moveReorder) and the drop (finishReorder).

**Block drag polish (BlockEditor.tsx + notes.css):**
- StarterKit's bundled drop cursor configured to the accent color (2px line
  showing where a dragged block will land).
- The drag handle's NodeSelection now renders as an accent ring + faint tint
  on the grabbed block (`.ProseMirror-selectednode`); grip shows `grabbing`.

**Slash menu expansion (BlockEditor.tsx):**
- Formatting commands: Bold, Italic, Strikethrough, Inline code, Link
  (via `normalizeHref`, now exported from LinkPopover; with a collapsed cursor
  the link inserts its URL as linked text).
- Heading 3.
- Toggle block — collapsible section via **new dependency
  `@tiptap/extension-details@^3.27.1`** (approved in the plan; matches the
  other 12 TipTap packages exactly). `Details`/`DetailsSummary`/
  `DetailsContent` registered; `/toggle` runs `setDetails()`.
- Callout — new `editor/CalloutNode.ts` (block node with a `data-emoji`
  attribute rendered via CSS `::before`; no NodeView).
- Duplicate block / Delete block — exported `duplicateBlock`/`deleteBlock`
  helpers acting on the top-level block at the cursor.
- The menu (now ~22 items) scrolls, and the keyboard highlight scrolls into
  view (`scrollIntoView({ block: 'nearest' })` effect).

## Why

User request: the page-tree and block drag-and-drop needed to feel direct and
visible, and every toolbar action should be reachable from the `/` command
menu.

## Files touched

- `apps/web/src/modules/notes/Sidebar.tsx` — dropTargetAt, activateDrag, isTouch branch, dropHint state/class.
- `apps/web/src/modules/notes/Sidebar.test.tsx` — split into mouse-drag (with drop-hint assertion), touch long-press, and plain-click-opens-menu tests.
- `apps/web/src/modules/notes/editor/BlockEditor.tsx` — dropcursor config, new slash items, details/callout extensions, duplicateBlock/deleteBlock exports, highlight scroll effect.
- `apps/web/src/modules/notes/editor/CalloutNode.ts` — new.
- `apps/web/src/modules/notes/editor/LinkPopover.tsx` — `normalizeHref` exported.
- `apps/web/src/modules/notes/editor/BlockEditor.test.tsx` — duplicate/delete block test.
- `apps/web/src/modules/notes/notes.css` — drop-hint classes, selected-node ring, grip cursor, callout + details styling.
- `apps/web/package.json` — `@tiptap/extension-details`.

## How the pieces connect

The tree drag has one source of truth for "where would this land":
`dropTargetAt` reads the DOM rows (`data-page-id`/`data-depth`) and returns
before/after/inside; `moveReorder` paints it as `dropHint`, `finishReorder`
feeds it to the existing `move()` renumbering. In the editor, the drop cursor
is ProseMirror's own (StarterKit), so no drag logic was added — only its
color; the dragged-block ring rides on the NodeSelection the drag-handle
extension already creates. Slash items all share the `{label, keywords, run}`
shape; `chooseSlash` deletes the typed `/query` before running, so
position-based commands (duplicate/delete) compute against the clean doc.

## How to modify this later

- New slash command: append to `slashItems` in BlockEditor.tsx — nothing else.
- Callout emoji picker: give `CalloutNode` a NodeView with a button that calls
  `updateAttributes({ emoji })`.
- Details styling (chevron rotation targets the extension's default
  `is-open` class): the `[data-type='details']` block in notes.css.
- Tree drop sensitivities: 6px mouse threshold in `moveReorder`, nest
  threshold `rect.left + 34 + depth * 14` in `dropTargetAt`.
