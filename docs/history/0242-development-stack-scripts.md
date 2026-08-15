# 0242 — Development stack start and stop scripts

Date: 2026-08-15
Status: accepted

## What changed

Added one command to start the complete local development stack and one command to stop it.
Runtime PID files and logs live in the ignored `.dev/` directory.

## Why

Local development previously required separate commands and terminals for Docker services,
database migrations, FastAPI, Vite, and the optional Telegram bot.

## Files touched

- `scripts/dev-start.sh` — starts PostgreSQL and MinIO, applies migrations, backgrounds the API
  and web servers, and starts the bot when its token is configured.
- `scripts/dev-stop.sh` — stops the saved API/web process groups and the dev Compose project.
- `.gitignore` — excludes generated development PID files and logs.
- `README.md` — documents the two commands.
- `docs/history/0242-development-stack-scripts.md` — records the change.
- `docs/history/CHANGELOG.md` — indexes this entry.

## How the pieces connect

The scripts preserve the existing architecture: host-run Vite and Uvicorn provide hot reload,
while `compose.dev.yaml` owns PostgreSQL, MinIO, and the bot. `nohup` keeps them alive after the
launcher exits, and `setsid` gives each host server a process group so the stop script also
terminates its npm and reload-worker children.

## How to modify this later

Add host development processes through `start_process` in `dev-start.sh` and add the matching
name to the stop loop. Keep production `compose.yaml` out of both scripts.
