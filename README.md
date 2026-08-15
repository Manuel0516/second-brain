# Second Brain

A private, self-hosted life OS for calendar, notes, finances, fitness, food, and AI-assisted capture.

This repository is the canonical implementation. Product specifications and design references live under `docs/`.

## Prerequisites

- Node.js 24 or newer with npm
- Python 3.13 or newer
- [uv](https://docs.astral.sh/uv/)
- Docker Engine with Docker Compose (for PostgreSQL and MinIO)

On CachyOS, Docker requires one local administrator step:

```bash
sudo pacman -S --needed docker docker-compose
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

Log out and back in after the group change, then verify with `docker version` and `docker compose version`.

## Local development

```bash
cp .env.example .env
colima start
docker compose -f compose.dev.yaml up -d db minio
uv sync --project apps/api --dev
npm install
```

Start the complete development stack:

```bash
./scripts/dev-start.sh
```

Open <http://localhost:5173>. Vite proxies `/api` to FastAPI at `localhost:8000`.

Stop the complete development stack:

```bash
./scripts/dev-stop.sh
```

The start script also launches the Telegram bridge when `TELEGRAM_BOT_TOKEN` is configured.

## Quality checks

```bash
npm run check
```

This runs frontend formatting, linting, type checks, tests, and build plus backend formatting, linting, type checks, and tests.

## Production containers

The base Compose file is production-safe: only the nginx web container joins the external `traefik` network, and Traefik limits that route to the WireGuard VPN subnet. API, PostgreSQL, and MinIO have no public ports.

```bash
docker compose config
docker compose build web api
docker compose up -d
```

`up -d` only recreates the containers whose image changed (`web`, `api`) — it never
touches `db`, `minio`, or their volumes. Migrations run automatically on `api` startup
(`entrypoint.sh`, additive only — never drops data) and starter agent skills are
re-seeded by name, so an existing skill you've edited or a memory the agent has learned
is never overwritten by an update. **Never run `docker compose down -v` or `docker
compose down --volumes`** on this deployment — that deletes the named volumes
(`postgres-data`, `minio-data`, `bot-data`) and everything in them, including all AI
memories/skills/conversations. A plain `docker compose down` (no `-v`) followed by
`up -d` is safe and preserves everything.

## Project navigation

- [Agent guide](AGENTS.md) — universal rules for every AI working on this project.
- [Context map](docs/CONTEXT.md) — which spec to read for each type of task.
- [What's being built now](docs/work/NOW.md) — current active work and bug queue.
- [Architecture overview](docs/architecture/OVERVIEW.md) — system map and dev setup.
- [Style guide](docs/design/STYLE_GUIDE.md) — UI rules and design tokens.
- [History](docs/history/CHANGELOG.md) — log of every significant change.
- [Roadmap](docs/ROADMAP.md) — milestone status.

## Coding agents

Ponytail is installed in `full` mode for Codex and enabled at project scope for Claude Code. On a new machine:

```bash
codex plugin marketplace add DietrichGebert/ponytail
codex plugin add ponytail@ponytail
claude plugin marketplace add DietrichGebert/ponytail --scope project
claude plugin install ponytail@ponytail --scope project
```

Start a new Codex session, open `/hooks`, and trust Ponytail's reviewed session and subagent hooks. Restart Claude Code after plugin changes.

All AI tools (Claude Code, Codex, GitHub Copilot) follow the same rules defined in `AGENTS.md`.
