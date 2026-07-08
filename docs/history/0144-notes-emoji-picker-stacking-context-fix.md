# 0144 — Fix: notes page emoji picker unusable — trapped stacking context

Date: 2026-07-08
Status: accepted

## What changed
Added `z-index: 10` to `.notes-page-head` in `apps/web/src/modules/notes/notes.css`.

## Why
On the notes page, the title's emoji picker popover appeared faintly transparent and
closed immediately on click, before a glyph could be picked. This didn't happen on
other pages using the same `EmojiPicker` component (e.g. the calendar event editor).

Root cause: `.notes-page-head` has `animation: springUp ...`, which animates `transform`.
Any element animating `transform` establishes its own CSS stacking context. Since
`.notes-page-head` had no explicit `z-index` (`position: relative` with implicit
`z-index: auto`), that stacking context painted at the same level as its siblings —
and the block editor content rendered *after* it in the DOM (with its own small
z-indexes, 3–6) painted on top of it, popover included.

The popover's own `z-index: 120` (`.editor-icon-popover` in `styles.css`) only ranks
it within `.notes-page-head`'s stacking context — it can't escape to outrank content
outside that context. So later note content visually sat on top of the popover
(the "transparent" look was real page content painted over an otherwise-opaque
panel), and clicks landed on that content instead of the emoji buttons, triggering
the picker's outside-pointerdown-closes logic in `EmojiPicker.tsx`.

## Files touched
- `apps/web/src/modules/notes/notes.css` — added `z-index: 10` to `.notes-page-head`
  so its stacking context outranks later page content siblings.

## How the pieces connect
`EmojiPicker` (`apps/web/src/components/EmojiPicker.tsx`) is a shared component used
by both `PageView.tsx` (notes) and `EventEditor.tsx` (calendar). The popover's
`z-index: 120` in `styles.css` is only meaningful relative to siblings inside the
same stacking context. Any page that wraps the picker in a container establishing
its own stacking context (via `transform`, `opacity`, `will-change`, `filter`, etc.)
must give that container an explicit `z-index` — otherwise the popover's inner
z-index can be defeated by unrelated sibling content elsewhere in the page.

## How to modify this later
If a future animation is added to an ancestor of any popover/dropdown, check whether
that ancestor now creates a stacking context (any `transform`, `opacity < 1`,
`filter`, or `will-change` triggers this) and give it an explicit `z-index` if it
needs to render above later siblings. This bug class won't show up in isolation —
only when the anchor element has content after it in the DOM that can paint over it.
