# Second Brain documentation

This folder documents the features that are available in the current public
build. It deliberately excludes private deployment details, implementation
diaries, and speculative modules.

## Start here

| Guide                                 | What it covers                                               |
| ------------------------------------- | ------------------------------------------------------------ |
| [Getting started](getting-started.md) | Run Second Brain locally and load the optional showcase data |
| [Feature guide](features.md)          | Calendar, notes, fitness, food, AI, sharing, and settings    |
| [Configuration](configuration.md)     | Environment variables and optional integrations              |
| [Self-hosting](self-hosting.md)       | Production Compose, Traefik, hardening, and backups          |
| [Architecture](architecture.md)       | How the React, FastAPI, PostgreSQL, and MinIO pieces connect |
| [Contributing](contributing.md)       | Repository workflow and quality checks                       |

## Support status

Second Brain is a personal project released for self-hosters and contributors.
The public build is actively developed, migrations may accompany updates, and
there is no hosted service or commercial support commitment.

The following modules are available today:

- Calendar with local calendars, recurrence, Google sync, and ICS subscriptions
- Rich, nested notes with search, backlinks, databases, sharing, and PDF export
- Workout planning, live logging, goals, body metrics, and progress analytics
- Meal logging, nutrition targets, photo-assisted analysis, and trend charts
- An embedded tool-using assistant with confirmation gates and memory controls
- Multi-account administration, resource sharing, TOTP, and data export

Finance and investments are not part of the current public build.
