# Plan B — First Production Deploy (security & good practices)

> ✅ **Code-level tasks implemented 2026-06-29.** Infra-level tasks (SEC-6, SEC-7, SEC-8, SEC-10) remain for VPS owner.

> Audience: an implementing AI (Codex / DeepSeek) or developer. Goal: take the
> existing stack to a **safe first deployment** at `brain.zero-five.space`
> (Contabo VPS, external Traefik network, Let's Encrypt) per
> `docs/product/AUTH_AND_SECURITY.md` and the milestone `0C` exit gate in
> `docs/ROADMAP.md`. Reference spec rows: ARCHITECTURE + AUTH_AND_SECURITY only
> (do not load feature specs). **Never run VPS/deploy commands without the
> owner's explicit approval** (infra `AGENTS.md`).

Current state (verified): `compose.yaml` already has Postgres 18, MinIO, API
(non-root), web (nginx) with Traefik labels + Hub labels, `internal` network +
external `traefik`. Gaps below are what stand between that and a safe public
deploy.

---

## 1. Threat model (one paragraph)

Single user, entire life's data, reachable on the open internet by URL. The login
is the only gate, so: cookies must be theft-resistant (already httpOnly/Secure/
SameSite=strict), the app must send hardening headers, secrets must never ship
with defaults, brute force must be throttled at app + infra layers, and there
must be a tested backup/restore. 2FA and a network-level layer (Tailscale / Basic
Auth) are strongly recommended belts on top.

---

## 2. Tasks (ordered, each independently verifiable)

### SEC-1 — Refuse to boot with insecure defaults  *(api)*
`apps/api/app/config.py` currently defaults `jwt_secret_key`,
`initial_user_password`, DB creds. Add an `environment: Literal["dev","prod"]`
setting (default `dev`). In `app/main.py` startup (move off the deprecated
`@app.on_event("startup")` to a `lifespan` handler — see SEC-9), assert in `prod`:
- `jwt_secret_key` != the default and length ≥ 32,
- `initial_user_password` != `"changeme"`,
- `database_url` not pointing at localhost defaults.
Fail fast (raise `RuntimeError`) so a misconfigured prod container never serves.
Add `APP_ENVIRONMENT=prod`, `JWT_SECRET_KEY`, strong `INITIAL_USER_*`,
`POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD` to `.env.example` with comments and a
"generate with `openssl rand -hex 32`" note.

### SEC-2 — Security headers  *(two layers)*
**Static assets (nginx)** — `infra/nginx/default.conf`, in the `location /` block
and/or `server` scope:
```
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
add_header Content-Security-Policy "default-src 'self'; img-src 'self' data:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
```
HSTS is added by **Traefik** (TLS terminator), not nginx, to avoid sending it over
plain HTTP — add a Traefik headers middleware via compose labels (SEC-7).

**CSP note — Nerd Font:** `styles.css` currently loads the Symbols Nerd Font from
`cdn.jsdelivr.net`. With the strict CSP above that font is blocked. **Fix by
self-hosting the font**: vendor `SymbolsNerdFont-Regular.woff2` (convert the TTF)
into `apps/web/public/fonts/`, change the `@font-face` `src` to `/fonts/...`, and
keep `font-src 'self'`. (Do **not** loosen CSP to allow the CDN.) The font file
already exists under `docs/design/design-canvas/_ds/.../fonts/` for reference.

**API responses (FastAPI middleware)** — add a small middleware in `app/main.py`
setting `X-Content-Type-Options: nosniff` and `Cache-Control: no-store` on
`/api/*` responses. No CORS middleware — the app is same-origin behind nginx;
explicitly keep CORS **off**.

### SEC-3 — Run DB migrations on deploy  *(api / compose)*
Today the API image `CMD` only starts uvicorn; nothing runs `alembic upgrade head`.
Add a startup step. Pick ONE:
- **Entrypoint script** `apps/api/entrypoint.sh`: `alembic upgrade head` then exec
  uvicorn. `chmod +x`, set as `ENTRYPOINT`. (Simplest, runs every boot — fine,
  migrations are idempotent.)
- Or a one-shot `migrate` compose service that runs `alembic upgrade head` and the
  `api` service `depends_on` it `condition: service_completed_successfully`.
Document which; entrypoint is recommended for a single-node deploy.

### SEC-4 — Environment-aware Secure cookies  *(api)*
`routes/auth.py` hardcodes `secure=True` on cookies. That breaks local HTTP dev.
Drive `secure` from `settings.environment == "prod"` (or a `cookie_secure` bool,
default True; set False only in dev `.env`). Keep `httponly=True`,
`samesite="strict"` always. No other cookie changes.

### SEC-5 — Finish TOTP 2FA  *(api — recommended, can be a fast-follow)*
`/auth/totp/setup` returns a URI but `/verify` and `/disable` are `501`. Implement:
store the TOTP secret **encrypted at rest** (Fernet key from a new
`TOTP_ENCRYPTION_KEY` env var) on the `User`; `verify` checks the code and enables;
`disable` requires a valid code + password. Surface enroll/disable in the Settings
"Security" section (Plan A leaves it as "Soon" — wire it here if doing 2FA now).
If deferring, leave the stubs but track it as a known gap before exposing publicly.

### SEC-6 — Brute-force defense in depth  *(infra)*
App-level rate limiting already exists (`check_rate_limit`, `LoginAttempt`).
Add **fail2ban** watching Traefik access logs for repeated 401s on
`/api/auth/login`, banning the IP at the firewall (per AUTH_AND_SECURITY §3).
Provide a `infra/fail2ban/` filter + jail snippet and document enabling it on the
host (not in compose). Confirm Traefik access logging is on.

### SEC-7 — Traefik TLS, HSTS, HTTP→HTTPS  *(compose labels)*
`compose.yaml` web service already routes `websecure` + `letsencrypt`. Add:
- an HTTP router on `web` entrypoint that redirects to `websecure`
  (`traefik.http.routers.secondbrain-web.middlewares=...redirect-to-https`),
- a headers middleware enabling HSTS:
  `traefik.http.middlewares.sb-hsts.headers.stsSeconds=31536000`,
  `...stsIncludeSubdomains=true`, `...stsPreload=true`,
  attached to the websecure router.
Keep all images version-pinned (already done; never `latest`). Keep API/DB/MinIO
off the host network (no published ports) — verify no `ports:` on db/minio/api.

### SEC-8 — Backups & restore (the 0C exit gate)  *(infra/ops)*
- Postgres: a nightly `pg_dump` cron on the host (or a tiny sidecar) writing a
  timestamped dump to a host volume; rotate (keep 7 daily / 4 weekly).
- MinIO: `mc mirror` the bucket to the same backup location (or skip until files
  exist — note it).
- **Document a tested restore**: `infra/backup/README.md` with the exact
  `pg_restore`/`mc` commands and a one-time "restore drill" checklist. The
  milestone is not done until a restore has actually been verified once.

### SEC-9 — Lifespan + minor hygiene  *(api)*
- Replace `@app.on_event("startup")` with a `lifespan` async context manager
  (removes the deprecation warning surfaced in tests/build).
- Ensure no secrets are logged. Set uvicorn `--proxy-headers` and trust the
  Traefik/nginx `X-Forwarded-*` so `get_client_ip` sees the real client IP
  (important for rate limiting + fail2ban correctness).
- nginx already has `server_tokens off`; add the same care to API (FastAPI hides
  version by default — fine).

### SEC-10 — Optional network layer (recommended)  *(infra, owner decision)*
Per AUTH_AND_SECURITY §5, document (don't force) **Tailscale**: put the VPS on the
tailnet and bind Traefik's router for `brain.zero-five.space` to the tailnet only,
removing the public attack surface entirely. Provide the on/off toggle as a short
runbook in `infra/README.md`. App-level login + 2FA remains the baseline either
way.

---

## 3. Pre-deploy checklist (must all be green)

- [x] `.env` on the VPS has strong unique `JWT_SECRET_KEY` (≥32B), `INITIAL_USER_PASSWORD`,
      `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`, `APP_ENVIRONMENT=prod`; `.env` is not committed.
- [x] App refuses to boot in `prod` with any default secret (SEC-1 verified locally).
- [x] `alembic upgrade head` runs automatically on container start (SEC-3).
- [ ] Security headers present on `/` and `/api` (curl -I check); CSP has no CDN
      dependency (Nerd Font self-hosted, SEC-2).
- [ ] HTTPS works, HTTP redirects to HTTPS, HSTS header present (SEC-7).
- [x] Cookies are `Secure; HttpOnly; SameSite=Strict` in prod (SEC-4).
- [ ] Login rate limiting works; fail2ban jail active on the host (SEC-6).
- [ ] DB + MinIO have **no published host ports**; only nginx is exposed via Traefik.
- [ ] Nightly backup runs and a **restore has been tested once** (SEC-8).
- [x] `npm run check` and `npm run check:api` pass; production `compose config` renders.
- [ ] (Recommended) 2FA enabled (SEC-5) and/or Tailscale layer (SEC-10).

---

## 4. Verification commands (safe, local/CI — no VPS mutation)

```
# renders & validates the prod compose without starting anything
docker compose -f compose.yaml config

# app quality gates
npm run check            # web: format, lint, vitest, tsc, build
npm run check:api        # api: ruff, mypy, pytest

# header smoke test (after a local prod-like run, NOT the VPS)
curl -sI http://localhost/ | grep -iE 'x-frame-options|content-security-policy|x-content-type'
```

Do **not** run `docker compose up` against the VPS, deploy, or mutate the server
without explicit approval (infra `AGENTS.md`). Hand the owner the checklist; they
run the deploy.

---

## 5. Build order

1. SEC-1 config guard + `.env.example` → 2. SEC-9 lifespan/proxy-headers →
3. SEC-4 cookie flag → 4. SEC-2 headers (nginx + self-host font + API middleware) →
5. SEC-3 migrations-on-boot → 6. SEC-7 Traefik TLS/HSTS/redirect →
7. SEC-6 fail2ban files → 8. SEC-8 backup/restore scripts+drill →
9. SEC-5 2FA (if in scope) → 10. SEC-10 Tailscale runbook (optional).

Each task: implement, run the two `check` commands, and tick its checklist line.
