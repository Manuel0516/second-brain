#!/bin/sh
# Runs database migrations and starts the application server.
set -e

if [ "${APP_ENVIRONMENT:-dev}" = "prod" ]; then
  echo "Refreshing Finance malware signatures..."
  if ! timeout "${FINANCE_CLAMAV_UPDATE_TIMEOUT_SECONDS:-60}" \
    freshclam --quiet --datadir=/var/lib/clamav >/dev/null 2>&1; then
    echo "Finance malware signatures could not be refreshed; refusing production startup." >&2
    exit 1
  fi
fi

echo "Running database migrations..."
uv run --no-sync alembic upgrade head

echo "Starting uvicorn..."
exec uv run --no-sync uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers
