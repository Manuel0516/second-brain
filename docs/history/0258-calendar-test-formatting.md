# 0258 — Fix calendar test formatting for API deployment checks

Date: 2026-08-19
Status: accepted

## What changed
Formatted the calendar API test's event connection payload to match Ruff's required line length and formatting.

## Why
The deployment API check failed because Ruff reported `tests/test_calendar.py` would be reformatted.

## Files touched
- `apps/api/tests/test_calendar.py` — applied Ruff's formatting to the fitness connection update payload.
- `docs/history/0258-calendar-test-formatting.md` — recorded the deployment-check fix.
- `docs/history/CHANGELOG.md` — indexed this history entry.

## How the pieces connect
The API test exercises event updates and planned-workout creation. Ruff formats this test before mypy and pytest run in the deployment check, so formatting the payload allows the full API verification pipeline to proceed.

## How to modify this later
Run `npm run check:api` after changing API tests. If Ruff reports a file would be reformatted, run Ruff against that specific file and review the diff before accepting it.
