# Connector strategy

## Source priority

### Tier 1 — manual exports

Start here because they are auditable, user-controlled and easier to test:

- Bank CSV/PDF statements.
- Broker transaction and holding exports.
- Exchange trade, earn, futures and funding exports.
- Wallet address/transaction exports.
- Payslips and annual statements.

### Tier 2 — read-only APIs

Add after reconciliation fixtures exist:

- Banks using regulated/open-banking providers where appropriate.
- Broker APIs.
- Exchange read-only API keys.
- Blockchain indexers.
- Market-price and FX providers.

### Tier 3 — email/document ingestion

Optional, narrowly scoped and user-authorized. Prefer explicit upload over broad mailbox access.

## Connector contract

Every connector implements:

- `discoverCoverage()`
- `fetchRaw(cursor)`
- `fingerprintRaw()`
- `parse(version)`
- `normalize()`
- `listWarnings()`
- `reconcileFixture()`

It returns raw payloads and normalized proposals, never final tax classifications.

## Credentials

- Read-only keys only.
- Encrypt using envelope encryption.
- Never display full secrets after creation.
- Rotate and revoke from the UI.
- Separate credential service from AI context.
- Log use without logging secret values.

## Provider-specific complexities to expect

### Exchanges

- Separate spot, earn, staking, futures and funding exports.
- Different timestamp zones.
- Delisted or renamed assets.
- Missing historical data windows.
- Subaccounts and bot strategies.
- Internal transfer labels that are not consistent.

### Brokers

- Corporate actions.
- Accumulating/distributing fund share classes.
- Foreign withholding.
- Cash FX and automatic conversions.
- Statement corrections.

### Wallets/blockchains

- Self-transfer and change outputs.
- Bridges and wrapped assets.
- Gas paid in a different asset.
- Spam tokens.
- Contract interactions that need protocol decoding.

## Import-quality dashboard

For each source show:

- Coverage period.
- Expected vs imported statements.
- Last successful run.
- Rejected/unknown record count.
- Reconciliation difference.
- Parser version.
- Known limitations.
