# API application instructions

- Load only the affected module specification and auth/security when a trust boundary changes.
- Validate request data with Pydantic and durable invariants with PostgreSQL constraints.
- Keep routes thin but do not add repository/service layers until domain behavior requires them.
- Never expose internal exceptions, secrets, storage paths, or database details in responses.
- Keep public response models explicit and stable.
- Verify with the root `npm run check:api` command.
