# 0252 — Replace Finance database lineage with main migrations

Date: 2026-08-16
Status: accepted

## What changed

The local `secondbrain` PostgreSQL database was backed up, its Alembic revision marker was changed
from the Finance branch's incompatible `038` to the shared ancestor `028`, and the current main
branch migration chain was applied through revision `035`. The database container was also
recreated with the repository's configured `pgvector/pgvector:0.8.6-pg18-trixie` image so migration
`032` could install the `vector` extension. The local database override now attaches `db` to both
the default bridge and isolated application network, making its loopback port reachable by the
host API while retaining the internal `db` alias. Existing Finance tables and data were retained,
but Alembic now tracks the main schema lineage.

The pre-repair custom-format backup is
`/private/tmp/secondbrain-before-main-lineage-20260816.dump`.

## Why

The shared local database had been migrated on the Finance branch, whose revisions `029` through
`038` conflict with different main-branch revisions using the same identifiers. Main therefore
could not resolve the recorded revision and never created `ai_skills`, causing `/api/ai/skills` to
return HTTP 500 and the AI settings route to fail.

## Files touched

- `apps/api/alembic/versions/` — the existing main migration chain was executed unchanged from
  shared ancestor `028` through head `035`.
- `compose.yaml` — its existing pgvector database image declaration was used unchanged to replace
  the stale plain-PostgreSQL container image.
- `.codex-db-port.override.yaml` — attached the local database to both the default bridge and
  internal networks so `127.0.0.1:5432` is actually published.
- `docs/history/CHANGELOG.md` — indexed this operational repair.

## How the pieces connect

Alembic now records revision `035`; the AI base migration and revisions `029`–`035` created the AI
settings, skills, tools, search, and device-grant schema expected by the current API. Migration
`032` depends on PostgreSQL's `vector` extension, which is supplied by the pgvector image already
declared in both Compose configurations. The old Finance tables remain physically present but are
outside the active main Alembic lineage. The default bridge provides host port publishing, while
the internal network preserves service-to-service access through hostname `db`.

## How to modify this later

Do not run the Finance migration line against this database. Use a separate Compose project and
volume for a Finance checkout, or restore the backup before returning to that lineage. Future
branches must use globally unique Alembic revision identifiers and should merge divergent heads
instead of reusing sequential revision numbers. Keep both database networks in the local port
override; an isolated-only network causes Docker to suppress the loopback port mapping.
