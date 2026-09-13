<p align="center">
  <img src="apps/web/public/logo-neon-planet.png" width="112" alt="Second Brain logo">
</p>

<h1 align="center">Second Brain</h1>

<p align="center">
  A private, self-hosted life OS for your calendar, notes, training, food, and AI.
</p>

<p align="center">
  <a href="https://github.com/Manuel0516/second-brain/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Manuel0516/second-brain/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-43c6d9"></a>
  <img alt="Self-hosted" src="https://img.shields.io/badge/deployment-self--hosted-8f7ee7">
  <img alt="Responsive" src="https://img.shields.io/badge/UI-desktop%20%2B%20mobile-56c596">
</p>

![Second Brain calendar](docs/assets/calendar.gif)

Second Brain brings the information that usually lives in separate apps into
one calm, connected workspace. Calendar events can become notes, workouts, or
meals; pages can reference each other; and the optional assistant works through
the same guarded API as the interface. Your database, files, and model keys stay
on infrastructure you control.

## What is included

| Area          | Available today                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------- |
| **Calendar**  | Day, adaptive week, and month views; recurrence; reminders; Google sync; ICS subscriptions; sharing |
| **Notes**     | Nested rich-text pages, search, backlinks, databases, CRDT collaboration, sharing, PDF export       |
| **Fitness**   | Workout planning and live logging, exercise library, goals, body metrics, records, and trends       |
| **Food**      | Meals, macros, hydration, produce, targets, history, trends, and optional photo analysis            |
| **Assistant** | Tool-based chat, confirmations, undo, memories, capability controls, and optional Telegram access   |
| **Platform**  | Multiple local accounts, roles, TOTP, themes, granular settings, JSON export, responsive UI         |

The current public build does **not** include finance or investment tracking.
See the [complete feature guide](docs/public/features.md) for exact behavior and
limitations.

## Connected by design

![Open a workout directly from its calendar event](docs/assets/connections.gif)

A calendar entry can draft a planned workout and retain a typed link to it.
Open the relationship from the event to land on the exact workout record—without
copying context between modules. The same pattern connects events with notes and
planned meals.

## A workspace that travels

| Notes and knowledge                                     | Fitness and progress                                      |
| ------------------------------------------------------- | --------------------------------------------------------- |
| ![Nested notes and rich content](docs/assets/notes.gif) | ![Workout history and analytics](docs/assets/fitness.gif) |

| Food and nutrition                                          | Mobile layout                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| ![Nutrition targets and meal history](docs/assets/food.gif) | ![Second Brain in a mobile viewport](docs/assets/mobile.gif) |

The responsive web interface keeps the same data and workflows on desktop and
phone-sized screens—there is no separate mobile client to maintain.

## Quick start

You need Node.js 24+, npm 11+, Python 3.13+, `uv`, Docker, and Docker
Compose v2.

```bash
git clone https://github.com/Manuel0516/second-brain.git
cd second-brain
cp .env.example .env
npm ci
uv sync --project apps/api --dev
./scripts/dev-start.sh
```

Open `http://localhost:5173`. The development setup creates the initial account
from `INITIAL_USER_EMAIL`, `INITIAL_USER_USERNAME`, and `INITIAL_USER_PASSWORD`
in `.env`.

To load a deterministic showcase account with realistic linked calendar, note,
fitness, and food data:

```bash
uv run --directory apps/api python ../../scripts/seed_demo.py
```

The local-only demo login is `demo@example.com` / `second-brain-demo`. Change or
remove it before exposing an instance beyond your development machine.

## How it is built

- React, TypeScript, Vite, and TanStack Query on the client
- FastAPI, SQLAlchemy, Alembic, and PostgreSQL on the server
- MinIO-compatible object storage for uploaded media
- Optional OpenRouter-compatible models and Telegram bot
- Docker Compose and Traefik for self-hosting

Start with the [architecture overview](docs/public/architecture.md) for the
request, data, storage, and real-time collaboration paths.

## Documentation

- [Getting started](docs/public/getting-started.md)
- [Feature guide](docs/public/features.md)
- [Configuration](docs/public/configuration.md)
- [Self-hosting](docs/public/self-hosting.md)
- [Architecture](docs/public/architecture.md)
- [Contributing](docs/public/contributing.md)

Only `docs/public/` is intended as end-user documentation. The remaining docs
record internal product, design, and engineering decisions for contributors.

## Security and privacy

Second Brain is designed to be self-hosted, not exposed with example secrets.
Before production use, replace every placeholder in `.env`, use HTTPS, restrict
database and object-storage ports to the private network, enable backups, and
consider TOTP for privileged accounts. Optional AI features send the content
needed for a request to the provider you configure.

Read the [configuration](docs/public/configuration.md) and
[self-hosting](docs/public/self-hosting.md) guides before opening an instance to
the internet.

## Contributing

Issues and focused pull requests are welcome. Run `npm run check` before opening
a PR and keep documentation aligned with behavior. See
[the contributor guide](docs/public/contributing.md).

## License

[MIT](LICENSE)
