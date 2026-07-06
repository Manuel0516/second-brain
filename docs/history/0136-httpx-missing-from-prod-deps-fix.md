# 0136 — Production deploy crash-looped: `httpx` missing from runtime deps

Date: 2026-07-06
Status: accepted

## What changed

Moved `httpx>=0.28.1` from the `dev` dependency group to the main `dependencies` list in
`apps/api/pyproject.toml`, and regenerated `apps/api/uv.lock`.

## Why

The Contabo VPS deploy failed: the `api` container crash-looped on every start with
`ModuleNotFoundError: No module named 'httpx'`. `apps/api/app/routes/food.py` imports `httpx`
(used for the OpenRouter meal-photo API call), but `httpx` was only ever declared under
`[dependency-groups].dev`, not the main `dependencies` list. `apps/api/Dockerfile` builds the
production image with `uv sync --locked --no-dev` (line 16), which deliberately excludes the dev
group — so `httpx` was available locally (dev installs include it) and in CI tests, but never
shipped in the actual production image. Any deploy after the Food module's `food.py` was added
would fail this way.

## Files touched

- `apps/api/pyproject.toml` — `httpx` moved from `dev` group to `dependencies`.
- `apps/api/uv.lock` — regenerated via `uv lock` to match.

## How the pieces connect

The Dockerfile's `--no-dev` flag is the single point where "dev-only" vs "runtime" dependencies
actually diverge — everything in `dependencies` ships to prod, everything in `dev` doesn't. Local
dev and CI both run `uv sync` (no `--no-dev`), which installs both groups, so this class of bug is
invisible until an actual deploy runs the `--no-dev` build.

## How to modify this later

- If a future route needs a new third-party package, check whether it's a genuine runtime import
  (used by `app/`) vs. a test-only tool, and put it in the matching group — `dependencies` for
  anything imported under `app/`, `dev` for anything only imported under `tests/` or used by
  `mypy`/`ruff`/`pytest` themselves. Getting this wrong is exactly what caused this incident, and
  it won't be caught by `npm run check:api` since that installs both groups.
