# 0151 — Multi-photo meal log: visual/UX pass

Date: 2026-07-22
Status: accepted

## What changed

The final styling pass on the multi-photo meal logger (functional layer landed in
[0148](0148-multi-photo-meal-logging.md)). This entry is the permanent archive of the completed
UX handoff; its active-work plan was retired after acceptance.

- The `PHOTOS · N/15` section sits inside a recessed `--bg-base` well; flex-gap owns its
  internal rhythm.
- Ordered thumbnail grid: three columns at modal width, **two on narrow mobile**. Order badge
  moved to bottom-left as a mono pill; the remove control gained a hover/disabled treatment and a
  **44×44px touch target on mobile**.
- Photo actions regrouped: `Take another photo` and `Add photos` are grouped left, `Analyze
  photos` is pushed right (`margin-left:auto`) as the clear primary action. On mobile the two
  add-controls split the row and `Analyze` spans full width beneath them, all at 44px min-height.
- Upload progress now shows an on-brand `skeletonPulse` placeholder tile appended to the grid, so
  existing photos and the nutrition fields stay visible while uploading.
- History `+N` overlay inherits the same polished pill chip.
- Removed inline `style={{…}}` layout on the result container and Save button (moved to
  `.food-meallog-result` / `.food-meallog-save`), and deleted the now-dead single-photo
  `.food-meallog-status` / `.food-meallog-spinner` rules plus their duplicate local
  `@keyframes spin` (the canonical one lives in `styles.css`).

No new dependency, color, spacing scale, radius, shadow, or bespoke animation. Analysis errors
keep the existing error-banner language and never remove the gallery.

## Why

The 0148 plan deliberately deferred the visual pass to a dedicated handoff so the functional
data/API/state work could ship first. This entry is that deferred pass: make the gallery,
action hierarchy, progress, and mobile touch targets match the project style guide and look
finished in both themes.

## Files touched

- `apps/web/src/modules/food/MealLogModal.tsx` — the meal logging modal. Dropped inline layout
  styles, restructured the result-state photo actions into a `.food-meallog-photo-actions` row,
  added an `aria-hidden` skeleton tile that renders while `uploading`, and moved the Save button
  sizing to a class.
- `apps/web/src/modules/food/food.css` — all Food-module styling. Restyled the photos well,
  thumbnail grid, order badge, remove control, action row, and Save button; added the skeleton
  tile; added mobile rules (2-col grid, 44px remove target, stacked actions); registered the
  skeleton in the reduced-motion block; deleted the dead status/spinner CSS and duplicate
  `@keyframes spin`.

`History.tsx` was not edited — its `+N` overlay already existed and simply inherits the shared,
restyled `.food-history-photo-count` chip.

## How the pieces connect

`MealLogModal` holds `photoFileIds: string[]` and renders the gallery in the `result`/`error`
states (`isInModal`). The photos live in `.food-meallog-photos`, a bordered `--bg-base` well that
doubles as the drag/drop target (`.dragging` swaps to the food accent). Inside it: the mono
`.food-meallog-label` count, the `.food-meallog-photo-list` grid (each cell is a
`.food-meallog-photo-item` with an `img`, a `.food-meallog-photo-order` badge, and a
`.food-meallog-photo-remove` button), then `.food-meallog-photo-actions`, then the
`role="status"` upload text. While `uploading` is true a `.food-meallog-photo-skeleton` tile is
appended to the grid and the add/remove/analyze controls are disabled. The `+N` badge on the
History thumbnails shares the badge chip class, so both surfaces stay visually consistent from one
rule.

## How to modify this later

- **Columns / mobile breakpoint:** grid columns are set on `.food-meallog-photo-list` (desktop 3)
  and overridden to 2 inside the `@media (max-width: 720px)` block in `food.css`.
- **Photo cap:** the `15` is `MAX_MEAL_PHOTOS` in `MealLogModal.tsx`; the label and disabled
  states derive from it. Change it there, not in CSS.
- **Action hierarchy:** the left/right split is `margin-left:auto` on the primary button within
  `.food-meallog-photo-actions`; the mobile stack is the `flex-basis:100%` override in the mobile
  media query.
- **Touch targets:** the remove control's 44px size and the action buttons' 44px min-height are
  mobile-only overrides — keep any new touchable control ≥44px there.
- **Upload progress:** it's the skeleton tile plus the `.food-meallog-photo-status` line, both
  gated on the `uploading` flag. If per-file counts are wanted, the tile could be repeated for the
  number of pending files rather than shown once.
- Any new animation must be added to the `@media (prefers-reduced-motion: reduce)` block, as the
  skeleton tile is.
