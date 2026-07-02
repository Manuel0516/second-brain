# 0016 — Notes editor focus, lists, and tasks

Date: 2026-07-02
Status: accepted

## What changed

Replaced the high-specificity Notes input outline with one low-specificity app-wide
keyboard-focus fallback. Selected text now becomes the initial source of an inline math
node and opens directly in its in-line editor. Bulleted and numbered lists explicitly
restore their markers after the CSS reset. Task items now have a visible checkbox,
checked styling, flexible content layout, and completed-text treatment.

## Why

The Notes-wide focus selector overrode component focus styles and created stacked borders.
The math toolbar discarded selected text. Tailwind's reset removed list markers, while
unstyled task checkboxes made a working TipTap transaction appear non-functional.

## Files touched

- `apps/web/src/styles.css` — adds the low-specificity app-wide focus fallback.
- `apps/web/src/modules/notes/notes.css` — removes the conflicting Notes focus rule and
  restores list/task presentation.
- `apps/web/src/modules/notes/editor/MathExtensions.ts` — converts the current selection
  into inline-math source and selects the inserted node.
- `apps/web/src/modules/notes/editor/MathNodeViews.tsx` — opens newly selected math nodes
  directly in source mode.
- `apps/web/src/modules/notes/editor/BlockEditor.tsx` — routes slash and toolbar insertion
  through the shared selected-text math command.
- `apps/web/src/modules/notes/editor/BlockEditor.test.tsx` — covers selected-text math and
  task checkbox persistence.
- `docs/design/STYLE_GUIDE.md` — records the single-ring focus cascade rule.

## How the pieces connect

The global `:where()` selector provides an accessible fallback without enough specificity
to beat component focus styles. TipTap's selection is read before inline-math insertion;
the inserted node remains selected so its React node view starts in edit mode. List and
task CSS targets TipTap's semantic `ul`, `ol`, and `data-type='taskItem'` markup without
changing stored Notes JSON.

## How to modify this later

Keep generic focus fallbacks inside low-specificity `:where()` selectors and put a single
ring on each component's focus rule. Modify list/task visuals only in the TipTap section
of `notes.css`. Keep selected-text conversion in `insertEditableInlineMath` so every math
entry point behaves identically.
