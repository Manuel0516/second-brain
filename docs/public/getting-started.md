# Getting started

Second Brain runs the database and object storage in Docker while the React and
FastAPI development servers run on the host for fast reloads.

## Requirements

- Node.js 24 or newer
- npm 11 or newer
- Python 3.13 or newer
- [uv](https://docs.astral.sh/uv/)
- Docker Engine with Docker Compose v2

## Install

```bash
git clone https://github.com/Manuel0516/second-brain.git
cd second-brain
cp .env.example .env
```

Replace every placeholder secret in `.env`. At minimum, set strong values for
`POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`, `JWT_SECRET_KEY`, and the
`INITIAL_USER_*` fields. Generate a JWT secret with:

```bash
openssl rand -hex 32
```

Install the application dependencies:

```bash
uv sync --project apps/api --dev
npm ci
```

Start the complete development stack:

```bash
./scripts/dev-start.sh
```

Open [http://localhost:5173](http://localhost:5173) and sign in with the
`INITIAL_USER_EMAIL` and `INITIAL_USER_PASSWORD` values from `.env`.

Stop everything with:

```bash
./scripts/dev-stop.sh
```

## Load showcase data

The optional seeder creates a separate test account containing calendars,
events, nested notes, workout history, body metrics, goals, and two weeks of
nutrition data. It refuses to run when `APP_ENVIRONMENT=prod`.

```bash
uv run --directory apps/api python ../../scripts/seed_demo.py
```

The first run prints the demo credentials. Running it again is safe: it
preserves the existing showcase account and adds any missing showcase
connections without duplicating records.

## Run the checks

```bash
npm run check
```

This formats-checks, lints, type-checks, tests, and builds the frontend, then
runs the equivalent backend checks and test suite.

## Common startup problems

### Docker cannot connect

Start Docker Desktop, Colima, or your system Docker daemon, then verify:

```bash
docker version
docker compose version
```

### Port already in use

Development expects PostgreSQL on `127.0.0.1:5433`, MinIO on
`127.0.0.1:9100`, FastAPI on `127.0.0.1:8000`, and Vite on
`127.0.0.1:5173`. Stop the conflicting process or adjust the development
Compose and proxy configuration together.

### The API cannot reach PostgreSQL

Confirm `DATABASE_URL` in `.env` points to the development port:

```dotenv
DATABASE_URL=postgresql+psycopg://secondbrain:YOUR_PASSWORD@localhost:5433/secondbrain
```
