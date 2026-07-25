# Domain glossary

| Term | Definition |
|---|---|
| Raw import | Original file or API payload exactly as received. |
| Raw record | One source row/message extracted from a raw import. |
| Financial event | Canonical description of something that happened financially. |
| Event component | Quantity, fee, withholding, collateral or other part of an event. |
| Posting | Debit/credit-style movement used to reconstruct balances. |
| Evidence | Source document, statement, transaction hash or contract supporting a fact. |
| Tax treatment | Jurisdiction- and year-specific interpretation of an event. |
| Review group | UX summary of compatible raw or canonical events. It never replaces them. |
| Reconciliation | Proof that opening balances plus movements equal closing balances. |
| Valuation | Conversion of an amount or asset quantity into a reporting currency using a documented policy. |
| Tax profile | A tax-year workspace containing jurisdictions, residency evidence and reporting configuration. |
| Rule pack | Versioned deterministic tax-classification and calculation rules for one jurisdiction/year. |
| Open question | Missing evidence, uncertain rule, residency issue or unresolved discrepancy requiring attention. |
| Source provenance | How a value was obtained: import, API, blockchain, calculation or manual override. |
