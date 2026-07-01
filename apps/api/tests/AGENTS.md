# API test instructions

These rules extend the root `AGENTS.md` and `apps/api/AGENTS.md`. Read both first.

## Rules

- Test public status codes and response contracts — not internal implementation details.
- Cover authentication failures and trust-boundary edge cases before happy-path variants.
- Prefer small, focused fixtures. Use dependency injection to substitute test sessions and
  users — do not mock entire route handlers.
- Do not assert on private call order, internal function names, or SQL query structure.
- One test = one behavior. Name tests after the behavior, not the function being called.

## Verification

```bash
npm run check:api   # runs ruff + mypy + pytest
```
