# Implementation plans

Hand-off build specs for the next phase. Each is self-contained and written so an
implementing AI (Codex / DeepSeek) or developer can execute it top to bottom.
Both require `npm run check` (web) and `npm run check:api` (api) to pass before a
task is considered done, and both reuse the existing design tokens/components in
`apps/web/src/styles.css` — no new visual language.

| Plan | Scope | Status |
|---|---|---|
| [SETTINGS_IMPLEMENTATION_PLAN.md](SETTINGS_IMPLEMENTATION_PLAN.md) | Settings area: working **General** + **Calendar** pages (username/email/password, theme & preferences, favourite emojis/colours that drive the event editor, calendar defaults, export). Other modules shown as "Soon". Also includes **Admin panel** (user management, roles, inline editing, delete users). | ✅ completed |
| [DEPLOY_HARDENING_PLAN.md](DEPLOY_HARDENING_PLAN.md) | First safe public deploy at `brain.zero-five.space`: secret guards, security headers + self-hosted font, migrations-on-boot, env-aware cookies, Traefik TLS/HSTS, fail2ban, backups/restore, optional 2FA & Tailscale. | ✅ code-level tasks complete* |

\* SEC-1 (config guard), SEC-4 (env cookies), SEC-5 (TOTP 2FA), SEC-9 (lifespan) are implemented.
  SEC-2 (headers + nginx config) done, Nerd Font self-hosting noted as remaining. SEC-3 (entrypoint) done.
  SEC-6 (fail2ban), SEC-7 (Traefik labels), SEC-8 (backups), SEC-10 (Tailscale) are infra-level
  and require VPS owner approval to deploy.

Read order for an implementer: the relevant plan, then the spec rows it cites
(`docs/CONTEXT.md` maps task → spec), then the nearest `AGENTS.md`.
