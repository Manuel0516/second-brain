# Build checklist

## Before coding

- [ ] Confirm the existing self-hosted Second Brain deployment remains the target.
- [ ] List every bank, broker, exchange, wallet and bot subaccount.
- [ ] Obtain representative anonymized exports.
- [ ] Choose first tax year and jurisdictions.
- [ ] Define materiality and reconciliation tolerance policies.
- [ ] Confirm the initial event vocabulary.

## Foundation

- [ ] Repository-native `/finance` route and module shell.
- [ ] Existing authentication and finance ownership matrix.
- [ ] PostgreSQL/Alembic migrations in `apps/api`.
- [ ] Python `Decimal`, PostgreSQL `NUMERIC` and decimal-string schemas.
- [ ] Existing MinIO object storage plus finance evidence hashes.
- [ ] Idempotency keys for financial mutations; no queue until measured necessary.
- [ ] Append-only finance audit entries.

## First vertical slice

- [ ] Add one account.
- [ ] Upload one CSV.
- [ ] Preview and commit import.
- [ ] Create raw records and canonical events.
- [ ] Generate postings.
- [ ] Group passive-income micro-events.
- [ ] Review and confirm group.
- [ ] Reconcile closing balance.
- [ ] Export evidence-linked schedule.

## Before AI

- [ ] Typed semantic financial tools exist.
- [ ] Exact answers do not require embeddings.
- [ ] Data-minimization gateway exists.
- [ ] Proposal/confirmation workflow exists.
- [ ] Prompt-injection tests exist.
- [ ] Web citations and access dates are persisted.

## Before v1

- [ ] Backup restoration passed.
- [ ] Sweden/Spain rule packs reviewed.
- [ ] Frozen export reproducibility passed.
- [ ] All primary sources reconcile.
- [ ] Accountant sharing permissions tested.
- [ ] No critical security findings.
