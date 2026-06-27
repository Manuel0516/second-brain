# API test instructions

- Test public status codes and response contracts.
- Cover trust-boundary failures and destructive edge cases before happy-path variants.
- Prefer small fixtures and dependency substitution over broad mocks.
- Do not assert private call order or implementation details.
