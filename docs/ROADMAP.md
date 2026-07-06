# Roadmap

Status values: `planned`, `in progress`, `verified`.

| Milestone | Status | Exit gate |
|---|---|---|
| 0A — Repository, agents, local scaffold, CI | verified | All local checks pass, production Compose renders, baseline commit exists |
| 0B — Single-user auth and security | verified | Password login, cookie sessions, TOTP, rate limits, audit trail, admin panel |
| 0C — First private VPS deployment | in progress | Authenticated app available at `brain.zero-five.space`, backup and restore verified |
| 1 — Calendar | in progress | Local calendars, event CRUD, recurrence, responsive views |
| 2 — Notes and graph linking | verified | Rich pages, nesting, links, backlinks, search |
| 3 — Finance and investments | planned | Transactions, imports, documents, jurisdiction-aware reporting |
| 4 — Fitness and food | verified — **fitness closed out (F1–F3), food complete (Phases 1–4, history 0116–0122)** | Fast logging, calendar links, goals and statistics |
| 5 — AI assistant | planned | Read tools, confirmed writes, provider abstraction, evaluation set |

## Current milestone checklist

- [x] Canonical repository and documentation archive
- [x] Scoped project instructions and six specialists in Codex and Claude
- [x] Ponytail `full` installed and hook output verified in both tools
- [x] React/FastAPI scaffold and API health contracts
- [x] PostgreSQL/MinIO development services (MinIO wired end-to-end for note image uploads, history 0030–0032)
- [x] Production-safe Compose and Hub/Traefik labels (static validation)
- [x] CI and application quality checks
- [x] Baseline Git commit
- [x] Settings module (General + Calendar pages)
- [x] Admin panel (user management, roles, inline editing)
- [x] Deploy hardening (config guard, lifespan, env-aware cookies, TOTP, security headers, migrations-on-boot)
- [x] Page transitions & light mode fixes
- [x] Notes module (rich pages, nesting/trash, event links, mentions, backlinks, search)
- [x] Notes media & layout (image uploads, bookmark cards, table controls + resizing, multi-column drag layout, text alignment)
- [x] Notes settings page (list marker schemes) — notes plan fully complete
- [x] Mobile notes pass (todo saving, emoji picker, list deletion, keyboard layout, front-page overview)
