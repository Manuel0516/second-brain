# 0069 — Live set card redesign

Date: 2026-07-05
Status: accepted

## What changed

Complete restructure of the live set card JSX and CSS in the Fitness module:

- **LiveSession.tsx**: Restructured the set card JSX so that `.fit-live-set-number` and `.fit-done-button` are direct children of `.fit-live-set` (not nested inside `.fit-live-set-main`). `.fit-live-set-main` now only wraps the two value inputs (kg/reps or km/min).

- **fitness.css**: Replaced the original live set card styling (lines 584-694) with a comprehensive redesign using a CSS grid layout (`grid-template-columns: 28px 1fr 44px`):
  - Set number in column 1, spanning rows 1-3
  - Value inputs in column 2, row 1
  - Done button in column 3, spanning rows 1-3
  - Tools row (feeling/note/remove) in column 2, row 2 with a top border separator
  - Note input spanning all columns when visible
  - Redesigned value inputs as stacked column layout with larger font (700 18px)
  - Larger feeling buttons (28px) with 12px dot indicators
  - Updated note/remove buttons with consistent sizing and hover states
  - `springUp` animation on card mount

- Replaced the wave2-live override block with a comment.
- Updated both mobile media queries: narrower grid columns, taller value inputs, larger touch targets on mobile.

## Why

The previous live set card layout was a flat flex row with all elements packed together, making it hard to find space for the feeling/note/remove tools while keeping value inputs clearly readable. The CSS grid structure gives explicit control over element positions, enables the tools row to sit beneath the values with a clean visual separator, and makes the done button span the full height of the card. The mobile rules ensure 44×44px touch targets per Apple HIG.

## Files touched

- `apps/web/src/modules/fitness/LiveSession.tsx` — Restructured the set card JSX: moved `fit-live-set-number` and `fit-done-button` from inside `fit-live-set-main` to direct children of `fit-live-set`. All event handlers, aria labels, and props preserved unchanged.

- `apps/web/src/modules/fitness/fitness.css` — Replaced the entire original live set styling block (`.fit-live-set`, `.fit-live-set-main`, `.fit-live-value`, `.fit-feeling`, `.fit-note-button`, `.fit-remove-button`, `.fit-done-button`, `.fit-live-note`) with a CSS-grid-based redesign. Replaced the wave2-live override block with a comment. Updated mobile media query rules for both the first @media block and the former wave2 mobile block.

## How the pieces connect

`LiveSession.tsx` generates one `.fit-live-set` div per workout set. The new JSX structure places four direct children on the grid container:

1. `<strong class="fit-live-set-number">` → grid column 1, rows 1-3 (vertically centered set index)
2. `<div class="fit-live-set-main">` → grid column 2, row 1 (flex row of two value input labels)
3. `<button class="fit-done-button">` → grid column 3, rows 1-3 (full-height completion toggle)
4. `<div class="fit-live-set-tools">` → grid column 2, row 2 (feeling dots + note + remove)
5. `<label class="fit-live-note">` (conditional) → grid column 1 / -1 (full-width note field)

The CSS at `fitness.css` provides the grid definitions, value input card styling, feeling button dot indicators, and mobile overrides. The `>` child selectors ensure the grid placement targets only the immediate children, not nested sub-elements. The `springUp` keyframe is already defined in `styles.css`.

## How to modify this later

- **Change grid layout**: Edit the `.fit-live-set` `grid-template-columns` and `grid-template-rows` values. The three columns are set-number (28px), value-inputs (1fr), and done-button (44px).
- **Change value input appearance**: Edit `.fit-live-value` (the card container) and `.fit-live-value input` (the number field). These are flex-column containers with centered text.
- **Change feeling buttons**: Edit `.fit-feeling` and `.fit-feeling button`. The dot sizes are controlled by `.fit-feeling button span` (12×12px circles).
- **Change note/remove buttons**: Edit `.fit-note-button` and `.fit-remove-button`.
- **Change mobile breakpoint**: The mobile rules live in two `@media (max-width: 720px)` blocks. Add or modify rules there for smaller screens.
- **Add new element to card**: Add it as a direct child of `.fit-live-set` with a `grid-column` and `grid-row` value, then increase `grid-template-rows` if needed. Keep the `>` child selector pattern for grid placement.
