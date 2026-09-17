# 0265 — Development branch updater

Date: 2026-09-17
Status: accepted

## What changed

Created the local `codex/development` branch and added `--development` to the
VPS updater. The default remains `main`, and explicit branch names still work.
Invalid flags and extra arguments are rejected before touching the checkout.

## Why

The user requested a development branch and a convenient way to test its changes
using the existing server update workflow.

## Files touched

- `scripts/update-production.sh` — maps `--development` to `codex/development` and documents usage.
- `docs/public/self-hosting.md` — development update command, return-to-main command, and shared database behavior.
- `docs/history/CHANGELOG.md` — indexes this entry.

## How the pieces connect

The option feeds the existing fetch, branch switch, fast-forward, Compose build,
and readiness workflow. The development branch must be committed and published
to origin before a server can fetch it. No deployment or push was performed.
Both branches use the same volumes; switching back does not reverse migrations.
Verified shell syntax, help output, and main/development/custom branch selection
with stub Git/Docker commands that stop before deployment.

## How to modify this later

Change the `--development` case and help text together if the branch is renamed.
Keep the default main branch, dirty-worktree refusal, and fast-forward-only merge.
Use a separate deployment and database if isolated staging becomes necessary.
