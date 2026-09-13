# 0177 — VPN-only Traefik exposure

Date: 2026-07-24
Status: pending approval

## What changed

The production web service now advertises only its container port and attaches a
Traefik IP allowlist middleware permitting the WireGuard subnet `10.40.0.0/24`.
The deployment workflow verifies readiness through the internal nginx path rather
than the public hostname. Deployment and architecture documentation now describe
the VPN-only route and private DNS requirement.

## Why

The app should no longer be reachable from the public internet. Keeping Traefik
as the existing TLS entrypoint preserves the Hub integration while rejecting
requests that do not arrive from the VPN network.

## Files touched

- `compose.yaml` — adds the web container's explicit `80` exposure and the
  `secondbrain-vpn-only` Traefik middleware for `10.40.0.0/24`.
- `.github/workflows/deploy.yml` — verifies `/api/ready` inside the web container,
  so deployment does not depend on public ingress.
- `infra/DEPLOY.md` — documents VPN DNS, private verification, and the enforced
  access boundary.
- `README.md`, `docs/architecture/BACKEND.md`, `docs/architecture/OVERVIEW.md`,
  `docs/product/AUTH_AND_SECURITY.md` — align project security and deployment
  documentation with private VPN access.

## How the pieces connect

VPN clients resolve `brain.example.com` to the WireGuard address and reach the
Hub Traefik instance. Traefik applies `secondbrain-vpn-only` before forwarding to
the nginx `web` container on the shared `traefik` network. Nginx continues to serve
the frontend and proxy `/api` to the private API service. PostgreSQL, MinIO, and
the API remain unexposed to the host.

## How to modify this later

Keep the router middleware and VPN DNS configuration in sync. If the VPN subnet
changes, update the `sourcerange` label and the deployment guide together. Do not
add host-bound ports to bypass Traefik; verify routes from a VPN-connected client.
