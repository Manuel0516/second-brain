# 0054 — OpenCode Pro agent team

Date: 2026-07-04
Status: accepted

## What changed
Added the lean `.opencode-pro` agent setup:
- `brain` now routes to the actual agent names in `.opencode-pro/agents/`.
- `designer`, `db-architect`, `test-runner`, and `ui-polisher` were added.
- `explorer` and `reviewer` were switched to the models from the proposed Pro mapping.

## Why
The existing `.opencode-pro/` setup only covered part of the requested Pro team. This change makes the folder match the lean workflow described by the user: one planner, one UI planner, one discovery agent, one database planner, one check runner, one polish agent, plus the existing cheap/serious/docs/summarizer/commit-message roles.

## Files touched
- `.opencode-pro/agents/brain.md` — updated delegation rules to point at the actual agent names in `.opencode-pro/agents/`.
- `.opencode-pro/agents/designer.md` — new UI planning agent on GLM 5.2.
- `.opencode-pro/agents/db-architect.md` — new database/schema planning agent on GLM 5.2.
- `.opencode-pro/agents/test-runner.md` — new check-running agent for `npm run check` and the split web/api checks.
- `.opencode-pro/agents/ui-polisher.md` — new final UI polish agent on Qwen3 Coder Next.
- `.opencode-pro/agents/explorer.md` — switched to `opencode/north-mini-code-free`.
- `.opencode-pro/agents/reviewer.md` — switched to `openrouter/qwen/qwen3-coder-next`.
- `docs/history/CHANGELOG.md` — added the new history index row.

## How the pieces connect
`opencode.jsonc` already points at `brain` as the default agent and already uses GLM 5.2 plus DeepSeek flash for the top-level setup. The agent markdown files under `.opencode-pro/agents/` define the behavior OpenCode reads when you invoke `@agent-name`. `brain.md` now matches the actual files in the folder, so delegation names and available agents stay aligned.

## How to modify this later
If the team changes again, edit the matching `.opencode-pro/agents/*.md` file first, then update `brain.md` so its delegation list stays in sync. If you add another agent, keep the role narrow and pick the cheapest model that can do the job.
