# Coding-agent instructions

## Mission

Implement a trustworthy `/finance` page inside the existing Second Brain app. Optimize for
auditability, deterministic calculations, privacy and clear UX—not feature count.

## Repository fit

- Frontend is React 19 + TypeScript + Vite. Add a lazy-loaded `apps/web/src/modules/finance/`
  module, `/finance` route and active Finance rail action.
- Backend is FastAPI + async SQLAlchemy. Add authenticated endpoints to
  `apps/api/app/routes/finance.py`, models to `apps/api/app/models.py` and numbered Alembic
  migrations; do not create a second service, ORM or database.
- Use the existing JWT/httpOnly-cookie auth, `current_user`, MinIO storage, `files` table and
  generic `Link` graph. Finance-specific ownership and evidence rules must be enforced at the
  finance API boundary.
- Match `docs/design/STYLE_GUIDE.md` and the existing rail→sidebar→canvas shell. The plan's
  mockups are behavioral references, not permission to add colors, tokens or layout patterns.
- Small operations can be synchronous API calls initially. Do not add Redis, BullMQ, a worker
  container or new dependencies until a measured requirement and an approved plan update exist.

## Read before changing code

1. `00-start-here/EXECUTIVE_PLAN.md`
2. `03-architecture/SYSTEM_ARCHITECTURE.md`
3. `04-data/DATA_MODEL.md`
4. `08-security/SECURITY_PRIVACY.md`
5. Relevant epic and UX specification.

## Mandatory engineering rules

- Never use binary floating point for financial values.
- Use PostgreSQL `NUMERIC`, Python `Decimal` and decimal-string JSON at finance API boundaries.
- Never overwrite raw imports, evidence or confirmed history.
- Every financial mutation creates an explicit revision and audit entry.
- Imports and jobs must be idempotent.
- Grouping must never delete or replace raw events.
- AI cannot perform deterministic tax or balance calculations itself.
- The model receives data only through typed, authorized tools.
- No credentials, private keys or full account identifiers in prompts/logs.
- Every report is generated from a frozen snapshot.
- Every feature includes tests for financial invariants and authorization.

## Implementation workflow

For each task:

1. Restate the domain invariant.
2. Identify affected data revisions and audit entries.
3. Write/adjust tests first for calculations or import behavior.
4. Implement the smallest complete vertical slice.
5. Validate accessibility and empty/error states.
6. Update documentation and migration notes.
7. Run invariant, integration and security checks.

## Avoid

- Premature microservices.
- Generic CRUD screens for consequential workflows.
- Hidden background corrections.
- LLM-generated SQL against the production schema.
- Auto-confirming tax residency or legal conclusions.
- Provider-specific logic inside the core domain.
- Building live APIs before file-import fixtures reconcile correctly.
