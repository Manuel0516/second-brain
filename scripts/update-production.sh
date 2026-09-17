#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'USAGE'
Usage: ./scripts/update-production.sh [--development | branch]

  --development   Test origin/codex/development on this server
  branch          Update from a named branch (default: main)

Examples:
  ./scripts/update-production.sh --development
  ./scripts/update-production.sh main

Development uses this checkout’s existing database and volumes.

Fast-forward a VPS checkout (default: main), rebuild the application images,
restart the application containers, and verify internal readiness.

The script never removes volumes and refuses to update a dirty worktree.
USAGE
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if (( $# > 1 )); then
  usage >&2
  exit 2
fi

case "${1:-main}" in
  --development) branch="codex/development" ;;
  -*) usage >&2; exit 2 ;;
  *) branch="${1:-main}" ;;
esac
git check-ref-format --branch "$branch" >/dev/null

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if [[ ! -d .git ]]; then
  echo "Not a Git checkout: $repo_root" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "Missing $repo_root/.env; configure production before updating." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to update a dirty worktree:" >&2
  git status --short >&2
  exit 1
fi

docker compose version >/dev/null

previous_revision="$(git rev-parse HEAD)"
echo "Fetching origin/$branch..."
git fetch --quiet origin "$branch"

if git show-ref --verify --quiet "refs/heads/$branch"; then
  git switch --quiet "$branch"
else
  git switch --quiet --track --create "$branch" "origin/$branch"
fi
git merge --ff-only "origin/$branch"
current_revision="$(git rev-parse HEAD)"

compose_args=()
app_services=(api web)
if grep -Eq '^[[:space:]]*TELEGRAM_BOT_TOKEN=[^[:space:]#]+[[:space:]]*$' .env; then
  compose_args=(--profile bot)
  app_services+=(bot)
  echo "Telegram bot is configured and will be updated."
else
  echo "Telegram bot is not configured and will remain disabled."
fi

wait_for_service() {
  local service="$1"
  local timeout_seconds="$2"
  local elapsed=0
  local container_id
  local state

  while ((elapsed < timeout_seconds)); do
    container_id="$(docker compose "${compose_args[@]}" ps -q "$service")"
    if [[ -n "$container_id" ]]; then
      state="$(
        docker inspect \
          --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
          "$container_id" 2>/dev/null || true
      )"
      if [[ "$state" == "healthy" || "$state" == "running" ]]; then
        return 0
      fi
      if [[ "$state" == "exited" || "$state" == "dead" ]]; then
        break
      fi
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done

  echo "$service did not become healthy within ${timeout_seconds}s." >&2
  docker compose "${compose_args[@]}" logs --tail=100 "$service" >&2 || true
  return 1
}

echo "Validating Compose configuration..."
docker compose "${compose_args[@]}" config --quiet

echo "Ensuring PostgreSQL and MinIO are healthy..."
docker compose up -d db minio
wait_for_service db 90
wait_for_service minio 90

echo "Building: ${app_services[*]}"
docker compose "${compose_args[@]}" build "${app_services[@]}"

echo "Restarting API..."
docker compose "${compose_args[@]}" up -d --no-deps --force-recreate api
wait_for_service api 180

echo "Restarting web..."
docker compose "${compose_args[@]}" up -d --no-deps --force-recreate web

if [[ " ${app_services[*]} " == *" bot "* ]]; then
  echo "Restarting Telegram bot..."
  docker compose "${compose_args[@]}" up -d --no-deps --force-recreate bot
else
  docker compose --profile bot stop bot >/dev/null 2>&1 || true
  docker compose --profile bot rm -f bot >/dev/null 2>&1 || true
fi

echo "Checking the internal readiness endpoint..."
readiness_ok=false
for _attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if docker compose exec -T web \
    wget -q -O - http://127.0.0.1/api/ready >/dev/null 2>&1; then
    readiness_ok=true
    break
  fi
  sleep 5
done

if [[ "$readiness_ok" != true ]]; then
  echo "Internal readiness check failed after 60 seconds." >&2
  docker compose "${compose_args[@]}" logs --tail=100 api web >&2
  exit 1
fi

docker compose "${compose_args[@]}" ps
echo "Updated Second Brain: ${previous_revision:0:12} -> ${current_revision:0:12}"
