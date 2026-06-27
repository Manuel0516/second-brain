# Second Brain

A private, self-hosted life OS for calendar, notes, finances, fitness, food, and AI-assisted capture.

This repository is the canonical implementation. Product specifications and the approved design references live under `docs/`.

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
docker compose -f compose.yaml -f compose.dev.yaml up -d db minio
uv sync --project apps/api --dev
npm install
```

Run the API and web app in separate terminals:

```bash
npm run dev:api
npm run dev:web
```

Open <http://localhost:5173>. Vite proxies `/api` to FastAPI at `localhost:8000`.

## Quality checks

```bash
npm run check
```

This runs frontend formatting, linting, type checks, tests, and build plus backend formatting, linting, type checks, and tests.

## Production containers

The base Compose file is production-safe: only the nginx web container joins the external `traefik` network. API, PostgreSQL, and MinIO have no public ports.

```bash
docker compose config
docker compose build web api
```

Do not deploy this scaffold publicly. Authentication and security hardening are the next milestone.

## Project navigation

- [Context map](docs/CONTEXT.md) — load only the specification relevant to a task.
- [Roadmap](docs/ROADMAP.md) — milestone status and acceptance gates.
- [Architecture](docs/product/ARCHITECTURE.md) — product architecture and phased plan.
- [Decisions](docs/decisions/README.md) — durable, cross-cutting decisions only.

## Coding agents

Ponytail is installed in `full` mode for Codex and enabled at project scope for Claude Code. On a new machine:

```bash
codex plugin marketplace add DietrichGebert/ponytail
codex plugin add ponytail@ponytail
claude plugin marketplace add DietrichGebert/ponytail --scope project
claude plugin install ponytail@ponytail --scope project
```

Start a new Codex session, open `/hooks`, and trust Ponytail's reviewed session and subagent hooks. Restart Claude Code after plugin changes. The root rules preserve the same simplicity contract if a plugin is temporarily unavailable.

Specialists are explicit: request `frontend`, `backend`, `data`, `infrastructure`, `testing`, or `security` by name. Do not run multiple writers against the same subtree.
