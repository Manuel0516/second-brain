# 0222 — Dev pgvector startup fix

Date: 2026-08-15
Status: accepted

## What changed
The development database now uses the same pgvector-enabled PostgreSQL image as production. Local startup documentation now runs the self-contained development Compose file instead of merging it with the production stack.

## Why
Migration 032 requires the `vector` extension, but the development database used plain PostgreSQL. Merging both Compose files also attached development services to the production network and prevented the expected localhost database port from being published.

## Files touched
- `compose.dev.yaml` — switched the development database image to pgvector.
- `README.md` — corrected the local infrastructure startup command.
- `docs/architecture/OVERVIEW.md` — corrected the architecture setup example.

## How the pieces connect
The host-run FastAPI process connects to PostgreSQL through port 5433. The development Compose stack publishes that port and provides pgvector so Alembic migration 032 can create vector-backed agent retrieval columns and indexes.

## How to modify this later
Keep the PostgreSQL major version and pgvector image aligned between `compose.yaml` and `compose.dev.yaml`. Start local infrastructure with only `compose.dev.yaml`; do not merge the production stack into the development command.
