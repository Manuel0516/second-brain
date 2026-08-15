# 0237 — Agent gets a web_fetch tool, off by default, with a real (but capped) browser mode

Date: 2026-08-15
Status: accepted

## What changed

The AI agent previously had no way to reach anything outside this app's own API. Added a new
`web_fetch` tool with two modes:

- **Static** (default): a plain HTTP GET via `httpx` (already a dependency), HTML stripped to
  readable text with Python's stdlib `html.parser` — no new dependency for this path.
- **Dynamic** (`click_text` given): renders the page in a real headless Chromium via
  **Playwright** (new dependency — see "Why" below) and repeatedly clicks the first element
  matching `click_text` (e.g. "Show more"/"Visa fler") up to `max_clicks` times (default 10, max
  20) before reading it, for pages that only reveal more content via JS instead of a URL/query
  param — e.g. a grocery site's offers list. Only used when explicitly requested since it costs
  a real browser launch (~1s+), unlike the static path.

Safety, both modes:
- Only `http(s)` URLs; URLs with embedded credentials are rejected.
- Every hostname (initial URL, each redirect, and — in dynamic mode — every distinct host the
  rendered page's own requests touch, via `page.route()`) is DNS-resolved and checked with
  `ipaddress.IPvXAddress.is_global` before any request is made, so a public hostname that
  resolves to a private/loopback/link-local/reserved address is blocked exactly like a literal
  private IP would be — this is the actual SSRF surface, since the URL is LLM-chosen.
- Static mode also: only `text/html`/`text/plain` content types, a 2MB response cap, and a
  5-redirect cap. Both modes truncate extracted text to 6,000 characters.
- Off by default: a new `AISettings.web_fetch_enabled` boolean (migration `035`), surfaced as a
  toggle in the AI settings panel ("Web access" card). `web_fetch`'s schema is only included in
  `tools.schemas_for()` when the flag is set, and `execute()` re-checks it independently
  (defense in depth against a stale tool list).
- Tool description explicitly tells the model there's no search tool: only fetch a URL the user
  gave directly or one already present in their notes/pages/memory, never a guessed/invented URL.

## Why

User request, in two steps: first, "how could the agent get internet access" with an explicit
constraint of no extra third-party APIs and as few new dependencies as possible — answered with
a plain-HTTP `web_fetch`, zero new dependencies (this alone shipped first). The user then asked
for it to handle a real case: Willys' grocery offers page needs "Visa fler" clicked repeatedly
(~100 offers, paginated via JS) to see everything. A plain HTTP GET fundamentally cannot click
a button or run JavaScript — there is no dependency-free way to do this. Asked directly whether
to (a) leave `web_fetch` static-only, (b) add a headless browser despite the earlier no-new-deps
constraint, or (c) look for a hidden pagination API first; the user chose to add the headless
browser, explicitly accepting the dependency-count trade-off flagged for them.

## Files touched

- `apps/api/app/modules/ai/web.py` — new module. `fetch()` (static, httpx), `fetch_dynamic()`
  (Playwright + click loop), `_check_url`/`_check_host_is_public` (shared SSRF checks),
  `_extract_text` (stdlib `HTMLParser` subclass stripping script/style/noscript/template and
  reading `<title>`), `_guard_request` (Playwright `page.route` handler enforcing the same
  public-host check on every request the rendered page itself makes).
- `apps/api/app/models.py` — `AISettings.web_fetch_enabled: bool` (default `False`).
- `apps/api/alembic/versions/035_ai_web_fetch.py` — adds the column, server default `false`.
- `apps/api/app/modules/ai/tools.py` — `web_fetch` `Tool` entry (`url`, `click_text`,
  `max_clicks`); `schemas_for` excludes it unless the user's `AISettings.web_fetch_enabled` is
  true; `execute()` branch checks the flag again, then dispatches to `web.fetch_dynamic` when
  `click_text` is given, else `web.fetch`.
- `apps/api/app/routes/ai.py` — `web_fetch_enabled` added to `SettingsResponse`/`SettingsPatch`.
- `apps/api/pyproject.toml` / `uv.lock` — added `playwright` (client library only; the browser
  binary is a separate install step, see below).
- `apps/api/Dockerfile` — `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` env var, `RUN uv run
  playwright install --with-deps chromium` (as root, before `USER app`, so `--with-deps`'s
  `apt-get` step can run), `chown` extended to that directory.
- `apps/web/src/modules/settings/AISettings.tsx` — new "Web access" `SettingsCard` with a
  `ToggleRow` bound to `web_fetch_enabled`, its own `onSave`/`saved` feedback (same shared
  `save()` that PATCHes the whole settings object, following the existing single-save-button
  pattern other cards on this page already rely on).
- `docs/architecture/DATABASE.md` — documented the new column.
- `apps/api/tests/test_web_fetch.py` — new file. Pure-function tests for `_check_url`/
  `_extract_text`; a DNS test proving `localhost` is rejected as non-global (no network needed);
  static-fetch tests (success, redirect-and-revalidate, unsupported content-type, truncation,
  too-many-redirects) against a fake `httpx.AsyncClient`, following this repo's existing
  `monkeypatch.setattr(httpx, "AsyncClient", ...)` pattern from `test_food.py`; and three
  **real** headless-Chromium tests against a local `http.server` instance serving a page whose
  "Show more" button reveals one more item per click via JS — proving the click-loop actually
  works end to end, not just that it type-checks (`max_clicks` respected, stops when the button
  disappears, doesn't click at all when `click_text` is omitted).
- `apps/api/tests/test_ai.py` — `test_web_fetch_hidden_and_blocked_until_enabled_in_settings`
  (schema visibility + execute-time gate); `test_web_fetch_uses_the_browser_only_when_click_text_is_given`
  (dispatch to `fetch_dynamic` vs `fetch`, mocked — the real click behavior lives in
  `test_web_fetch.py`); extended the schema-shape test for the new properties.

## How the pieces connect

`tools.schemas_for()` is the per-request, per-user tool list the model sees
(`agent.py`'s `run`) — `web_fetch` is spliced out there when disabled, so a user who hasn't
opted in never has it offered at all, not merely blocked if attempted. `execute()`'s own flag
check is the second, independent gate for the same reason `create_event`/etc. get similar
belt-and-suspenders treatment elsewhere in this file. `fetch()` and `fetch_dynamic()` share
`_check_url`/`_check_host_is_public`/`_extract_text` — the SSRF and text-extraction logic is
identical between the fast and browser paths, only the transport differs.

## How to modify this later

- `fetch_dynamic` launches a fresh Chromium process per call (no pooling/reuse) — acceptable
  for a single personal user; if call volume ever grows, a pooled/persistent browser context
  would be the next step, not before.
- `MAX_CLICKS_CAP` (20) and `MAX_TEXT_CHARS` (6,000) are the tuning knobs if a real page needs
  more; both are simple module constants in `web.py`.
- If a search capability is ever added (the deferred `web_search` from the original design
  discussion — DuckDuckGo's HTML endpoint, no API key), it belongs in this same module,
  reusing `_check_url`/`_check_host_is_public`, and `web_fetch`'s description should be updated
  since it currently tells the model there is no search tool.
- Dockerfile: `playwright install --with-deps chromium` needs network + apt access at build
  time. Verified locally with a real `docker build` — succeeds, final image is ~4.2GB (up from
  a slim FastAPI image of a few hundred MB; Chromium plus its system libraries is the bulk of
  it). For local dev (API runs on the host, not in Docker, per `compose.dev.yaml`), run
  `cd apps/api && uv run playwright install --with-deps chromium` once manually — this wasn't
  automated into a dev setup script since dev already runs `uv sync` directly and this is a
  one-time, explicit step. `uv run playwright install chromium` (no `--with-deps`) also worked
  standalone in this environment without root, but `--with-deps` is what the Dockerfile uses
  since the production base image is a minimal `python:3.13-slim` that's missing Chromium's
  system libraries by default.
- New migrations don't apply themselves to an already-running dev database — after adding `035`,
  the local dev API (uvicorn `--reload`, host-run per `compose.dev.yaml`) picked up the new
  `AISettings.web_fetch_enabled` model column immediately, but the dev Postgres database was
  still on `034`, so every `ai_settings` query broke with a real "column does not exist" error —
  surfacing as the whole AI settings page failing to load *and* failing to save, not just the
  new toggle. Fixed by running `uv run alembic upgrade head` against the dev database. Any
  future schema change needs that same manual step in dev before the page will work again.
