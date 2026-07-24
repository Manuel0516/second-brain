# 0194 — Make the monochrome favicon follow app appearance

Date: 2026-07-24
Status: accepted

## What changed

The favicon now follows both appearance settings: Neon always uses the neon asset, while
Monochrome uses the white asset in dark mode and a black SVG variant in light mode. The
runtime switch updates both the favicon URL and MIME type, and deployment asset checks include
all required variants.

## Why

The favicon previously selected only from visual style and could disappear in production when
the monochrome white asset was rendered against light browser chrome. It also did not follow an
explicit app light/dark setting.

## Files touched

- `apps/web/public/favicon-monochrome-black.svg` — black monochrome favicon variant.
- `apps/web/src/lib/appearance.ts` — selects favicon from visual style and color mode.
- `apps/web/src/lib/appearance.test.ts` — verifies neon, light-monochrome, and
  dark-monochrome paths and MIME types.
- `.github/workflows/deploy.yml` — verifies all favicon/logo assets are served with their
  expected MIME types after deployment.
- `infra/DEPLOY.md` — documents nginx's SPA-fallback false positive for missing assets.

## How the pieces connect

`applyTheme` and `applyVisualStyle` both refresh the favicon, so changing either setting updates
the tab icon immediately. Explicit light/dark settings select black/white monochrome assets;
system mode uses the browser preference. Neon remains independent of color mode.

## How to modify this later

Keep all favicon variants square and update `faviconAssetFor()` plus the deployment asset loop
together if an asset is renamed.
