# 0027 — Notion-style block drag and color palette polish

Date: 2026-07-03
Status: accepted

## What changed

- Restored drag handles for top-level note blocks while retaining independent
  dragging for nested list items.
- Gave headings and list items separate gutter lanes so add/drag controls no
  longer overlap heading toggles, bullets, numbers, or task checkboxes.
- Centered the add/drag gutter vertically against every block height through
  the drag handle's native floating placement.
- Collapsed headings now drag their entire hidden section through the next
  peer heading, while expanded headings remain ordinary single blocks.
- Replaced layout-changing selection padding with a shadow-spread drag surface
  that provides visual breathing room without moving document text.
- Reworked the highlight and block-background palette into two clearly
  labelled sections with accurate previews, active states, larger targets, a
  cleaner remove control, and outside-click dismissal.
- Made block backgrounds target the paragraph or heading containing the cursor,
  including paragraphs nested inside lists.

## Why

Restricting TipTap nested drag targets to list containers also filtered out all
top-level blocks, making their handles disappear. The color palette did not
show the selected value, used identical previews for different intensities,
and did not close reliably. The first drag fix still let the floating gutter
occupy the same lane as list markers and heading toggles, and dragging a
collapsed heading left its hidden section behind.

## Files touched

- `apps/web/src/modules/notes/editor/BlockEditor.tsx` — fixes drag targeting and
  updates color selection behavior and markup.
- `apps/web/src/modules/notes/editor/BlockEditor.test.tsx` — verifies block
  colors inside nested list items.
- `apps/web/src/modules/notes/editor/ColorExtensions.ts` — owns the reusable
  selected-block color command.
- `apps/web/src/modules/notes/editor/CollapsibleHeading.ts` — exposes the
  collapsed section range and prepares it as one drag selection.
- `apps/web/src/modules/notes/notes.css` — styles the revised token-based color
  palette and accurate text/block previews.

## How the pieces connect

TipTap's shared `DragHandle` uses explicit scoring for root blocks and list
items. Before a collapsed heading drag starts, its decoration plugin selects
the heading plus its hidden range so TipTap moves the section as one slice.
The gutter receives the active node type to choose a non-overlapping CSS lane.
The selection toolbar reads the active highlight and current block attribute,
while `setSelectedBlockColor` updates the deepest paragraph or heading.

## How to modify this later

Change drag scoring through `DRAG_NESTED_CONFIG` in `BlockEditor.tsx`; do not
add `allowedContainers` unless root-level fallback is separately preserved.
Heading section boundaries come from `collapsedHeadingRange`. Gutter lane and
drag-preview spacing live in `notes.css`. Add semantic colors in
`ColorExtensions.ts`, then add matching rendered and swatch rules.
