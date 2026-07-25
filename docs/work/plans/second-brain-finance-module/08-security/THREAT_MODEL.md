# Threat model worksheet

| Asset | Threat | Mitigation | Verification |
|---|---|---|---|
| Exchange API key | Exfiltration | Read-only scope, field encryption, isolated credential service | Rotation test and secret scan |
| Evidence PDFs | Unauthorized disclosure | Object ACLs, signed URLs, row-level authorization | Cross-user access tests |
| Ledger | Silent manipulation | revisions, postings, append-only audit, report snapshots | integrity and replay tests |
| AI tools | Unauthorized writes | read-only default, typed proposals, confirmation | adversarial tool-call tests |
| Web/file retrieval | Prompt injection | untrusted-content boundary, allowlisted tools | injection corpus |
| Tax reports | Non-reproducible output | frozen inputs and ruleset hashes | deterministic snapshot test |
| Backups | Data loss/unusable restore | encrypted scheduled backups, restore drills | quarterly restore report |
| Accountant sharing | Overbroad access | scoped, expiring grants | authorization tests |
