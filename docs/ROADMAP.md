# Roadmap

Status values: `planned`, `in progress`, `verified`.

| Milestone | Status | Exit gate |
|---|---|---|
| 0A — Repository, agents, local scaffold, CI | in progress | All local checks pass, production Compose renders, baseline commit exists |
| 0B — Single-user auth and security | planned | Password login, cookie sessions, TOTP, rate limits, audit trail, security review |
| 0C — First private VPS deployment | planned | Authenticated app available at `brain.zero-five.space`, backup and restore verified |
| 1 — Calendar | in progress | Local calendars, event CRUD, recurrence, responsive views |
| 2 — Notes and graph linking | planned | Block pages, nesting, links, backlinks, search |
| 3 — Finance and investments | planned | Transactions, imports, documents, jurisdiction-aware reporting |
| 4 — Fitness and food | planned | Fast logging, calendar links, goals and statistics |
| 5 — AI assistant | planned | Read tools, confirmed writes, provider abstraction, evaluation set |

## Current milestone checklist

- [x] Canonical repository and documentation archive
- [x] Scoped project instructions and six specialists in Codex and Claude
- [x] Ponytail `full` installed and hook output verified in both tools
- [x] React/FastAPI scaffold and API health contracts
- [ ] PostgreSQL/MinIO development services
- [x] Production-safe Compose and Hub/Traefik labels (static validation)
- [x] CI and application quality checks
- [x] Baseline Git commit
