# Product requirements document

## Primary user outcome

The user can maintain a complete financial source of truth throughout the year and create a trustworthy, jurisdiction-specific tax evidence package without manually reviewing every micro-event.

## Product boundaries

### In scope for v1

- Multi-jurisdiction tax-year profiles.
- Account and asset registry.
- Bank, broker, exchange and wallet imports.
- Evidence/document vault.
- Event normalization and double-entry postings.
- Review grouping and exception queues.
- Monthly and year-end reconciliation.
- Funds, gold, crypto, staking and futures subledgers.
- Currency valuation and rate provenance.
- Sweden/Spain candidate tax treatments.
- Accountant-ready ZIP/CSV/PDF-summary exports.
- Read-oriented AI finance assistant with cited web research.

### Explicitly out of scope for v1

- Automatic tax filing.
- Autonomous trading or rebalancing.
- Personal credit scoring.
- General household budgeting as the primary workflow.
- Guaranteed legal or tax conclusions.
- Automatic bank credential scraping.
- A universal tax engine for every country.

## User roles

### Owner

Full control over sources, data, exports and AI permissions.

### Accountant/adviser

Time-limited, read-only access to selected tax years and evidence packages. No access to credentials or unrelated years.

### System-generated operation

The API/import parser can parse imports and create derived suggestions, but cannot confirm a tax
treatment or delete originals. A separate worker is optional later and is not part of the first
repository-native slice.

## Core jobs to be done

- “Show me what still prevents my 2026 tax package from being complete.”
- “Group my hourly staking rewards so I review one daily record, not hundreds.”
- “Explain why this crypto transfer was classified as non-taxable and show the source records.”
- “Reconcile the equity of my futures bot between two statements.”
- “Show all foreign accounts and year-end balances relevant to Spain.”
- “Prepare everything an accountant needs, while clearly marking uncertain treatments.”
- “Answer a question about my own finances and current official guidance with citations.”

## Functional requirements

### Imports

- Upload CSV, JSON, PDF, image or archive.
- Preview parsing before committing.
- Save parser version and source fingerprint.
- Detect duplicates at file, row and event level.
- Support reprocessing without duplicating events.
- Store rejected rows with reasons.

### Event normalization

- Preserve source timestamp, timezone and external ID.
- Store assets by stable identifiers, not symbol alone.
- Represent fees, tax withholding and funding as separate components.
- Generate balanced postings.
- Distinguish internal transfers from acquisitions/disposals.

### Review

- Group presentation records by compatible source, asset, event type, date and candidate tax treatment.
- Allow confirm, edit, split, merge-compatible and defer.
- Bulk-confirm only when all members share the same validated policy.
- Show confidence as explanation, not as proof.
- Surface exceptions before routine records.

### Evidence

- Hash and retain original files.
- Link one document to many events and one event to many documents.
- Record extraction confidence and parser version.
- Support missing-document requests and expiry reminders.
- Export a machine-readable evidence index.

### Reconciliation

- Opening balance + movements = closing balance.
- Account-level, asset-level and fiat-value views.
- Reconciliation difference must be visible and explainable.
- A report cannot be marked complete while a material difference remains unresolved.

### Reporting

- Separate factual schedules from tax interpretations.
- Include rule version, source and calculation method.
- Exports are reproducible and assigned an export-run ID.
- Re-running the same frozen tax package should produce equivalent numbers.

## Non-functional requirements

- Decimal-safe money and quantity calculations.
- Idempotent imports and background jobs.
- Complete audit history.
- Encryption in transit and at rest.
- Restore-tested backups.
- WCAG 2.2 AA target for core workflows.
- Responsive desktop and mobile capture/review.
- No hidden AI mutation of financial records.
