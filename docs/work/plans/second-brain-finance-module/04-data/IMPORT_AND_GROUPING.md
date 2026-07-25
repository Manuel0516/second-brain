# Import, deduplication and micro-event grouping

## Import pipeline

```text
Upload/API payload
  -> malware/type checks
  -> immutable object storage
  -> file fingerprint
  -> parser selection
  -> preview and mapping
  -> raw records
  -> canonical event proposals
  -> duplicate and transfer matching
  -> review groups
```

## Idempotency

An import-run key should combine:

- user/source account.
- file or API cursor identity.
- parser version.
- import mode.

Re-running the same parser must return the prior result or create a clearly labelled reprocessing run without duplicate postings.

## Micro-event strategy

### Never aggregate at ingestion

Every reward/accrual remains a raw record and canonical event. Aggregation occurs in a materialized review view.

### Grouping key

```text
owner
+ account
+ source
+ asset
+ canonical event type
+ tax-day policy/date
+ candidate treatment
+ valuation policy
+ warning-free status
```

### Group summary fields

- Member count.
- First/last timestamp.
- Total native quantity.
- Total report-currency value.
- Min/max/weighted-average rate.
- Source file/API run.
- Evidence coverage.
- Confidence rationale.

### Reusable review policy

After the user confirms a group, offer:

> Apply this decision automatically to future events only when the same source, asset, event type, jurisdiction, valuation policy and evidence conditions match.

Policies are versioned and revocable. Previously confirmed records do not change silently.

## Transfer matching

Score candidates using:

- Same asset and quantity adjusted for network fee.
- Compatible timestamps.
- Known owner-controlled accounts.
- Transaction hash or provider reference.
- Network and address evidence.

High-confidence matches can be suggested. Confirmation remains explicit until the source pair has a validated matching policy.

## Corrections and restatements

If an exchange republishes a statement or API history changes:

- retain both source snapshots.
- compare differences.
- mark affected events.
- create new revisions.
- invalidate dependent report snapshots.
- show a user-facing restatement explanation.
