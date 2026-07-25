# Tax and jurisdiction engine

## Core principle

The tax engine consumes immutable financial facts and produces **versioned candidate or confirmed interpretations**. It does not modify the facts.

```text
Financial event revision
    + tax profile
    + residency facts
    + jurisdiction/year rule pack
    + valuation policy
    = tax treatment + calculation trace
```

## Rule-pack structure

```text
tax/
  se/
    2026/
      manifest.yaml
      classifications/
      calculations/
      schedules/
      sources.md
      fixtures/
  es/
    2026/
      ...
```

Each manifest contains:

- Jurisdiction and tax year.
- Version and release date.
- Official source references.
- Supported event types.
- Known limitations.
- Required facts/evidence.
- Validation fixtures.

## Deterministic classification

Rules should return:

- Candidate category.
- Required inputs.
- Missing facts.
- Calculation path.
- Confidence based on fact completeness, not model intuition.
- Legal/source references.
- Human-review requirement.

## Residency workspace

Store evidence, not just a dropdown:

- Physical-presence periods and travel evidence.
- Registered addresses.
- Housing availability.
- Work/study periods.
- Family and economic ties where relevant.
- Tax-residence certificates.
- Claims made in each jurisdiction.
- Adviser determination and date.
- Treaty-review checklist.

The app may calculate days and flag conflicting criteria, but `confirmed_tax_residence` and `treaty_residence` require human confirmation.

## Valuation policies

A valuation policy identifies:

- Target reporting currency.
- Rate source.
- Rate date/time convention.
- Non-trading-day behavior.
- Crypto price source and market selection.
- Whether source-provided values are accepted.
- Override procedure.

Store every applied rate. Never overwrite a historical valuation when a provider changes its dataset.

## Treatment workflow

1. Rule engine evaluates complete facts.
2. Missing facts become open questions.
3. Candidate treatment appears in review.
4. User/adviser confirms or edits with rationale.
5. Confirmation creates a treatment revision.
6. Dependent schedules and snapshots are recalculated.

## Reporting outputs

- Factual event schedule.
- Candidate/confirmed tax schedule.
- Valuation schedule.
- Foreign-asset inventory.
- Withholding tax schedule.
- Residency evidence summary.
- Open questions.
- Evidence and source manifest.

## Legal-content maintenance

- Check official sources before each tax-year rule pack is released.
- Record access/update dates.
- Add regression fixtures for every rule change.
- Never silently apply a new ruleset to a frozen prior export.
- Display “guidance last reviewed” in the UI.
