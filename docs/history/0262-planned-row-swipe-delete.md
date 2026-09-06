# 0262 — Swipe to reveal deletion for planned meals and workouts

Date: 2026-09-06
Status: accepted

## What changed
Planned meal and workout rows now show a small × delete button slightly beyond the upper-right card border on desktop only when the pointer reaches that corner (or the button receives keyboard focus). It no longer reserves space in the card. Touch devices retain the left-swipe action that reveals an explicit delete button. The gesture itself never deletes.

## Why
Users need to remove plans directly from the Fitness and Food overview pages while keeping completed history intact, with a less visually intrusive desktop control and without requiring a drag.

## Files touched
- `apps/web/src/components/SwipeReveal.tsx` — shared touch gesture and accessible delete primitive; mouse drags do not trigger a reveal.
- `apps/web/src/components/SwipeReveal.test.tsx` — guards the direct desktop delete and touch-only swipe behavior.
- `apps/web/src/modules/fitness/Overview.tsx` — wraps planned workout rows and exposes deletion.
- `apps/web/src/modules/fitness/Fitness.tsx` — deletes planned sessions through the API and refreshes state.
- `apps/web/src/modules/food/Overview.tsx` — wraps planned meal rows and exposes deletion.
- `apps/web/src/modules/food/Food.tsx` — deletes planned meals through the API and refreshes state.
- `apps/web/src/styles.css` — shared swipe shell, reveal button, and motion styles.

## How the pieces connect
Overview rows render through `SwipeReveal`, which handles touch pointer capture, horizontal thresholding, vertical-scroll cancellation, and focus reveal. Fine-pointer devices use a CSS media query to let the shared delete button and its 24px corner hover target sit beyond the card's upper-right edge without changing the card layout; keyboard focus exposes the same control. The parent pages own API calls through existing `deleteSession` and `deleteMealLog` functions, then reload their server state. Completed records are never listed in the planned row collections.

## How to modify this later
Adjust the reveal width and gesture thresholds in `SwipeReveal.tsx`. Keep deletion attached to the button and pass a parent callback so API state remains at the page boundary. The fine-pointer media query in `styles.css` defines the desktop × control, its small corner hover target, and the desktop-only overflow override needed outside the card; keep `:focus-visible` alongside hover and touch swipe behavior behind the explicit button click.
