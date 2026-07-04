# 0045 — Drag rail rework, favourite swatch polish, todo-save jank fix

Date: 2026-07-04
Status: accepted

## What changed

**Drag handle rail (BlockEditor + notes.css)**
- Switched the floating gutter from `placement: 'left'` (vertically centred against
  the whole block rect) to `'left-start'` (anchored to the block's top-left corner).
  Centring against tall blocks put the handle at the vertical middle of a list item's
  entire subtree or between the lines of a wrapped paragraph — the "weird" drag
  behaviour in lists.
- The rail's offset is now driven by two CSS custom properties on
  `.notes-block-gutter`: `--rail-x` (horizontal lane) and `--rail-y` (vertical nudge
  that drops the 24px rail onto the centre of the block's first text line).
- Lanes: default `-4px` (small gap to the text edge; also used by task items, whose
  checkbox is inside the block box); headings and bullet/numbered list items `-28px`,
  which clears the heading collapse toggle (occupying −24px…−2px) and the list
  markers that hang left of the `li` box. Previously both used `-12px`, which left the
  grip overlapping the toggle by 12px on desktop and sitting on top of list markers.
- Vertical nudges: body blocks 1.5px, h1 11px, h2 7px, h3 4px (first-line centre at
  1.75 line-height minus half the 24px rail). The heading level is exposed to CSS as
  `data-node-level` on the gutter (set in `handleDragNodeChange`).
- Mobile (≤800px): the old separate transform overrides (heading `-22px`, lists reset
  to none — grip nearly touching the toggle) were deleted; mobile now shares the
  desktop lanes and only keeps `transition: none` plus the hidden add-button on
  headings.

**Favourites (follow-up to 0043)**
- Applied migration 014 to the local database (it had been written but not run, so
  the API rejected the new settings fields — favourites appeared broken).
- Favourite colour swatches in the toolbar popover now set `--sw-on` so the
  active-state ring stays legible on any colour, matching the other swatches.
- The custom (pencil) swatch no longer shows as active when the active colour is one
  of the favourites — each section's active-detection now also excludes its
  favourite list.
- Favourites now REPLACE the built-in palette in each popover section: the four
  named default swatches (accent/warm/neutral/contrast) render only while that
  section has no favourites saved. Documents already coloured with a named value
  keep rendering correctly — the names live in the doc and are styled by CSS.
- Fixed swatch buttons rendering as large rounded squares inside the popover: the
  generic `.notes-selection-toolbar button` sizing (min 26px, padding, `--r-md`
  radius) outranked `.notes-swatch` (0,1,1 vs 0,1,0) because the popover nests in
  the BubbleMenu. Only the pencil swatches stayed circular — they are `<label>`s.
  A `.notes-selection-toolbar button.notes-swatch` de-override restores the 21px
  circle geometry. Verified by screenshotting the popover markup nested in the
  toolbar (headless Firefox) — a fixture without the toolbar wrapper misses this.

**Todo-save jank (BlockEditor)**
- `lastEmittedRef` remembers the JSON object last sent through `onChange`. The
  external-content sync effect skips when the incoming `content` prop is that same
  object (the autosave round-trip: Notes.tsx passes the reference back unchanged).
  Previously every autosave triggered `JSON.stringify` of the entire document twice
  — a main-thread hitch ~1.2s after checking a todo, felt as lag on phones.

## Why

User report: drag grip overlapping the heading collapse toggle on desktop, no margin
between them in phone view, drag handle floating at wrong heights in lists, and todo
checking on mobile feeling janky at save time. Favourites (0043) appeared broken
because the migration was never applied.

## Files touched

- `apps/web/src/modules/notes/editor/BlockEditor.tsx` — `left-start` drag placement,
  `data-node-level` on the gutter, `lastEmittedRef` save-echo guard, favourite swatch
  `--sw-on` + active-state dedup.
- `apps/web/src/modules/notes/notes.css` — `--rail-x`/`--rail-y` lane system on
  `.notes-block-gutter` (desktop + simplified mobile block).
- Local DB: `alembic upgrade head` (013 → 014).

## How the pieces connect

The tiptap `DragHandle` positions an outer wrapper via floating-ui (`left/top` only,
per `computePositionConfig`); `.notes-block-gutter` is portaled inside it, so all
fine positioning lives in CSS transforms on the gutter. `onNodeChange` stamps
`data-node-type`/`data-node-level` on the gutter, and notes.css maps those to lane
offsets. The heading toggle is a ProseMirror widget decoration positioned at
`left: -28px` inside the heading (see `CollapsibleHeading.ts`), which is why the
heading lane must clear −24px…−2px. The autosave loop is BlockEditor `onUpdate` →
debounce (1200ms) → `onChange` → PageView `saveContent` → Notes.tsx `patchPage`,
which passes the same content object back down — the reference-equality guard
depends on `patchPage` preserving that reference (it already did, see its comment).

## How to modify this later

- To move a lane or add one for a new node type: add a
  `.notes-block-gutter[data-node-type='…'] { --rail-x/--rail-y }` rule. Geometry:
  the rail's right edge sits at the block's left edge before `--rail-x`; the rail is
  48px wide (22px add + 4px gap + 22px grip).
- If heading font sizes change in notes.css, recompute `--rail-y` as
  `(1.75 × font-size − 24px) / 2` per level, and the toggle's own
  `top: calc(0.875em - 11px)` stays consistent automatically.
- If Notes.tsx ever stops passing the saved content reference back unchanged, the
  `lastEmittedRef` guard degrades gracefully to the stringify compare — but the todo
  jank returns; keep the reference-preserving pattern in `patchPage`.
