# 0034 — Mobile notes page padding

Date: 2026-07-03
Status: accepted

## What changed

Added mobile padding to `.notes-page` in the `@media (max-width: 800px)` breakpoint, with extra space on the left for block controls, and reduced the top padding from 40px to 32px.

## Why

The notes canvas felt cramped on mobile, and its narrow left gutter pushed block controls outside the visible canvas. The asymmetric padding keeps the content comfortable while reserving enough space for those controls.

## Files touched

- `apps/web/src/modules/notes/notes.css` — changed `.notes-page` padding in the mobile breakpoint to `32px 20px 96px 36px`.

## How the pieces connect

The `.notes-page` container wraps every note's content. Its mobile left padding provides the lane used by the heading toggle and floating block gutter; the smaller right padding retains more editing width. The 800px breakpoint matches the sidebar drawer breakpoint in `styles.css`.

## How to modify this later

Find the `@media (max-width: 800px)` block in `apps/web/src/modules/notes/notes.css` and adjust the `.notes-page` padding values. The format is `padding: <top> <right> <bottom> <left>`. If a separate 640px breakpoint is ever needed (e.g. for very small phones), add a new `@media (max-width: 640px)` rule after the existing one at line 2439.
