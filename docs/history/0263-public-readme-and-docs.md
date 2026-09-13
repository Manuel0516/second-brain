# 0263 — Public README and documentation

Date: 2026-09-13
Status: accepted

## What changed

Rebuilt the repository README around the features that are available today and
added a compact `docs/public/` documentation set for users, self-hosters, and
contributors. Added six optimized product GIFs showing desktop and mobile
workflows, including a calendar event linked directly to a planned workout.

Added an idempotent, development-only showcase-data seeder. Replaced personal
deployment defaults and examples with configurable or neutral values, made the
Telegram containers opt-in Compose profiles, parameterized the deployment
workflow, and removed tracked machine-specific agent session/configuration
files.

## Why

The project is being prepared for a public repository. A visitor needs an
accurate product overview, a fast path to a working local instance, visual proof
of the current experience on desktop and mobile, and configuration examples
that do not expose one maintainer's private deployment details.

## Files touched

- `README.md` — public landing page, current feature matrix, media, quick start,
  security notes, and documentation links
- `docs/public/*.md` — public getting-started, feature, configuration,
  self-hosting, architecture, and contribution guides
- `docs/assets/*.gif` — optimized desktop, mobile, and linked-record demos
- `scripts/seed_demo.py` — deterministic local showcase account and connected
  module data
- `.env.example`, `compose.yaml`, and `compose.dev.yaml` — neutral defaults,
  correct host-side development ports, configurable hostname, and opt-in bot
- `.github/workflows/deploy.yml` — secret-backed SSH port and deployment path
- `apps/api/app/config.py` and `apps/bot/bot.py` — neutral public defaults
- `infra/AGENTS.md` and `infra/DEPLOY.md` — public-safe deployment references
- `.gitignore` — excludes generated agent sessions and machine-local config
- `.analysis/*`, `.mcp.json`, and `.codex/config.toml` — removed tracked local
  session and machine configuration artifacts
- `docs/architecture/*.md`, `docs/design/design-canvas/Second Brain.dc.html`,
  `docs/work/plans/embedded-agent/UX_REVIEW_GUIDE.md`, `docs/ROADMAP.md`, and
  selected historical entries — replaced personal deployment identifiers with
  neutral examples

## How the pieces connect

The root README routes readers only into `docs/public/`. Those guides describe
the current React/FastAPI application and reference the captured GIFs in
`docs/assets/`. The seeder writes through the same SQLAlchemy models as the API,
so its calendars, events, pages, workouts, meals, and generic links exercise the
real interface. Compose and environment examples provide the runtime described
by the guides, while the CI deployment workflow keeps installation-specific
paths in repository secrets.

## How to modify this later

Keep the public feature guide descriptive rather than aspirational: add a
feature only after it ships. Regenerate demo data in `scripts/seed_demo.py`, run
it on a local non-production database, capture both relevant viewport sizes,
and replace the optimized GIF in `docs/assets/`. When the deployment topology or
required environment variables change, update the configuration and
self-hosting guides in the same change. Never commit raw capture frames,
machine-local agent output, `.env`, or real account identifiers.
