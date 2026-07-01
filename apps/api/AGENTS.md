# API application instructions

These rules extend the root `AGENTS.md`. Read that first.

## Before any backend task

- Read `docs/architecture/BACKEND.md` for structure and request lifecycle.
- Read `docs/architecture/DATABASE.md` before touching models or migrations.
- Read only the affected module spec from `docs/product/` — do not load unrelated specs.
- When a trust boundary changes (new auth check, new public endpoint), also read
  `docs/product/AUTH_AND_SECURITY.md`.

## Code rules

- Validate all request data with Pydantic models defined in the route file.
- Encode durable invariants (uniqueness, not-null, foreign keys) as PostgreSQL constraints
  in `models.py` — not only in application code.
- Keep routes thin: query the DB, validate, return. Do not add service/repository layers
  until domain behavior genuinely requires shared logic across multiple routes.
- Never expose internal exceptions, stack traces, secrets, storage paths, or raw database
  error messages in API responses.
- Keep public response models explicit — Pydantic `response_model=` on every route.
- Use `Depends(current_user)` on every route that requires authentication. Never check
  cookies or JWTs manually inside route functions.

## Verification

Run `npm run check:api` before declaring any task complete.
