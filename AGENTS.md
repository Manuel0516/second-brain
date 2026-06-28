# Second Brain working agreements

## Context protocol

1. Read `docs/CONTEXT.md`, then open only the specification mapped to the task.
2. Before changing a subtree, read its nearest `AGENTS.md`.
3. Before editing, name the exact files needed and why. Start with filenames, imports, and `rg`; inspect only files on the execution path.
4. Read files in targeted ranges. Do not scan the repository or bulk-read specifications or source files.
5. Do not read generated files, dependency folders, lockfiles, build output, logs, datasets, or local secrets unless the task explicitly requires one.
6. Read the Design Canvas export only for explicit frontend or visual-design work.
7. For cross-cutting work, add only the directly affected adjacent specification.
8. If more than eight files are needed, summarize current findings and justify the expanded context before reading more.

## Context management

Use context-mode whenever command output, search results, logs, test output, or file content may be large. This keeps the main conversation context lean and focused on actual work.

**Key rules:**
- Do not paste large raw outputs into the main context unless explicitly necessary.
- Before reading many files, first identify the smallest relevant file set using:
  - `rg` / `rg --files` for targeted searches
  - `tree` for directory structure
  - `find` with filters for specific patterns
  - Existing project documentation
  - Agents specialized in exploration (Explore, general-purpose)
- Prefer summaries, targeted snippets, and search queries over full-file reads.

**When to use context-mode:**
- Processing logs, test output, or build output
- Analyzing large JSON responses or API data
- Summarizing git history or recent commits
- Extracting errors or patterns from verbose output
- Reviewing dependency trees or codebase statistics
- Checking accessibility trees or DOM structure

Available context-mode skills: `/ctx-search`, `/ctx-stats`, `/ctx-insight`, `/ctx-index`, `/ctx-doctor`, `/ctx-purge`, `/ctx-upgrade`

## Implementation rules

- Apply Ponytail `full`: first ask whether code is needed, then reuse existing code, standard library, native platform features, or installed dependencies before writing custom code.
- Optimize for readable simplicity, not clever one-liners or minimum line count.
- Implement only accepted behavior. Do not add speculative abstractions, compatibility layers, extension points, or dependencies.
- Extract shared code only after a second real consumer exists.
- Never trade away validation, security, accessibility, error handling, or data-loss protection.
- Keep domain logic inside its module. Cross-module access goes through explicit public interfaces.
- New production dependencies require a short rationale and user approval.
- Do not suppress lint or type errors without documenting the concrete reason.

## Workflow

- Keep one writer per subtree. Delegate only when the user explicitly requests specialists or parallel work.
- Specialists return concise evidence and do not expand into adjacent subsystems.
- Update `docs/ROADMAP.md` only after verification. Create an ADR only for a durable, hard-to-reverse decision.
- Run `npm run check` before declaring implementation complete.
- Finish with a concise summary of changed files, verification run, and any remaining work.
- Do not deploy, push, publish images, or mutate the VPS unless explicitly requested.
