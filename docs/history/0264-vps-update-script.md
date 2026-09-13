# 0264 — VPS update script

Date: 2026-09-13
Status: accepted

## What changed

Replaced the GitHub Actions deployment job with `scripts/update-production.sh`,
an operator-run updater for the repository checkout on the VPS. The script
fast-forwards a selected branch, validates Compose, rebuilds and restarts the
application containers, includes the optional Telegram bot when configured,
and verifies the internal readiness endpoint. The CI workflow remains unchanged
and continues to run checks for pushes and pull requests.

## Why

Production deployment should be initiated directly on the VPS instead of giving
GitHub Actions SSH access and deployment credentials. This also keeps the update
process available to any self-hoster without requiring GitHub environment
configuration.

## Files touched

- `scripts/update-production.sh` — safe fast-forward, rebuild, restart, and
  readiness workflow for an existing VPS checkout
- `.github/workflows/deploy.yml` — removed the GitHub-triggered SSH deployment
- `docs/public/self-hosting.md` — documents the updater and its safety behavior
- `infra/DEPLOY.md` — makes the VPS script the standard update path
  and documents the one-time transition from the old detached checkout
- `docs/history/CHANGELOG.md` — indexes this change

## How the pieces connect

The script updates the Git checkout that owns `compose.yaml`. It starts or
retains the database and object store, builds the API/web images from the new
revision, then recreates the application containers. The API entrypoint runs
Alembic before serving requests; the script waits for its container health and
finally checks `/api/ready` through nginx. Named volumes are never removed.

## How to modify this later

Keep updates fast-forward-only and continue refusing dirty worktrees. Add new
application services to `app_services`, but do not place PostgreSQL or MinIO in
the force-recreated set. Keep readiness checks on the internal nginx path so
VPN-only Traefik rules do not cause false failures. Never add `docker compose
down --volumes` or a Git reset to this script.
