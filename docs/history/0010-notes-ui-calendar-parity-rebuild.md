# 0010 — Notes UI rebuilt to calendar parity

Date: 2026-07-02
Status: accepted

## What changed

Phase 1 of the Notes module remake: the Notes frontend was rebuilt to share the
calendar page's shell, classes, and interaction patterns instead of approximating
them with parallel CSS.

- `PageTree.tsx` was deleted and replaced by `Sidebar.tsx`, which renders tree rows
  as `.calendar-row` grids (chevron | icon+title | ⋯), opens a `.cal-card` row menu
  (rename field, Sub-page, Delete, Done) exactly like the calendar's per-calendar
  menu, and reorders via the calendar's 375ms long-press pointer drag (works for
  mouse and touch; the old HTML5 drag + separate 650ms touch path is gone).
  Horizontal drag past the title indent nests under the target row.
- Expansion state is now derived: ancestors of the selected page auto-expand
  (deep links are always visible); explicit chevron toggles override.
- `Notes.tsx` now mirrors `pages/Calendar.tsx`'s shell: conditional `AppRail` on
  mobile, always-mounted sidebar with `.calendar-sidebar` open/closed mechanics,
  shared `.sidebar-backdrop`, and a new topbar (sidebar toggle, current page title,
  "New page" primary button in the `.cal-new-event` style). The old mobile-only
  hamburger and bespoke drawer are gone — the mobile drawer now comes entirely from
  the shared `@media (max-width: 800px)` rules in `styles.css`.
- `PageView.tsx`: the icon is now always the shared `EmojiPicker` (the raw
  `<input>` shown when an icon existed is gone). Trigger enlarged to the 56px page
  icon slot via CSS.
- `notes.css` rewritten: all sidebar/drawer/menu styling deleted (inherited from
  `styles.css`), page canvas gets `pageEnter` animation, block gutter hidden on
  coarse pointers (slash menu covers insertion on touch), icon hover-reveal scoped
  to `@media (hover: hover)` so touch devices can always set an icon, tree rows
  44px on mobile.

## Why

User report: the Notes page felt rough and "extremely disconnected" from the
calendar page (the visual gold standard) — editor chrome, tree jank, popover
styling, layout, and mobile all named. Root cause: notes.css re-implemented
near-copies of calendar patterns with drifting values and different mechanics.
The fix is structural: reuse the calendar's actual classes and interaction code
paths so the two pages cannot drift apart again.

## Files touched

- `apps/web/src/modules/notes/Sidebar.tsx` — new; tree sidebar on `.calendar-sidebar`/`.calendar-row`/`.calendar-menu-btn` classes, long-press reorder, `.cal-card` row menu, derived expansion, trash link pinned at bottom.
- `apps/web/src/modules/notes/PageTree.tsx` + `PageTree.test.tsx` — deleted (superseded).
- `apps/web/src/modules/notes/Sidebar.test.tsx` — new; ports the rename/create and long-press reorder tests to the new component (375ms delay, menu-suppression assertion).
- `apps/web/src/modules/notes/Notes.tsx` — rewritten shell: rail/sidebar/backdrop wiring copied from `pages/Calendar.tsx`, new topbar, isMobile (≤640) + drawer (≤800) media listeners.
- `apps/web/src/modules/notes/PageView.tsx` — always-EmojiPicker icon head; save logic unchanged.
- `apps/web/src/modules/notes/notes.css` — rewritten; only notes-specific styles remain (topbar, tree specifics, page head, editor typography/popovers, backlinks, trash, pane, mobile tweaks).
- `apps/web/src/modules/notes/index.ts` — exports `Sidebar` instead of `PageTree`.

## How the pieces connect

`Notes.tsx` owns the pages array and route state and mirrors `pages/Calendar.tsx`
structurally: `AppRail` → `Sidebar` (+ `.sidebar-backdrop`) → `.notes-main`
(topbar + canvas). The sidebar reuses the calendar's CSS classes from
`apps/web/src/styles.css`, so the desktop collapse (`.closed` width transition),
the mobile fixed drawer at `left: 64px`, the backdrop, and the 44px coarse-pointer
targets are all inherited — notes.css contains no drawer code. `PageView` is also
rendered by `NotesPagePane`, which the calendar's `EventEditor` opens beside the
grid; its class names and props were deliberately kept stable (calendar tests
cover this). `BlockEditor` (TipTap) was not touched in this phase — its popovers
already used the `.cal-card` language.

## How to modify this later

- Sidebar row look: change `.calendar-row` in `styles.css` (affects calendar too —
  that is the point) or `.notes-tree-row` in `notes.css` for tree-only tweaks
  (indent is `paddingLeft: 8 + depth * 14` inline in `Sidebar.tsx`).
- Reorder behavior: `startReorder`/`moveReorder`/`finishReorder` in `Sidebar.tsx`;
  the nest threshold is `rect.left + 34 + depth * 14` in `finishReorder`.
- Row menu contents: the `menuFor === page.id` block in `Sidebar.tsx` (a `Card`
  with `.calendar-menu` positioning).
- Topbar: `.notes-topbar` block in `notes.css`; the "New page" button reuses
  `.cal-new-event`/`.cal-new-event-label` so the ≤800px label-collapse rule in
  `styles.css` applies automatically.
- Phase 2+ of the remake (database pages, covers, templates) is planned in the
  approved plan; the backend is unchanged so far.
