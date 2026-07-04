# 0050 — Fix collapsible heading animation

Date: 2026-07-04
Status: accepted

## What changed
Fixed the notes editor collapse animation so section blocks remain visible until
their Web Animation finishes. Nested headings now animate with their parent section,
and browsers without the Web Animations API fall back to immediate collapse. The
collapse now animates each block's measured height and margins so following content
moves upward immediately. Most layout space closes before the final fade. Content
starts first, followed by nested headings from the deepest level upward.

## Why
The animation state was registered under one ProseMirror plugin key and read from
another, so `display: none` was applied immediately and the collapse motion could not
be seen. The 450ms timing keeps both directions smooth without delaying layout closure.

## Files touched
- `apps/web/src/modules/notes/editor/CollapsibleHeading.ts` — unified the plugin state key, corrected section DOM collection, and guarded the no-animation fallback.
- `apps/web/src/modules/notes/editor/BlockEditor.test.tsx` — added a regression check that blocks stay visible until animation completion.

## How the pieces connect
The heading pointer handler starts the browser animation and stores the heading
position in plugin state. Decorations omit `notes-collapsed-hidden` for that section
until the animation promise resolves, then a transaction clears the state and the
existing decoration hides the collapsed blocks.

## How to modify this later
Change `TOGGLE_DURATION_MS` or the shared easing in `CollapsibleHeading.ts` to tune
motion. Keep the completion-driven decoration handoff and its regression test intact.
