# 0015 — In-place LaTeX editing

Date: 2026-07-02
Status: accepted

## What changed

Inline math now opens a compact LaTeX input inside its text block and renders in place
when Enter is pressed or focus leaves the input. Block equations use a larger source
editor, render centered, and show an automatic equation number. An optional label field
overrides the automatic number. Clicking rendered math reopens its source editor, and
Shift+Enter adds a line inside block LaTeX.

## Why

Math creation previously inserted a rendered placeholder immediately, while the toolbar
used a browser prompt. That split interaction made formulas difficult to enter and edit
and disconnected their source from the Notes block editor.

## Files touched

- `apps/web/src/modules/notes/editor/MathNodeViews.tsx` — editable inline and block math
  node views, KaTeX rendering, automatic numbering, and optional labels.
- `apps/web/src/modules/notes/editor/MathExtensions.ts` — registers the custom views and
  adds the optional block-equation label attribute.
- `apps/web/src/modules/notes/editor/BlockEditor.tsx` — installs the editable math nodes
  and inserts empty source editors from slash commands and the inline toolbar.
- `apps/web/src/modules/notes/editor/BlockEditor.test.tsx` — covers in-place commits,
  rendered output, automatic numbering, and manual labels.
- `apps/web/src/modules/notes/notes.css` — compact inline source input, larger block source
  editor, centered equation output, and right-aligned numbering.

## How the pieces connect

`BlockEditor` still stores TipTap `inlineMath` and `blockMath` nodes with their existing
`latex` attribute. `MathNodeViews` replaces only their editor presentation: local input
state is committed back to node attributes, which triggers the existing debounced page
save. Block math adds a `label` attribute; blank labels derive their displayed number
from the block's current document order.

## How to modify this later

Change input and commit behavior in `MathNodeViews.tsx`; keep persistence through the
node attributes so autosave continues to work. Change visual treatment in the
`.math-node-*` rules in `notes.css`. Automatic numbering is calculated by
`equationNumber`; manual labels must continue to take precedence.
