#!/bin/sh
# Runs database migrations and starts the application server.
set -e

echo "Running database migrations..."
uv run --no-sync alembic upgrade head

echo "Starting uvicorn..."
exec uv run --no-sync uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers
