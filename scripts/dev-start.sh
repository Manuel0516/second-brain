#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime="$root/.dev"
mkdir -p "$runtime"
cd "$root"

start_process() {
  local name="$1"
  shift
  local pid_file="$runtime/$name.pid"
  if [[ -f "$pid_file" ]] && kill -0 "$(<"$pid_file")" 2>/dev/null; then
    echo "$name is already running"
    return
  fi
  nohup setsid "$@" </dev/null >"$runtime/$name.log" 2>&1 &
  echo "$!" >"$pid_file"
  sleep 1
  kill -0 "$!" 2>/dev/null || {
    echo "Failed to start $name; see .dev/$name.log" >&2
    return 1
  }
  echo "Started $name (log: .dev/$name.log)"
}

docker compose -f compose.dev.yaml up -d db minio
uv run --directory apps/api alembic upgrade head
start_process api npm run dev:api
start_process web npm run dev:web

if grep -Eq '^TELEGRAM_BOT_TOKEN=.+$' .env 2>/dev/null; then
  docker compose -f compose.dev.yaml --profile bot up -d --build bot
else
  echo "Skipped Telegram bot: TELEGRAM_BOT_TOKEN is not set in .env"
fi

echo "Second Brain development services are running at http://localhost:5173"
