# 0197 — Add a reliable production favicon fallback

Date: 2026-07-24
Status: pending approval

## What changed

The browser tab now uses one cache-busted white monochrome planet PNG in every app appearance mode.
Production nginx also redirects the conventional `/favicon.ico` request to that PNG instead
of letting the SPA fallback return HTML. Deployment verification now checks the fallback.

## Why

Production served every configured image correctly, but `/favicon.ico` returned `index.html`,
and the runtime could replace the working PNG with a fully black or white favicon based on the
app theme. Browser tab chrome has its own color and cache, so those variants could be invisible
or remain stale even though the assets were healthy.

## Files touched

- `apps/web/index.html` — declares the cache-busted PNG before JavaScript runs.
- `apps/web/src/lib/appearance.ts` — keeps the tab icon independent of app appearance.
- `apps/web/src/lib/appearance.test.ts` — verifies every appearance mode retains the same PNG.
- `infra/nginx/default.conf` — gives `/favicon.ico` an explicit image redirect.
- `.github/workflows/deploy.yml` — verifies the fallback resolves to `image/png`.

## How the pieces connect

The initial HTML and runtime appearance updates now select the same versioned image URL, so a
theme change cannot replace it with a low-contrast asset. Browsers that ignore the link or
request the conventional path are redirected by nginx to the same file. The deploy check
follows that request and rejects a release if it resolves to the SPA HTML again.

## How to modify this later

When replacing the favicon artwork, update the version query in `index.html`,
`appearance.ts`, and nginx together so browsers fetch the new bytes. Keep `/favicon.ico`
outside the general SPA fallback and update the deployment MIME assertion if the image format
changes.
