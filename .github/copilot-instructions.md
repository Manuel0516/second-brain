# GitHub Copilot Instructions — Second Brain

The complete development rules for this project are in `AGENTS.md` at the repository root.

**Before starting any task:** read the file `AGENTS.md` in the root of this repository and
follow all rules there exactly. That file is the single source of truth for all AI tools
working on this project. Do not skip any section.

Key rules from that file (summary — the full detail is in `AGENTS.md`):

- Read `docs/CONTEXT.md` first, then only the spec for your task.
- For any UI work, read `docs/design/STYLE_GUIDE.md` — mandatory, no exceptions.
- Apply Ponytail full: shortest working solution, no speculative code.
- After every meaningful code change, add a history entry to `docs/history/`.
- Run `npm run check` before declaring any task complete.
- Never deploy, push, or mutate the VPS unless explicitly asked.
