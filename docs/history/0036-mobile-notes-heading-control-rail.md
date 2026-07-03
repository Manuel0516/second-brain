# 0036 — Stable mobile notes heading controls

Date: 2026-07-03
Status: accepted

## What changed

Reworked the mobile notes gutter into a fixed control rail. Mobile pages now reserve a
44px left inset. Heading blocks keep the add button's space but hide the button, leaving
the drag grip and collapse toggle in stable adjacent lanes. Mobile gutter transforms no
longer animate. Block type changes update the gutter DOM attribute directly instead of
re-rendering the floating drag handle.
Transient null-node notifications during heading collapse now retain the last valid
gutter type so the heading drag grip stays in its rail.
Collapsed sections are selected on grip pointer-down, before native drag-start creates
its payload, so moving a collapsed heading carries its hidden blocks exactly once.
Collapse and expand lock TipTap's drag handle through the DOM-changing transaction, so
its built-in update hook recalculates the top position while widget replacement cannot
hide the same-node handle. The handle unlocks on the next animation frame.
When a collapsed range contains the document's final block, an invisible decoration
sentinel remains as the editor's measurable last element. This prevents TipTap's drag
target lookup from aborting on the hidden final block's zero-sized rectangle.
Heading toggles now use one plugin-level pointer handler instead of attaching a closure
to every recreated decoration widget. Toggling moves the editor selection onto that
heading, and auto-expand reacts only to actual selection changes. Multiple main headings
can therefore remain collapsed independently without stale hidden-content selections
reopening them.

## Why

The previous gutter changed its contents, width, and animated transform when the hovered
block type changed. Expanding or collapsing a heading could therefore reposition the
floating handle and push its drag grip beyond the viewport. Repeated pixel offsets did
not address that unstable layout.

## Files touched

- `apps/web/src/modules/notes/editor/BlockEditor.tsx` — updates the gutter's
  `data-node-type` without a React state change and selects collapsed sections before
  drag-start.
- `apps/web/src/modules/notes/editor/CollapsibleHeading.ts` — keeps the drag handle locked
  and positionable through collapse/expand, adds the end-of-document measurement
  sentinel, centralizes toggle events, and prevents selection auto-expand races.
- `apps/web/src/modules/notes/notes.css` — provides the invisible measurable dimensions
  used by the end-of-document drag sentinel.
- `apps/web/src/modules/notes/editor/BlockEditor.test.tsx` — verifies that the collapsed
  drag selection contains the complete section exactly once and that multiple main
  headings toggle independently through repeated use.
- `apps/web/src/modules/notes/notes.css` — adds the fixed mobile control rail, stable
  heading/list positioning, and smaller heading glyphs.

## How the pieces connect

TipTap's drag-handle extension positions `.notes-block-gutter` beside the active block.
`BlockEditor.tsx` records that block type on the gutter element. Mobile CSS uses the type
only to hide the heading add button and move the fixed-width rail one control lane left;
the element's width never changes, so Floating UI keeps the same reference geometry.
The heading toggle remains a ProseMirror widget positioned in the lane nearest the text.
When collapse temporarily reports no active node, the existing type is intentionally
kept until the drag handle identifies another real block.
The grip's pointer-down selection happens before the drag extension serializes its
payload; the later drag-start callback only adds visual feedback.
The shared pointer handler reads the current heading position from the widget DOM and
the current collapsed value from the document, so it does not retain stale closures.
Moving selection onto the toggled heading keeps it outside newly hidden ranges.
The temporary `lockDragHandle` transaction metadata uses TipTap's supported lifecycle:
it prevents widget `mouseleave` from hiding the handle while the document update
repositions it, then restores normal hover behavior on the next frame.
The sentinel is a ProseMirror decoration, not saved note content. Keep it measurable
because TipTap validates both the first and last editor child rectangles before resolving
any hovered drag target.

## How to modify this later

Keep the mobile gutter width invariant across block types. Adjust the `.notes-page` left
padding and heading gutter translation together if control sizes change. Do not switch
the hidden heading add button to `display: none`, add a transform transition on mobile,
or put the hovered block type back in React state; each would reintroduce repositioning.
