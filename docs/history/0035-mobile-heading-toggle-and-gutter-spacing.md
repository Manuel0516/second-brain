# 0035 — Mobile heading toggle and gutter visibility

Date: 2026-07-03
Status: accepted

## What changed

1. **Heading toggle now works on touch devices** — replaced `mousedown` with `pointerdown` in the chevron button event handler so the toggle fires on touch as well as mouse.

2. **Kept block controls visible on mobile** — the page reserves 36px of left padding so gutter transitions retain an 8px screen-edge margin, regular block gutters move 4px right, and list gutters no longer shift left.

3. **Simplified heading controls on mobile** — headings hide the add button and use the freed space for only the collapse toggle and drag grip. Both controls shrink to 18×20px with 9px icons, and the narrower heading gutter uses `translateX(-26px)` to keep a visible gap between them.

## Why

The heading collapse chevron used `mousedown`, so tapping it on a phone did nothing. The previous mobile gutter also crowded three controls beside headings and placed the add button too far left on other blocks.

## Files touched

- `apps/web/src/modules/notes/editor/CollapsibleHeading.ts` — changed `mousedown` to `pointerdown` in the chevron button event handler (line ~92)
- `apps/web/src/modules/notes/notes.css` — added the mobile page inset, moved regular gutters right, removed the heading add button, and reduced the remaining heading controls on mobile.

## How the pieces connect

The `CollapsibleHeading.ts` plugin creates a chevron button via `Decoration.widget` at every heading. The button's event handler toggles the `collapsed` attribute on the heading node. `pointerdown` is the unified pointer event that fires for both mouse clicks and touch taps, making the toggle work everywhere without needing separate listeners.

The `.notes-page` left padding reserves the mobile control lane. The floating gutter reads `data-node-type` from the editor's hovered block, so CSS can hide only a heading's add button while leaving it available for every other block. Removing that button also narrows the floating gutter and moves the remaining drag grip inward.

## How to modify this later

**Toggle event**: Edit the `chevronButton()` function in `apps/web/src/modules/notes/editor/CollapsibleHeading.ts`. The `pointerdown` listener is on the button element.

**Mobile spacing**: Find `@media (max-width: 800px)` in `apps/web/src/modules/notes/notes.css`. Adjust the `.notes-page` left padding and `.notes-block-gutter` transforms together; larger negative transforms require more left padding to remain visible.
