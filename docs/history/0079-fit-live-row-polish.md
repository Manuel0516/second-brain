# 0079 — Fit live row polish

Date: 2026-07-05
Status: accepted

## What changed
Refined the `.fit-live-row` (per-set card in the live workout session) CSS to feel more polished and less clunky. Changes are CSS-only in `fitness.css`:

- `.fit-live-cell` inputs: switched from bold mono (`600 13px var(--font-mono)`) to regular UI font (`400 13px var(--font-ui)`), increased min-height (34→38px), padding (4px 6px→7px 8px), and border-radius (`--r-sm`→`--r-md`).
- `.fit-live-row` grid container: tightened gap (7→6px), increased padding (4px 6px→5px 8px).
- `.fit-live-row.head span` column headers: increased font-size (9→10px).
- `.fit-live-row:not(.head):hover`: added `border-color: var(--border)` to reveal the row outline on hover.
- Added `.fit-live-row:not(.head):focus-within` rule with `background: var(--bg-raised); border-color: var(--border-strong)`.
- `.fit-live-row.done .fit-live-cell`: replaced the vanishing-input behaviour (transparent border + background) with a dimmed-but-visible state: `color: var(--text-secondary)`, `opacity: 0.75`, `pointer-events: none`.
- `.fit-live-check` done button: increased height (30→34px desktop, 40→44px mobile).
- Mobile `.fit-live-cell`: increased min-height (40→44px), added `padding: 10px 8px`.
- Mobile `.fit-live-row`: increased row-gap (4→6px).

## Why
The previous design used bold monospace inputs that felt oversized and clunky. The done state made inputs vanish entirely, which was disorienting — users couldn't see their logged values after marking a set complete. The hover state lacked a border cue, making rows feel disconnected. These refinements bring the live session closer to the calendar/settings visual gold standard.

## Files touched
- `apps/web/src/modules/fitness/fitness.css` — updated `.fit-live-cell`, `.fit-live-row`, `.fit-live-row.head span`, `.fit-live-row:not(.head):hover`, added `.fit-live-row:not(.head):focus-within`, updated `.fit-live-row.done .fit-live-cell`, updated `.fit-live-check`, updated mobile `@media (max-width: 720px)` block for `.fit-live-row`, `.fit-live-cell`, `.fit-live-check`.

## How the pieces connect
These rules style the live workout session table rendered by `LiveSession.tsx`. Each set is a `.fit-live-row` grid containing `.fit-live-cell` number inputs, a `.fit-live-check` toggle button, and optional feeling/tools. The `.done` class is toggled via React state when the user marks a set complete. The hover and focus-within rules provide visual feedback during interaction. The mobile media query adjusts sizing for touch targets.

## How to modify this later
- All `.fit-live-*` rules live in `fitness.css` under the `/* === Live set table === */` comment block (around line 520) and the `@media (max-width: 720px)` block (around line 802).
- The JSX structure in `LiveSession.tsx` produces `.fit-live-row`, `.fit-live-row.head`, `.fit-live-row.done`, `.fit-live-cell`, and `.fit-live-check` — do not change the class names without updating both files.
- The done-state cell rules (`color`, `opacity`, `pointer-events`) are intentionally separate from the row-level done rules (`border-color`, `background`) — keep them in separate blocks.
- All tokens used (`--r-md`, `--font-ui`, `--font-mono`, `--bg-base`, `--bg-raised`, `--border`, `--border-strong`, `--text-primary`, `--text-secondary`, `--text-tertiary`, `--fit-accent-border`, `--fit-accent-tint`) are defined in `styles.css` (global) or `fitness.css` (fitness-specific).