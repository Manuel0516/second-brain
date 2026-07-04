# 0042 — Notes toolbar: alignment dropdown + pencil separator

Date: 2026-07-04
Status: accepted

## What changed
- Replaced the four individual text-alignment buttons (left, center, right, justify) in the selection toolbar with a single button that shows the active alignment. Clicking it opens a small popover listing all four options.
- Added a visual separator (thin border-left + margin) before the color/pencil button to visually group it apart from the formatting buttons.
- Reworked the color palette popover: reduced padding, added a divider between the Highlight and Block sections, tightened the grid.
- Added a custom color swatch (with pencil icon) to the Highlight, Block, and Text color sections. Uses a native `<input type="color">` hidden behind a pencil SVG, following the calendar event color picker pattern. The pencil icon color adapts to the background via luminance-based `onColor()`.
- Added a **Text color** section (above Highlight) with the same preset + custom color pattern. Uses a new `NoteTextColor` mark extension (`<span data-text-color="...">`) with `toggleTextColor`/`unsetTextColor` commands.
- Modified `NoteHighlight` and `BlockColor` extensions to support hex color values: semantic names use CSS token-backed rules, hex values render with inline `background-color` / `color`.
- Unified all swatch shapes: consistent `display: grid; place-items: center;` on the base `.notes-swatch` class so preset, custom, and clear swatches all render identically.
- Fixed the toolbar pencil button proportions: removed the `border-radius` and `padding-left` overrides that made it visually different from other toolbar buttons.

## Why
- Four alignment buttons crowded the floating toolbar, especially on narrow viewports. A single button with a popover is more compact and matches the pattern used elsewhere (e.g. CreatePageMenu, color picker).
- The pencil/color button needed visual separation from the text-formatting group to make the toolbar easier to scan.
- The color palette popover felt loose; tighter spacing and a section divider make it more polished.
- The four preset semantic colors (accent, warm, neutral, contrast) were too limiting for personal expression. A custom color picker gives full freedom while keeping the preset shortcuts available.

## Files touched
- `apps/web/src/modules/notes/editor/BlockEditor.tsx` — added `alignOpen` state, `alignBtnRef`/`alignPanelRef` refs, replaced 4 alignment buttons with 1 button + popover, added `notes-toolbar-pencil` class to the color button, extended the outside-click handler to also close the align popover. Added `highlightCustomHex`/`blockCustomHex`/`textCustomHex` state and custom color `<label>` wrappers with native `<input type="color">` + pencil SVG to all three swatch rows (Text, Highlight, Block). Registered `NoteTextColor` extension.
- `apps/web/src/modules/notes/editor/ColorExtensions.ts` — added `onColor()` luminance utility (ported from calendar `colors.ts`), added `isHex()` helper, modified `NoteHighlight.renderHTML` and `BlockColor.renderHTML` to detect hex values and use `data-color="custom"` / `data-block-color="custom"` with inline styles. Added `NoteTextColor` mark extension with `toggleTextColor`/`unsetTextColor` commands and Commands declaration merging.
- `apps/web/src/modules/notes/notes.css` — added `.notes-align-popover` styles, fixed `.notes-toolbar-pencil` (removed radius/padding overrides), unified `.notes-swatch` base with grid centering, added `.notes-swatch.text-*` swatch colors, added `.notes-swatch-custom` / `.notes-swatch-custom-icon` / `.notes-swatch-active` styles, added `[data-text-color]` rendering rules, expanded swatch grid to 6 columns.

## How the pieces connect
- The selection toolbar (`BubbleMenu` from Tiptap) renders `.notes-selection-toolbar`. The alignment button and its popover sit inside this toolbar, positioned absolutely below the toolbar bar. The color palette uses the same absolute positioning pattern.
- Both the align popover and the color panel share the same `pointerdown` outside-click handler (the `useEffect` on `colorsOpen`/`alignOpen`).
- The alignment button icon dynamically shows the currently active alignment via `TEXT_ALIGNMENTS.find(...)`.

## How to modify this later
- To change alignment popover positioning: edit `.notes-align-popover` (positioned `top: calc(100% + 4px); right: 0` relative to the toolbar).
- To add more options to the alignment popover: edit the `TEXT_ALIGNMENTS.map(...)` block inside `alignOpen && (...)`.
- To adjust the pencil separator: edit `.notes-toolbar-pencil` (the `margin-left`, `border-left`, `padding-left` values).
- The outside-click handler at the `useEffect` depends on `colorsOpen` and `alignOpen` — if adding more popovers, add their refs to the guard clause and their state to the dependency array.
- Custom colors are hex strings stored in `data-color` / `data-block-color` as `"custom"` with inline `background-color`. The `isHex()` helper in `ColorExtensions.ts` detects the `#XXXXXX` pattern. To change how custom colors render, edit the `renderHTML` functions in `NoteHighlight` and `BlockColor`.
- The pencil icon color adapts via `--sw-on` set by `onColor()` in the inline style. The `onColor` function is the same luminance-based algorithm used by the calendar event editor.
