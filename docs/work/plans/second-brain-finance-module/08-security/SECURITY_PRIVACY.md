# Finance security and privacy plan

Finance runs inside the existing private-VPN, JWT/httpOnly-cookie, Argon2 and optional TOTP
security model. The module must add data protections without creating a parallel authentication
system.

## Threat model priorities

- Account takeover and unauthorized finance endpoints.
- Exposed statements, identity/tax documents and API credentials.
- Malicious CSV/PDF/image/archive uploads and parser abuse.
- Prompt injection through documents or web pages.
- Overbroad future accountant/adviser access.
- Silent manipulation of calculations, revisions or report history.
- Backup theft or failed restoration.

## Authentication and authorization

- Use `Depends(get_current_user)`/`current_user` on every finance endpoint.
- Owner-only finance access is the first release. All account, asset, event, evidence, report and
  import queries are owner-scoped.
- Future accountant/adviser access extends existing `resource_shares` with tax-year/evidence
  scope, explicit viewer role, expiry and revocation. Do not ship unauditable public links.
- Re-authentication/TOTP confirmation is required before export sharing, credential changes,
  permanent finance deletion or other irreversible actions.
- Never rely on the private VPN as the only authorization boundary.

## Files, credentials and imports

- Validate MIME type, extension, size, archive contents and decompression limits before parsing.
- Store original bytes in MinIO with a content hash and immutable finance metadata.
- Keep raw import payloads and rejected rows; never overwrite them during reprocessing.
- Encrypt external account references and connector credentials. Read-only scopes only.
- Never log credentials, full account numbers, private keys, raw documents or complete prompts.
- Finance evidence must not be removable through the generic Notes image deletion path without an
  explicit audited workflow.

## AI privacy and safety

- Default to local structured data and aggregate results.
- Redact account identifiers, addresses and credentials before cloud-provider calls.
- Uploaded/web content is untrusted data, never an instruction source.
- Use narrow typed tools and server-side authorization; never expose SQL, shell or credentials.
- Reads and deterministic calculations may execute within scope. Write-like actions are proposals
  requiring an application confirmation card.
- Show a context disclosure indicator before cloud AI or web research. Persist source links and
  access dates for current guidance.

## Audit integrity

- Append-only `finance_audit_entries` with actor, action, request hash, prior/new revision and
  reason.
- Hash-chain entries or signed checkpoints when the audit implementation is finalized.
- Report exports include input, evidence, ruleset and audit manifests.
- Corrections create new revisions and invalidate only dependent future report snapshots.

## Release verification

- Dependency and secret scans.
- File/parser fuzzing and archive-bomb tests.
- Owner/share authorization matrix tests.
- Cross-user object access tests.
- Decimal/replay/revision integrity tests.
- Backup restore and MinIO hash verification.
- Prompt-injection, tool-abuse and data-minimization evaluations.
