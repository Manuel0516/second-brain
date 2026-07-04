# 0048 — Close Notes/Component plans, animate toggle expand/contract

Date: 2026-07-04
Status: accepted

## What changed
1. Marked both active plans done and closed:
   - `NOTES_MODULE_PLAN.md` — already marked complete as of 0037; no change needed.
   - `COMPONENT_ARCHITECTURE_PLAN.md` — marked done. `SaveIndicator`, `SearchField`,
     and `LinkedItems` remain "todo" in its extraction table; left deferred rather
     than built speculatively, since neither has a second consumer yet.
2. Added smooth expand/contract animation to the two "title toggles" in Notes that
   previously snapped open/closed instantly:
   - **Sidebar page tree** (`Sidebar.tsx`): a page row's children now always mount
     inside a `.notes-tree-group` wrapper; `open`/closed is driven by a CSS
     `grid-template-rows: 0fr → 1fr` transition instead of a `{isOpen && ...}`
     mount/unmount. `inert` is set on the wrapper when closed so hidden rows drop
     out of tab order and screen-reader traversal. No JS height measurement
     needed — the grid-rows trick sizes to content automatically.
   - **Collapsible headings** (`CollapsibleHeading.ts`, the TipTap editor toggle):
     expanding a heading now fades its revealed section in (`fadeUp`, matching the
     style guide's existing entrance keyframe) via a transient ProseMirror plugin
     state (`toggleAnimKey`) that marks the freshly-revealed range for ~220ms, then
     clears itself. Collapsing stays an instant `display:none` swap — there's
     nothing on screen left to animate away, and keeping display:none (rather than
     a max-height/overflow trick) avoids clipping the table floating toolbar and
     other absolutely-positioned overlays that live inside note blocks.

## Why
User asked to close out the notes/component work and add "nice animations to the
toggle of the titles expanding and contracting" as the last remaining polish item,
matching the existing motion language in `docs/design/STYLE_GUIDE.md` §6.

## Files touched
- `apps/web/src/modules/notes/Sidebar.tsx` — tree children always mount; visibility
  now controlled by a wrapper class instead of conditional rendering.
- `apps/web/src/modules/notes/notes.css` — `.notes-tree-group` grid-rows transition
  + reduced-motion override; `.notes-heading-opening` fadeUp animation +
  reduced-motion override.
- `apps/web/src/modules/notes/editor/CollapsibleHeading.ts` — added `sectionRangeFor`
  (section range independent of the `collapsed` attribute), a transient
  `toggleAnimKey` plugin state set on expand and cleared after 220ms, and a
  decoration branch that applies `notes-heading-opening` while it's active.
- `docs/work/plans/COMPONENT_ARCHITECTURE_PLAN.md` — status flipped to done.

## How the pieces connect
Both toggles already had working chevron-rotation CSS (`.notes-tree-toggle svg` /
`.notes-heading-toggle svg`, unchanged) — only the content reveal/hide lacked
motion. The sidebar fix is pure CSS since React fully owns that DOM. The editor fix
needed a small transient plugin state because ProseMirror decorations recompute
synchronously with every transaction; without a plugin-state flag there was no way
to distinguish "just expanded, please animate" from "steady state, no animation
needed" on every keystroke's decoration recompute.

## How to modify this later
- To also animate the collapse direction in the editor: add a mirrored
  `notes-heading-closing` class (fade out over ~150ms) and delay applying
  `notes-collapsed-hidden` until a matching timeout fires, following the same
  `toggleAnimKey` pattern used for expand. Skipped here because collapsing has no
  visible content to fade — the perceived gain was judged not worth the extra
  plugin-state branching.
- If `SaveIndicator`/`SearchField`/`LinkedItems` gain a second consumer (e.g. a
  Finance form needing a save indicator), extract them into `src/components/`
  following the pattern already used for `Card`/`Field`/`IconButton` in the same
  plan file.
