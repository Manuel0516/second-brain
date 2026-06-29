# Implementation plans

Hand-off build specs for the next phase. Each is self-contained and written so an
implementing AI (Codex / DeepSeek) or developer can execute it top to bottom.
Both require `npm run check` (web) and `npm run check:api` (api) to pass before a
task is considered done, and both reuse the existing design tokens/components in
`apps/web/src/styles.css` — no new visual language.

| Plan | Scope | Status |
|---|---|---|
| [SETTINGS_IMPLEMENTATION_PLAN.md](SETTINGS_IMPLEMENTATION_PLAN.md) | Settings area: working **General** + **Calendar** pages (username/email/password, theme & preferences, favourite emojis/colours that drive the event editor, calendar defaults, export). Other modules shown as "Soon". | planned |
| [DEPLOY_HARDENING_PLAN.md](DEPLOY_HARDENING_PLAN.md) | First safe public deploy at `brain.zero-five.space`: secret guards, security headers + self-hosted font, migrations-on-boot, env-aware cookies, Traefik TLS/HSTS, fail2ban, backups/restore, optional 2FA & Tailscale. | planned |

Read order for an implementer: the relevant plan, then the spec rows it cites
(`docs/CONTEXT.md` maps task → spec), then the nearest `AGENTS.md`.
