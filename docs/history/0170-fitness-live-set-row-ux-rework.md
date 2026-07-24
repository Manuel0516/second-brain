# 0170 — Fitness live-set row UX rework

Date: 2026-07-24
Status: accepted

## What changed

Restyled the live workout set rows (`.fit-live-row`) on the Fitness page to match a
target mockup: wider, more square weight/reps inputs, a more legible set number,
boxed note and done buttons, larger feeling dots with wider spacing, and a slightly
larger "Previous / Feel" meta line. Pure CSS change — no markup or behavior touched.

## Why

User request: the live-set row felt cramped and off-style compared to the rest of the
app; the target design has generous, squarish inputs instead of tall narrow ones.

## Files touched

- `apps/web/src/modules/fitness/fitness.css` — desktop `.fit-live-row` grid changed
  from `14px minmax(28px,38px) minmax(28px,38px) 58px 28px 28px` to
  `20px 76px 76px minmax(140px,1fr) 40px 40px` with 12px gaps; row + swipe-shell
  radius `--r-md` → `--r-lg`; `.fit-live-num` now 14px `--font-ui` primary;
  `.fit-live-check` and `.fit-live-note-button` unified to `--r-md` on `--bg-base`;
  in-row feeling dots enlarged (14px dots, 10px gaps, 22×40px buttons); live
  exercise header meta bumped to 11px `--text-secondary`; mobile (≤720px) overrides
  adjusted (head-row padding matches 8px row padding, feeling dots stay 12px).

## How the pieces connect

`LiveSession.tsx` renders each set as a `.fit-live-row` grid inside a
`.fit-live-row-shell` (swipe-to-delete). The header row (`.fit-live-row.head`) shares
the same grid template, so widening the KG/REPS columns automatically realigns the
column labels. The feeling scale (`.fit-feeling`) is shared with history sets and the
log-past modal, so all live-row dot sizing is done through scoped
`.fit-live-row .fit-feeling` overrides rather than touching the shared rules.

## How to modify this later

Column widths live in the `grid-template-columns` of `.fit-live-row` (desktop) and in
the `@media (max-width: 720px)` block (mobile) — change both together or the head row
and set rows will misalign. If the feeling dots need resizing, edit the scoped
`.fit-live-row .fit-feeling` rules (base and mobile), never the shared `.fit-feeling`
block. Done-state styling chains off `.fit-live-row.done`.
