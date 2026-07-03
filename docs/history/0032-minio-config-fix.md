# 0032 — Fix MinIO wiring: image uploads actually reach storage

Date: 2026-07-03
Status: accepted

## What changed

Image upload (`POST /api/files`) failed with three stacked environment
errors; all fixed at the config/infra level, no route changes:

0. **Migration 012 was never applied to the dev database** — the `files`
   table did not exist, so even with working MinIO every upload 500'd on the
   insert. Ran `alembic upgrade head` (production applies migrations
   automatically via `entrypoint.sh`, so only local dev was affected).

1. `Minio()` rejects URL-style endpoints (`ValueError: path in endpoint is
   not allowed`). `storage._client()` now accepts `http(s)://host:port`
   endpoints, stripping the scheme and deriving `secure` from it.
2. `SignatureDoesNotMatch`: the API read credentials from
   `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`, while Compose provisions the MinIO
   server from `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` — two names for the
   same values, so the client signed with defaults. `config.py` now uses
   pydantic `AliasChoices` so the `MINIO_ROOT_*` names (already required in
   `.env`) work as fallbacks.
3. Compose never passed any MinIO env to the `api` service (prod would have
   used `localhost:9000` + default creds inside the container). Added
   `MINIO_ENDPOINT: minio:9000` and the root credential passthrough, plus a
   `depends_on: minio: service_healthy`.

## Why

User: pasting/importing images into note blocks did nothing; the backend
raised on upload. Verified end-to-end after the fixes: a storage
upload/download/remove round trip, an authenticated `POST /api/files` →
`GET /api/files/{id}` HTTP round trip (201/200, bytes identical), and a new
jsdom regression test in `BlockEditor.test.tsx` that pastes an image file
and asserts the rendered image block uses the uploaded URL.

## Files touched

- `apps/api/app/storage.py` — endpoint normalization in `_client()`
- `apps/api/app/config.py` — `AliasChoices` fallbacks for MinIO credentials
- `compose.yaml` — MinIO env for the api service + healthy dependency

## How the pieces connect

`Settings` (pydantic-settings) loads the repo `.env` locally and container
env in production; `storage._client()` builds the lazily cached Minio client
from it and creates the bucket on first use. The files routes only call
`storage.upload/download/remove`, so fixing the client fixes paste, drop,
and the slash-command file picker in the notes editor at once.

## How to modify this later

- New allowed upload types or size cap: `_ALLOWED_CONTENT_TYPES` /
  `_MAX_FILE_SIZE` in `storage.py`.
- If MinIO credentials are ever split from the root user (dedicated access
  key), set `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` — they take precedence
  over the `MINIO_ROOT_*` fallbacks.
- The client is `lru_cache`d: config changes need an API restart (dev server
  runs `--reload`, so file edits already restart it).
