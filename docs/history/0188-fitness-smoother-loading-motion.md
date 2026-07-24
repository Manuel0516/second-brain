# 0188 — Fitness smoother loading motion

Date: 2026-07-24
Status: accepted

## What changed

Fitness page loading motion now uses a short, non-overshooting fade/settle animation instead
of stacked spring entrances. Page-level and sidebar motion were shortened, and stagger delays
were reduced across overview cards, goals, history, body metrics, planned sessions, and
exercise cards.

## Why

The previous page load combined a root fade, sidebar slide, topbar drop, and many springy
staggered cards. Their overlapping transforms made the Fitness view appear to jump through
multiple layout states while data arrived.

## Files touched

- `apps/web/src/modules/fitness/Fitness.tsx` — removes the competing root/sidebar inline
  animations so their scoped styles control the entrance sequence.
- `apps/web/src/modules/fitness/fitness.css` — adds the restrained Fitness entrance keyframe,
  applies it to loading surfaces, and keeps reduced-motion overrides in place.
- `apps/web/src/modules/fitness/Overview.tsx` — shortens overview card stagger delays.
- `apps/web/src/modules/fitness/GoalsSection.tsx` — shortens goal card stagger delays.
- `apps/web/src/modules/fitness/SessionForm.tsx` — shortens history card stagger delays.
- `apps/web/src/modules/fitness/BodyMetricLog.tsx` — uses the shared restrained row animation.
- `apps/web/src/modules/fitness/SessionWizard.tsx` — shortens exercise card stagger delays.

## How the pieces connect

The Fitness page now lets the topbar/sidebar enter quickly, while loaded regions use the
shared `fitnessSmoothIn` keyframe with small stagger increments. The existing data loading and
layout components are unchanged; only their visual entrance timing and motion curve changed.

## How to modify this later

Tune `fitnessSmoothIn` and the delay increments together. Avoid reintroducing nested spring
transforms on the page root and sidebar, and update the reduced-motion selectors whenever a
new Fitness surface uses the keyframe.
