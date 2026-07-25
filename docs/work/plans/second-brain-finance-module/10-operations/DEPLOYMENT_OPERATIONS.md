# Finance deployment and operations

Finance deploys with the existing Second Brain Docker Compose stack. The default topology stays
small:

- existing Traefik/nginx web container;
- existing FastAPI API container;
- existing PostgreSQL database;
- existing MinIO object storage.

There is no finance-specific database, Next.js container, Redis service or worker container in
the first implementation slice.

## Work execution

Small import previews, review confirmations, reconciliation runs and export creation may run as
bounded authenticated API operations. The existing API lifespan already hosts bounded application
polling; use it only for safe, idempotent finance maintenance if needed.

If real fixture sizes or report generation prove that a worker is required, add a narrowly scoped
worker/queue as a later infrastructure change. Document its image, environment, retry policy,
idempotency key, health check, backup and failure visibility in the root `compose.yaml`; do not
use this folder's old standalone Compose file as a second deployment.

## Observability

Track:

- import duration, coverage, duplicate and rejection counts;
- parser version and reprocessing runs;
- reconciliation differences and unresolved questions;
- report generation duration and snapshot IDs;
- evidence upload/hash failures;
- AI tool errors, citations and privacy mode;
- unauthorized access attempts.

Never log raw credentials, full documents, private keys or sensitive prompts by default.

## Backup and restore

- Continue PostgreSQL backups and MinIO backups independently.
- Include finance row counts, latest migration, sample event lineage and hash verification in
  restore drills.
- Restore into an isolated environment before declaring a backup usable.
- Keep the encryption-key backup procedure separate from database/object backups.

## Migrations and recalculation

- Forward-only Alembic migrations; never edit an applied migration.
- Finance backfills are versioned, resumable and report their invariant checks.
- Financial recalculation creates revisions; it never rewrites confirmed history.
- A schema/migration is not complete until owner, foreign-key, uniqueness and numeric constraints
  are tested.
