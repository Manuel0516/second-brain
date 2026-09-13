# 0140 — Fix prod deploy: Google sync env vars and outbound network egress

Date: 2026-07-06
Status: accepted

## What changed

Google Calendar sign-in returned an internal server error in production. Debugged live on
the VPS (`brain.example.com`) and found three separate misconfigurations, all pre-existing
gaps from when the Google/ICS sync feature (0138) was deployed without updating `compose.yaml`:

1. **`compose.yaml` never forwarded the six Google/calendar-sync env vars into the `api`
   container.** They were set in `.env` but invisible inside the running container — `docker
   compose` does not auto-inject host `.env` values into a service, only vars listed under
   `environment:`.
2. **`GOOGLE_REDIRECT_URI`/`FRONTEND_URL` on the VPS pointed at `http://...:8000`**, but the
   `api` service isn't on the `traefik` network and has no published port — only `web`/nginx
   is reachable externally, proxying `/api/` internally to `api:8000`. Fixed to
   `https://brain.example.com/...` with no port.
3. **The `api` service only joined the `internal` network**, which is `internal: true` —
   Docker blocks all outbound internet on that network by design. Before this feature, `api`
   only ever talked to `db`/`minio` (both internal), so this never mattered. The OAuth code
   exchange (`google_sync.exchange_code`, a POST to `oauth2.googleapis.com`) and any ICS feed
   fetch need real internet egress, and failed with
   `httpx.ConnectError: [Errno -3] Temporary failure in name resolution`.

`GOOGLE_TOKEN_ENCRYPTION_KEY` itself was already correct (matched between local and VPS
`.env`) — not the actual problem, despite that being the initial suspicion.

## Why

The calendar-sync feature (0138) added new env vars and outbound-HTTP requirements but its
history entry and docs never touched `compose.yaml`, so the deploy config silently fell
behind the code.

## Files touched

- `compose.yaml` — added `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`,
  `GOOGLE_TOKEN_ENCRYPTION_KEY`, `FRONTEND_URL`, `CALENDAR_SYNC_INTERVAL_MINUTES` to the `api`
  service's `environment:` block; added a new non-internal `egress` network and put `api` on
  it alongside `internal` (db/minio stay internal-only, they never call out).
- VPS `.env` (not in git) — `GOOGLE_REDIRECT_URI` and `FRONTEND_URL` corrected to
  `https://brain.example.com/...`.

## How the pieces connect

`compose.yaml`'s `api.environment:` block is the only thing that maps `.env` values into the
container's actual process environment — `app/config.py`'s `Settings` reads `os.environ`
inside the container, not the host `.env` file directly. The `internal` network has no
default route to the internet; a service needs at least one non-internal network to make any
outbound request (DNS or otherwise). `web`'s nginx (`infra/nginx/default.conf`) is the only
externally-reachable surface — it proxies `/api/` to `api:8000` over the `internal` network,
which is why `GOOGLE_REDIRECT_URI` must go through `web`'s host+path, not `api`'s own port.

## How to modify this later

- Any new env var the `api` service needs in production must be added to
  `compose.yaml → services.api.environment`, not just `.env` — `.env` alone is silently a
  no-op for the container.
- Any new outbound HTTP call from `api` (a new sync provider, a webhook receiver calling out,
  etc.) needs `api` on a non-internal network — it already has `egress` for this.
- If `db`/`minio` ever need outbound access too, add them to `egress` the same way; don't
  remove `internal: true` from the `internal` network just to unblock one service.
