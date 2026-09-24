# 0269 — Release planned-card entrance transforms for touch swipes

Date: 2026-09-24
Status: accepted

## What changed

Changed the planned workout and meal entrance animations from `both` to
`backwards` fill mode. Entrance motion remains, but its final transform no longer
overrides `SwipeReveal` after the animation completes.

## Why

Both cards received touch gestures and updated their inline transform, but stayed
visually stationary: the retained CSS animation transform won in the cascade.
The original browser fixture omitted fitness/food styles and asserted inline
style rather than rendered movement, so it incorrectly passed.

## Files touched

- `apps/web/src/modules/fitness/fitness.css` — release planned-card final transform.
- `apps/web/src/modules/food/food.css` — same correction for planned meals.
- `apps/web/e2e/swipe-reveal.mobile.tsx` — load both real module stylesheets.
- `apps/web/e2e/swipe_reveal_mobile.py` — test real touch streams, bounding-box
  movement, computed transform, exposed-button hit testing and touch deletion;
  verify vertical scrolling with normal and reduced motion.
- `docs/history/CHANGELOG.md` — index this entry.

## How the pieces connect

Fitness and Food Overview pass card classes into the shared SwipeReveal wrapper.
Those classes animate the same element whose transform the pointer handlers set.
Removing forward fill restores control to the swipe after the entrance animation.
No deletion API, gesture threshold, persistence, or styling tokens changed.

The corrected Chromium mobile regression failed before the CSS fix: both normal
motion cards moved 0px, while reduced-motion cards moved -48px. After the fix,
both modes and row types move -48px, accept an explicit touch on the exposed
delete control, and retain vertical scrolling. `npm run check` passed.

## How to modify this later

Do not retain a transform animation on an element whose transform is controlled
by gestures. Keep module CSS in browser fixtures and assert rendered geometry,
not just inline values. Run the fixture with Vite and
`SWIPE_E2E_URL=http://127.0.0.1:4191/e2e/swipe-reveal.mobile.html python apps/web/e2e/swipe_reveal_mobile.py`
using an environment with Playwright and Chromium installed. This is a real
Chromium touch test, not an iOS/Safari device certification.
