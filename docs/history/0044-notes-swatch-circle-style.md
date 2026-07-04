# 0044 — Notes swatch circles (calendar-consistent style)

Date: 2026-07-04
Status: accepted

## What changed

- Converted the notes editor's colour swatch popover (`.notes-swatch`) from 26px rounded
  squares (`border-radius: var(--r-md)`) to 21px circles (`border-radius: 50%`), matching
  the calendar event editor and settings page's `.color-swatch` style.
- Changed `.notes-swatch[aria-pressed='true']` active state to use a 2px ring in the
  swatch's own legible on-color (`var(--sw-on)`) instead of the accent border, matching
  the `.color-swatch.active` pattern from the calendar.
- Replaced the 1px solid border with a 2px transparent border + box-shadow outline,
  consistent with the circle swatch approach elsewhere in the app.
- Updated `.notes-swatch-options` grid column size from 26px to 21px, gap from 8px to 6px.
- Reduced the "clear" swatch strikethrough line width proportionally.
- Simplified `.notes-swatch` transition to `transform 0.12s`, matching `.color-swatch`
  exactly (removed the separate cubic-bezier timing and border-color/box-shadow transitions).
- Removed redundant `.notes-swatch[aria-pressed='true']:hover` rule (identical to base
  `[aria-pressed='true']` state).
- Updated `.notes-swatch-custom` to match `.color-custom` exactly: explicit 21px circle
  dimensions, `display: inline-grid`, same hover scale (1.18) with shadow, and matching
  transition timing.
- Updated `.notes-swatch-custom-icon` to match `.color-custom-icon`: restored 15px icon
  size, removed `translateX/Y` transform, added `opacity: 0.85` → `1` on hover.

## Why

The notes colour swatches used a square/layout-style appearance while the rest of the app
(calendar event editor, settings favourite-colour editor) uses compact circle swatches.
This change makes the notes popover visually consistent with the rest of the application
design style.

## Files touched

- `apps/web/src/modules/notes/notes.css` — all `.notes-swatch` rules updated to circle style.
