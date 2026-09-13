# Contributing

Contributions are welcome when they improve an implemented module or make the
self-hosted experience safer and clearer.

## Development workflow

1. Follow [Getting started](getting-started.md).
2. Create a focused branch.
3. Reuse an existing component, route, or platform capability before adding an
   abstraction or dependency.
4. Add or update tests with behavior changes.
5. Run the full quality gate:

```bash
npm run check
```

6. Open a pull request that explains the user-visible behavior and any
   migration or configuration impact.

## Repository conventions

- Frontend code is React and TypeScript under `apps/web/src`.
- Backend code is FastAPI and SQLAlchemy under `apps/api/app`.
- Database changes require an Alembic migration.
- UI work must reuse the CSS variables and established component patterns in
  `apps/web/src/styles.css`.
- Do not add dependencies without a concrete reason.
- Do not include private hostnames, real account data, credentials, or `.env`
  contents in issues, fixtures, screenshots, or commits.

## Pull-request checklist

- [ ] The change is scoped to an available feature.
- [ ] Tests cover the changed behavior.
- [ ] `npm run check` passes locally.
- [ ] New configuration is documented in `.env.example` and
      [Configuration](configuration.md).
- [ ] User-facing behavior is documented in [Features](features.md).
- [ ] No secrets or personal data are present in the diff.

## Reporting security issues

Do not open a public issue containing an exploit, credentials, or private user
data. Contact the repository owner privately with reproduction steps and the
affected revision.
