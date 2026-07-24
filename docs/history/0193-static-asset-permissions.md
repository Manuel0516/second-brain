# 0193 — Normalize static asset permissions

Date: 2026-07-24
Status: accepted

## What changed

The nginx image now makes generated frontend files readable by the nginx worker
regardless of the VPS checkout's umask. The deployment workflow also verifies
the three logo/favicon assets after the API readiness check.

## Why

The newly deployed monochrome assets were copied into the image as `0600
root:root`, so nginx returned `403` even though the files existed. The older
neon logo remained readable, making the problem appear style-specific.

## Files touched

- `apps/web/Dockerfile` — applies read permissions to the final static web
  directory after copying the Vite build.
- `.github/workflows/deploy.yml` — checks the neon logo, monochrome logo, and
  monochrome favicon through the internal nginx path.
- `infra/DEPLOY.md` — documents the static asset permission failure mode.

## How the pieces connect

The build stage creates `apps/web/dist`, and the final nginx stage serves that
directory at `/usr/share/nginx/html`. Docker can preserve restrictive source
permissions from the VPS checkout, so the final image normalizes them before
nginx starts. The deployment check requests the public static paths from inside
the web container without traversing Traefik.

## How to modify this later

Keep the permission normalization after the `COPY --from=build` line. If new
required public assets are added, include them in the deployment asset loop so
a permissions or copy regression fails before the release is reported healthy.
