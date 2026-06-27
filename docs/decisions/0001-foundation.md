# ADR 0001: Foundation layout and operating model

Status: accepted

## Context

Second Brain is a long-lived private application with a React frontend, FastAPI backend, PostgreSQL, object storage, and several domain modules. It must remain understandable to both humans and coding agents as it grows.

## Decision

- Use a small npm workspace for TypeScript and a separate uv project for the Python API; do not add a monorepo orchestrator.
- Run web and API processes on the host during development, with PostgreSQL and MinIO in Docker.
- Serve production through one nginx web container on the existing Traefik network; keep all other services private.
- Use scoped instructions and a task-to-document context map rather than loading the full specification set.
- Prefer the smallest readable implementation and add abstractions only after demonstrated reuse.

## Consequences

Local reloads stay fast, production networking stays narrow, and agent context remains focused. A small amount of development Compose override configuration is maintained separately from the production-safe base.
