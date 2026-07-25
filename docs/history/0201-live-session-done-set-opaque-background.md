# 0201 — Fix transparent background and scroll flicker on live-session set rows

Date: 2026-07-25
Status: accepted

## What changed
Two related visual bugs in the fitness live session card's set rows:

1. The "done" state background for a set row was translucent, so the red
   swipe-to-delete button underneath (same stacking context, revealed on
   swipe) showed through once a set was marked complete. The background is
   now composited against the opaque card surface color instead of
   `transparent`, keeping the same visual tint but fully opaque.
2. While scrolling, the red delete button could flash on top of the row
   before the row's own paint caught up, because `overflow: hidden` alone
   didn't guarantee the browser kept clip/paint order consistent for the
   absolutely positioned button during scroll compositing. Added
   `contain: paint` to the row shell to force a proper clip/stacking boundary.

## Why
User-reported: completing a set made its card background go semi-transparent,
letting the delete button bleed through behind it even when not swiped open;
separately, scrolling upward showed the same red button rendering above the
card momentarily before settling.

## Files touched
- `apps/web/src/modules/fitness/fitness.css`
  - `.fit-live-row.done` background changed from `var(--fit-accent-tint)` (a
    `color-mix(..., transparent)` value) to
    `color-mix(in srgb, var(--accent) 14%, var(--bg-raised))`, mixing the
    same 14% accent ratio against the row's actual opaque background color
    instead of transparent.
  - `.fit-live-row-shell` gained `contain: paint` alongside its existing
    `overflow: hidden`, to stop the swipe-delete button from flashing above
    the row during scroll.

## How the pieces connect
Each set row sits inside a `.fit-live-row-shell` that also contains an
absolutely positioned `.fit-live-swipe-delete` button (z-index 0) revealed by
swiping. The `.fit-live-row` sits on top (z-index 1) and must stay fully
opaque to hide the delete button until swiped. `--fit-accent-tint` is shared
across several other spots (empty states, focus rings) where transparency
over varying backgrounds is intentional, so the fix overrides only the
`.done` row background rather than changing the shared token.

## How to modify this later
If the "done" tint color needs adjusting, change the `--accent`/ratio in the
`color-mix()` on `.fit-live-row.done` directly — don't swap back to
`var(--fit-accent-tint)` for this rule, since that reintroduces the
bleed-through bug. Any other row state that must fully occlude the swipe
delete button behind it needs an opaque background for the same reason. If
scroll flicker of the delete button reappears (e.g. after restructuring the
shell markup), keep `contain: paint` on `.fit-live-row-shell` — removing it
or replacing `overflow: hidden` without it will likely reintroduce the issue.
