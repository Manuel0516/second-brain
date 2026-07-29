# 0208 — Close Finance scanner, source-snapshot, schema-drift, and web-warning risks

Date: 2026-07-29
Status: accepted

## What changed

Closed the four risks recorded after the Finance backend delivery. The production API image now
provides ClamAV malware scanning and bounded Tesseract/Poppler OCR. Finance uploads are scanned
before storage, OCR/scanner provenance is retained with immutable evidence, and production startup
fails closed if signatures or tools cannot be verified. Official-guidance research now stores the
exact successful HTTP response bytes and hashes those bytes instead of source metadata. Alembic
metadata was reconciled with the existing Calendar/User/File schema, and migration 038 adds the
immutable guidance snapshot columns and database constraints. The web lint backlog was eliminated,
Finance routes are lazy-loaded, and editor vendors are split below the build warning threshold.

## Why

The Finance completion audit identified missing production evidence tooling, hashes that could not
prove the downloaded source body, legacy non-Finance schema/model drift, 27 existing web lint
warnings, and an oversized production bundle. The user asked to remove all four risks before
continuing.

## Files touched

- `.env.example`, `compose.yaml`, `apps/api/Dockerfile`, and `apps/api/entrypoint.sh` — configure,
  install, seed, refresh and verify the production evidence toolchain.
- `apps/api/app/config.py` and `apps/api/app/main.py` — add bounded Finance timeouts and fail-closed
  production dependency checks.
- `apps/api/app/services/finance_evidence.py`, `finance_imports.py`, and
  `apps/api/app/routes/finance_ingestion.py` — scan before storage and perform bounded PDF/image
  extraction with immutable provenance.
- `apps/api/app/services/finance_ai.py` and `apps/api/app/routes/finance_assistant.py` — safely fetch
  official HTTPS sources, hash exact response bytes, and audit failures without partial rows.
- `apps/api/app/models.py` and `apps/api/alembic/versions/038_finance_guidance_snapshots.py` — align
  legacy metadata and persist immutable guidance bodies with byte/status constraints.
- `apps/api/tests/test_finance_evidence.py`, `test_finance_imports.py`,
  `test_finance_ingestion_api.py`, `test_finance_ai_security.py`, and
  `test_finance_invariants.py` — cover scanner/OCR limits, attack/failure paths, snapshots and
  schema integrity.
- `apps/web/src/context/`, `apps/web/src/modules/fitness/`, `apps/web/src/modules/notes/`, and their
  consumers — move refresh-safe exports out of component modules and resolve hook warnings.
- `apps/web/src/modules/finance/FinanceAssistant.tsx`, `FinanceReports.tsx`, `apps/web/src/App.tsx`,
  and `apps/web/vite.config.ts` — remove effect-time state resets, lazy-load Finance and split the
  editor vendor graph.
- `docs/architecture/BACKEND.md`, `docs/architecture/DATABASE.md`, `infra/DEPLOY.md`, and this
  history index — document the resulting runtime, schema and operational contract.

## How the pieces connect

The ingestion route validates the upload, runs ClamAV, performs bounded OCR where applicable, and
only then writes content-addressed MinIO data plus immutable database metadata. Production lifespan
checks exercise the same binaries and signature database used by requests. Research tools resolve
and validate official destinations before every request/redirect, stream a bounded body, persist it
with response metadata, and cite its byte hash. Migration 038 makes those persisted facts mandatory;
the reconciled SQLAlchemy metadata now produces a clean `alembic check`. Web module extraction and
route/vendor splitting preserve behavior while allowing ESLint and Vite to complete without the
previous warning debt.

## How to modify this later

Keep evidence scanning before `upload_object` and retain the fail-closed production behavior. When
adding OCR formats or languages, update the Docker image, runtime dependency check, extraction
limits and attack fixtures together. Guidance sources must continue storing the exact bytes used to
compute `content_hash`; do not substitute parsed text or metadata. Add future database changes in a
new serialized migration and require `alembic check` to remain empty. Keep React provider exports
separate from refreshable component modules and adjust the existing Vite split group if editor
dependencies change.
