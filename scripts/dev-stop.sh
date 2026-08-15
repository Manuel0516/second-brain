#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime="$root/.dev"
cd "$root"

for name in web api; do
  pid_file="$runtime/$name.pid"
  [[ -f "$pid_file" ]] || continue
  pid="$(<"$pid_file")"
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM -- "-$pid"
    echo "Stopped $name"
  fi
  rm -f "$pid_file"
done

docker compose -f compose.dev.yaml --profile bot down
echo "Second Brain development services are stopped"
