# 0157 — Fix iPhone photo uploads rejected by nginx

Date: 2026-07-22
Status: accepted

## What changed

Raised the application's per-file upload limit to 50 MiB and nginx's API request-body limit to
51 MiB. The extra proxy allowance covers multipart form metadata around the uploaded file.

## Why

Normal iPhone photos between roughly 2.4 and 4 MiB were rejected by nginx with HTTP 413 before
they reached the files API. nginx's default body limit was lower than the intended 50 MiB upload
limit, so the browser surfaced only the generic "Failed to upload file" message.

## Files touched

- `infra/nginx/default.conf` — allows API request bodies up to 51 MiB before proxying them to the
  FastAPI service.
- `apps/api/app/storage.py` — raises the authoritative per-file size limit to 50 MiB.
- `apps/api/app/routes/files.py` — reports the 50 MB limit in upload validation errors.
- `docs/architecture/DATABASE.md` — documents the updated file limit.
- `docs/history/0157-iphone-photo-upload-nginx-limit.md` — records the diagnosis and proxy fix.
- `docs/history/CHANGELOG.md` — indexes this history entry.

## How the pieces connect

The web client submits photos as multipart requests to `/api/files`. nginx accepts and proxies
those requests to FastAPI, where the shared files route validates the content type and enforces
the authoritative 50 MiB file-size cap before storing bytes in MinIO. The proxy limit is slightly
higher only so multipart overhead does not reject an otherwise valid 50 MiB file.

## How to modify this later

Keep `client_max_body_size` slightly above the limit returned by `max_file_size()` in
`apps/api/app/storage.py`. If the application limit changes, update both values and verify that
nginx still accepts the multipart envelope while FastAPI rejects files above the product limit.
