# 0178 — Calendar desktop toolbar width

Date: 2026-07-24
Status: accepted

## What changed

The Calendar toolbar now uses the full available canvas width on desktop while keeping its
existing compact control sizing and responsive narrow-screen layout.

## Why

The desktop toolbar was capped at 720px, leaving unused horizontal space around the
navigation. The full-width container gives the desktop header a more cohesive relationship
to the calendar canvas.

## Files touched

- `apps/web/src/styles.css` — override the desktop toolbar width to `100%`.

## How the pieces connect

The existing Calendar toolbar groups remain unchanged: the primary date controls flex to fill
the available width and the secondary view controls retain their fixed compact sizing. The
override applies only at the desktop breakpoint, so the narrower grid layout is unaffected.

## How to modify this later

Adjust the `.cal-toolbar` rule inside the `min-width: 801px` media query. Keep control
dimensions in their existing rules and preserve the base `720px` cap for narrower layouts.
