# 0240 — Install Playwright Chromium in CI

Date: 2026-08-15
Status: accepted

## What changed

The CI workflow now installs Chromium and its Linux system dependencies after syncing the
backend environment and before running the test suite.

## Why

The Playwright Python package does not include a browser executable. CI therefore failed five
`web_fetch` browser tests with `BrowserType.launch: Executable doesn't exist`, even though the
same tests passed on development machines that already had Chromium cached.

## Files touched

- `.github/workflows/ci.yml` — install the Chromium version matched to the locked Playwright
  package before running checks.
- `docs/history/0240-ci-playwright-browser-install.md` — record the deployment-check fix.
- `docs/history/CHANGELOG.md` — index this history entry.

## How the pieces connect

`uv sync` installs Playwright's Python package. The new command uses that package to download
its matching Chromium executable and required Ubuntu libraries. `npm run check` can then run
the five real-browser tests in `apps/api/tests/test_web_fetch.py`. Production already performs
the equivalent installation in `apps/api/Dockerfile`, so runtime behavior is unchanged.

## How to modify this later

Keep the CI install command after `uv sync` so it always uses the locked Playwright version.
If browser tests change engines, update both this workflow command and the API Dockerfile's
Playwright install command together.
