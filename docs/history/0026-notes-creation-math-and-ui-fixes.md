# 0026 — Notes creation, math, and UI fixes

Date: 2026-07-03
Status: accepted

## What changed

- Preserved the selected Page, Folder, or Database type when creating from the
  sidebar plus menu.
- Prevented inline-math Enter from crashing the UI when the edited math node is
  removed and its deferred focus callback runs.
- Split page-menu actions into Template/Sub-page and Delete/Done rows.
- Applied accent styling to Restore and danger styling to Delete forever in
  Trash, and removed the placeholder icon from iconless pages.

## Why

The sidebar creation callback discarded its type argument, deleted math nodes
could invalidate TipTap's `getPos`, and the page/trash actions did not follow
the intended hierarchy or color language.

## Files touched

- `apps/web/src/modules/notes/Notes.tsx` — forwards the selected page type.
- `apps/web/src/modules/notes/editor/MathNodeViews.tsx` — safely restores focus
  after node updates or deletion.
- `apps/web/src/modules/notes/editor/BlockEditor.test.tsx` — covers Enter on an
  empty inline equation.
- `apps/web/src/modules/notes/Sidebar.tsx` — groups page-menu actions into two
  rows.
- `apps/web/src/modules/notes/TrashView.tsx` — adds semantic action classes and
  conditionally renders page icons.
- `apps/web/src/modules/notes/notes.css` — styles Trash actions and titles.

## How the pieces connect

`CreatePageMenu` sends a type through `Sidebar` to `Notes.create`, which passes
it to the API. Math node views defer focus until after React updates; the focus
helper now tolerates a node deleted by the preceding transaction. Sidebar and
Trash markup reuse the existing card and design-token styles.

## How to modify this later

Add page types in `CreatePageMenu` and the shared `Page['type']` union. Change
math commit behavior in `MathNodeViews.tsx` and keep the empty-Enter regression.
Trash action hierarchy lives in the `.notes-trash-*` rules in `notes.css`.
