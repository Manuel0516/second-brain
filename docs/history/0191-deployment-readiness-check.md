# 0191 — Internal deployment readiness check

Date: 2026-07-24
Status: accepted

## What changed

The automated and documented manual deployment checks now verify readiness
through nginx inside the Compose network, retrying for up to 60 seconds. The
automated check suppresses transient request output and prints API/web logs only
if all readiness attempts fail.

## Why

The production hostname is protected by a VPN-only Traefik allowlist. Checking
that hostname from the deployment host produced expected `403` responses and
caused `curl --fail` to report a failed deployment even when the containers were
healthy.

## Files touched

- `.github/workflows/deploy.yml` — retries the internal `/api/ready` check and
  preserves a useful failure path.
- `infra/DEPLOY.md` — uses the internal check for manual updates and explains
  that public hostname checks require a VPN client.

## How the pieces connect

The deployment workflow SSHes to the VPS, starts the Compose services, then
executes `wget` in the nginx `web` container. Nginx proxies `/api/ready` to the
private FastAPI `api` service, so the check does not traverse Traefik or its
VPN allowlist. External checks remain a separate operator check from a VPN
connected device.

## How to modify this later

Keep automated deployment checks on the internal path. If startup time changes,
adjust the retry count or delay in `.github/workflows/deploy.yml`; do not replace
the check with a public-hostname request unless the command runs from the VPN
subnet. Keep the manual instructions aligned with the same boundary.
