# 0046 — Fix cover image URL rendering and quality

Date: 2026-07-04
Status: accepted

## What changed

Fixed CSS `url()` quoting across all cover image render sites, and fixed the
`CoverTile` component's use of the `background` shorthand overriding individual
background properties.

**Files changed:**

- `apps/web/src/components/FavoritesEditor.tsx` — In `CoverTile`: wrapped `url()`
  argument in double quotes so URLs with special characters (parentheses, spaces,
  query params) parse correctly; replaced `background` shorthand with
  `backgroundColor` + `backgroundRepeat` to prevent the shorthand from resetting
  `backgroundImage`, `backgroundSize`, and `backgroundPosition`.
- `apps/web/src/modules/notes/CoverPicker.tsx` — Favourite cover swatches now use
  `url("${cover}")` with quotes.
- `apps/web/src/modules/notes/PageView.tsx` — Page cover banner now uses
  `url("${page.cover}")` with quotes.
- `apps/web/src/modules/notes/PageView 2.tsx` — Same fix as above for the
  duplicate file.
- `apps/web/src/modules/notes/database/GalleryView.tsx` — Gallery card covers
  now use `url("${record.cover}")` with quotes.

## Why

Two bugs reported:

1. **Cover images not rendering in the settings favorite-covers section** — The
   `CoverTile` component used `background: var(--bg-raised)` as a shorthand after
   setting `backgroundImage`. The `background` shorthand resets all background
   sub-properties when applied; using `backgroundColor` instead avoids this.
   Additionally, all `url(${cover})` calls were unquoted, so URLs containing
   special characters (common in CDN-hosted images with query parameters) would
   fail to parse as valid CSS, causing the image to not load at all.

2. **Poor cover image quality on notes pages** — When the unquoted `url()` failed
   to parse, the browser would either load nothing or render a broken image,
   which users perceived as low quality. Fixing the quoting ensures the full-
   resolution image is loaded and displayed correctly.

## Files touched

- `apps/web/src/components/FavoritesEditor.tsx` — `CoverTile` inline styles fixed.
- `apps/web/src/modules/notes/CoverPicker.tsx` — Favourite swatch inline styles fixed.
- `apps/web/src/modules/notes/PageView.tsx` — Page cover inline style fixed.
- `apps/web/src/modules/notes/PageView 2.tsx` — Same fix for duplicate file.
- `apps/web/src/modules/notes/database/GalleryView.tsx` — Gallery card cover inline style fixed.

## How the pieces connect

Cover images flow from the `pages.cover` field (a URL string) through the
component's inline `style` attribute as a CSS `background-image`. Every site that
renders a cover (`PageView`, `GalleryView`, `CoverPicker` favourites, settings
`CoverTile`) passes the URL into `url()`. The fix wraps each URL in CSS-standard
double quotes and separates `backgroundColor` from `backgroundImage` in the
`CoverTile` component so the two properties don't conflict.

## How to modify this later

To add a new cover rendering site: set `backgroundImage` to `url("${theUrl}")`
(with double quotes around the URL), use separate `backgroundColor`,
`backgroundSize`, `backgroundPosition`, and `backgroundRepeat` properties instead
of the `background` shorthand, and ensure no parent CSS sets a conflicting
`background` shorthand that would reset `background-image`.
