# Database and migration instructions

- Load the affected module specification and the API instructions; do not load unrelated schemas.
- Encode durable invariants with PostgreSQL constraints where possible.
- One migration should represent one coherent schema change.
- Review generated migrations manually and remove unrelated changes.
- Never destroy or rewrite deployed data without an explicit migration and backup plan.
- Before the first deployment, empty baseline revisions may be replaced; after deployment, migrations are append-only.
