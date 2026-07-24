# 0180 — Calendar toolbar selector spacing

Date: 2026-07-24
Status: accepted

## What changed

Added a more deliberate gap between the Calendar Day/Week/Month selector and the add-event
button so the right-side controls read as a balanced group.

## Why

The add button was too tightly coupled to the segmented selector after the desktop navbar was
aligned with the Fitness and Food layouts.

## Files touched

- `apps/web/src/styles.css` — increase the Calendar secondary toolbar gap from 8px to 12px.

## How the pieces connect

The selector and add button are rendered together in `.cal-toolbar-secondary`; its shared flex
gap controls their spacing on desktop and narrow layouts without changing either control's
dimensions.

## How to modify this later

Adjust `.cal-toolbar-secondary` in `styles.css` if the control relationship needs another
spacing pass. Keep the gap within the existing app spacing scale.
