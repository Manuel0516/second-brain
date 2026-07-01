# 0006 — Production deploy hardening

Date: 2026-06-29
Status: accepted (code complete; some infra tasks pending VPS owner approval)

## What changed

Hardened the app for first public deploy at `brain.zero-five.space`. Added startup security
assertions, strict CSP, self-hosted fonts, env-aware cookies, TOTP backend, and replaced
the deprecated FastAPI startup event pattern.

## Why

The app was functionally complete but had development defaults that would be dangerous in
production (default JWT secret, external font CDN breaking CSP, HTTP-only cookies in prod).

## Files touched

- `apps/api/app/config.py` — prod startup assertions (JWT secret, password, DB URL)
- `apps/api/app/main.py` — replaced `@app.on_event("startup")` with lifespan context manager
- `apps/api/app/routes/auth.py` — `Secure` cookie flag tied to `APP_ENVIRONMENT`
- `apps/api/app/routes/auth.py` — TOTP validation in login flow (SEC-5)
- `apps/web/public/fonts/SymbolsNerdFont-Regular.ttf` — self-hosted Nerd Font
- `apps/web/src/styles.css` — `@font-face` points to `/fonts/` instead of CDN
- `infra/nginx.conf` — CSP headers; `font-src 'self'` (no CDN exceptions)

## How the pieces connect

**Startup safety:** `config.py` defines `Settings` with Pydantic. In `main.py`'s lifespan
handler, if `settings.environment == "prod"`, it runs assertions. A misconfigured prod
container raises `RuntimeError` before accepting any requests — it can't silently run with
dev defaults.

**Self-hosted fonts:** `SymbolsNerdFont-Regular.ttf` is in `apps/web/public/fonts/`. It
uses a `unicode-range` that covers only Private-Use-Area codepoints (Nerd glyph icons) —
the file is never fetched unless an actual Nerd glyph is on screen. Normal text falls to
Inter. This satisfies `font-src 'self'` without blocking the icon library.

**Env-aware cookies:** `routes/auth.py` reads `settings.environment`. In dev, cookies are
`Secure=False` so HTTP localhost works. In prod, `Secure=True` always. `SameSite=Lax` on
both.

## How to modify this later

- **Change the security assertions:** `config.py → Settings` class, in the `model_validator`.
- **Add a new required env var in prod:** add it to `Settings` and to the prod validator.
- **Add another nginx header:** `infra/nginx.conf → add_header` block. Test that it doesn't
  break the existing CSP by checking the browser console after deploy.
- **Enable fail2ban / Traefik HSTS / backups / Tailscale:** these are infra tasks that
  require SSH access to the VPS. They are documented but not yet applied.
- **Change font:** replace the file in `public/fonts/`, update the `@font-face` src in
  `styles.css`, update the `unicode-range` if the new font covers different codepoints.
