# 0203 — Contain notes canvas scroll to stop topbar bounce

Date: 2026-07-25
Status: accepted

## What changed
Added `overscroll-behavior: contain` to `.notes-canvas` (the scrollable note
content area), so scrolling to the top or bottom of a note no longer chains
into a rubber-band bounce of the page behind it.

## Why
User-reported: on phone, scrolling in the notes app made the topbar lose its
top padding/margin. `.notes-topbar` is a static flex sibling above
`.notes-canvas` with fixed padding — it never changes size on its own.
Without `overscroll-behavior: contain`, iOS Safari lets an overscroll past
the top/bottom of `.notes-canvas` chain into the outer page, rubber-banding
the whole `.notes-shell` and visually compressing the gap above the topbar
during the bounce. The same fix (`overscroll-behavior: contain`) is already
used in this codebase for `.week-scroll` and `.event-editor.locked` to
prevent identical scroll-chaining bounce.

## Files touched
- `apps/web/src/modules/notes/notes.css` — `.notes-canvas` gained
  `overscroll-behavior: contain`.

## How the pieces connect
`.notes-topbar` and `.notes-canvas` are siblings inside `.notes-main`
(flex column). `.notes-shell` already uses `height: 100dvh; overflow:
hidden;` to keep the shell itself from scrolling, but that alone doesn't
stop an inner `overflow: auto` element's overscroll from chaining to the
document on iOS — `overscroll-behavior` is the property that actually stops
that chain.

## How to modify this later
Not verified on a physical iOS device in this session (no way to reproduce
real touch rubber-band from this environment) — if the bounce persists,
check whether `.notes-shell`/body also need `overscroll-behavior-y: none` as
a second containment layer.
