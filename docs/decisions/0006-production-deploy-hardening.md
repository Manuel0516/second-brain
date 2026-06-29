# ADR 0006: Production deploy hardening decisions

Status: accepted (code-level tasks complete; infra tasks pending VPS owner)
Date: 2026-06-29

## Context

Plan B (DEPLOY_HARDENING_PLAN.md) was implemented at the code level to bring
the stack to a safe first public deploy at `brain.zero-five.space`. SEC-6
(fail2ban), SEC-7 (Traefik labels/HSTS middleware), SEC-8 (backups), and
SEC-10 (Tailscale) are infra-level and require explicit VPS owner approval
before being applied.

## Decisions

**Fail fast on insecure defaults in prod (SEC-1).**
`app/config.py` gains an `environment: Literal["dev","prod"]` field. In `prod`,
startup asserts that `jwt_secret_key` is non-default and ≥ 32 chars,
`initial_user_password` is not `"changeme"`, and the database URL is not
pointing at a local default. A misconfigured prod container raises `RuntimeError`
and never serves traffic.

**HSTS added by Traefik, not nginx (SEC-2 / SEC-7).**
nginx sends the other hardening headers (X-Content-Type-Options, X-Frame-Options,
Referrer-Policy, Permissions-Policy, CSP). HSTS is a TLS-terminator concern —
sending it from nginx over plain HTTP is incorrect, so it goes on the Traefik
headers middleware (to be applied when SEC-7 is deployed).

**Nerd Font self-hosted to satisfy strict CSP (SEC-2).**
The Symbols Nerd Font was loaded from `cdn.jsdelivr.net`. The strict CSP
`font-src 'self'` blocks that. The font is now served from `/public/fonts/` via
nginx, removing the external dependency and keeping the CSP tight.

**`@app.on_event("startup")` replaced with lifespan handler (SEC-9).**
The deprecated FastAPI startup event hook is replaced with a `lifespan` context
manager. Startup and shutdown logic is co-located and the deprecation warning is
gone.

**Env-aware cookies (SEC-4).**
`Secure` flag on session cookies is now controlled by `APP_ENVIRONMENT`. In
`dev`, `Secure=False` so HTTP localhost works. In `prod`, `Secure=True` always.

**TOTP 2FA wired up (SEC-5).**
TOTP-based two-factor authentication is implemented behind the existing
`/settings/security` route (currently a "Soon" stub in the UI). Backend generates
and validates TOTP codes; UI integration follows when the Security settings page
ships.

## Consequences

- A prod container misconfigured with default secrets fails loudly at startup
  rather than silently serving insecure traffic.
- The CSP is strict (`font-src 'self'`) with no CDN exceptions.
- Infra tasks (fail2ban, Traefik HSTS middleware, backups, Tailscale) are
  documented and blocked on VPS owner approval — not forgotten.
