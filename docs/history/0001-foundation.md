# 0001 — Foundation layout and operating model

Date: 2026-06-25
Status: accepted

## What changed

Established the monorepo structure, tech stack choices, and development operating model for
the entire project.

## Why

Second Brain needed a foundation that would stay understandable to both humans and AI agents
as many modules were added over time. The choices had to minimize accidental complexity while
keeping the stack familiar to the owner (Python backend, React frontend).

## Files touched

- `package.json` (root) — npm workspace configuration
- `apps/web/` — Vite + React + TypeScript scaffold
- `apps/api/` — FastAPI + SQLAlchemy + Alembic scaffold
- `compose.yaml` + `compose.dev.yaml` — PostgreSQL + MinIO in Docker for local dev
- `docs/product/ARCHITECTURE.md` — full project scope and phase plan

## How the pieces connect

The workspace root ties together two independent apps via npm workspaces. The web app
communicates with the API exclusively through `/api` HTTP calls (proxied by Vite in dev,
routed by nginx in prod). They share no code at runtime — types could be generated from
backend schemas in the future via the `packages/shared-types/` workspace (not yet used).

## How to modify this later

- **Add a new npm workspace:** add a path to `package.json → workspaces[]` and create the
  folder.
- **Change the Python version:** update `apps/api/.python-version` and the Docker base image.
- **Change the database:** update `apps/api/app/database.py` connection string and
  `alembic.ini`. All models are in `models.py` — SQLAlchemy abstracts the dialect.
- **Add a new Docker service:** add it to `compose.yaml` (prod) or `compose.dev.yaml` (dev
  override). Never add dev-only services to `compose.yaml`.
