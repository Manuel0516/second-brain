# Second Brain — Universal Agent Guide

> This file is the single source of truth for every AI working on this project.
> Claude Code, Codex, and GitHub Copilot all follow these rules without exception.
> No tool gets special rules. No tool skips any section.

---

## 0. Project overview

Second Brain is a self-hosted personal life-OS: Calendar + Notes/Pages + Finances + Fitness +
Food + AI assistant, all cross-linked through a generic graph. It runs as a React/TypeScript
frontend (Vite) and a FastAPI/PostgreSQL backend, deployed on a personal VPS via Docker Compose
and Traefik. One user, full offline-capable feel, real-time polish.

The full product scope lives in `docs/product/`. The architecture quick-read is in
`docs/architecture/`. Read those before any significant task.

---

## 1. Before you touch any code

Run through this checklist in order. Do not skip steps.

1. Read `docs/CONTEXT.md` — it tells you which spec to open for your task.
2. Open only the one spec that maps to the task (e.g. `docs/product/CALENDAR_MODULE.md`).
3. For any UI work: read `docs/design/STYLE_GUIDE.md` — mandatory, no exceptions.
4. For any backend/API work: read `docs/architecture/BACKEND.md` and `DATABASE.md`.
5. Identify the exact files you need. Name them before reading. Use `rg` or `find` first.
6. Read files in targeted ranges — not full files unless the whole file is small.
7. Never read: generated files, `node_modules/`, `dist/`, lockfiles, build output, logs,
   `.env` files, or dataset dumps unless the task explicitly requires one.

---

## 2. Ponytail — mandatory on every task

Ponytail is active at level `full` for every agent, always. It is not optional.

**The ladder — stop at the first rung that works:**

1. Does this need to exist at all? (YAGNI — speculative need = skip it)
2. Already in this codebase? Find and reuse it.
3. Standard library does it? Use it.
4. Native platform feature covers it? (CSS over JS, DB constraint over app code)
5. Already-installed dependency solves it? Use it. Never add new dependencies without a
   rationale and explicit user approval.
6. Can it be one line?
7. Only then: the minimum code that works.

**Rules:**
- No unrequested abstractions, no boilerplate for later, no compatibility shims.
- Deletion over addition. Boring over clever.
- Bug fix = root cause, not symptom. Grep every caller before touching shared code.
- Mark deliberate simplifications with `// ponytail: <reason>` comment.

---

## 3. Context management

Large outputs (logs, test results, search results, full-file reads) must NOT be pasted raw
into the conversation context. Use the context-mode tools instead:

- `/ctx-search` — search indexed prior output
- `/ctx-stats` — token usage
- `/ctx-insight` — summarise indexed content
- `/ctx-index` — index a file or output manually
- `/ctx-doctor` — diagnose context health
- `/ctx-purge` — clear stale context
- `/ctx-upgrade` — update context-mode plugin

**When to use context-mode:** command output, logs, build output, large JSON, git history,
accessibility trees, dependency trees, or any file over ~200 lines you only need to query.

**Preferred discovery order:**
1. `rg` or `rg --files` for targeted searches
2. `tree` for structure
3. `find` with filters
4. Existing documentation
5. Only then: read source files in targeted ranges

---

## 4. UI law — non-negotiable

`docs/design/STYLE_GUIDE.md` defines the visual language of this project.

**Rules:**
- Every UI change must match the style guide exactly. No new colors, no new spacing scales,
  no new animation patterns, no new border-radius values outside the token set.
- Use only the CSS custom properties defined in `apps/web/src/styles.css`. Never hardcode
  color, radius, shadow, or font values — always use `var(--token-name)`.
- The calendar page and settings page are the visual gold standard. When in doubt, make the
  new thing look like those two pages.
- New UI patterns require reading the design canvas at
  `docs/design/design-canvas/Second Brain.dc.html` and getting explicit approval.
- `npm run check` must pass before any UI work is declared complete.

---

## 5. Mandatory change log

**Every meaningful code change produces a history entry. No exceptions.**

After completing any task that changes production code, add or update an entry in
`docs/history/`. The format is:

```markdown
# HHH — Short title

Date: YYYY-MM-DD
Status: accepted

## What changed
<plain description of what was added, removed, or modified>

## Why
<the motivation — user request, bug, design decision>

## Files touched
- `path/to/file.tsx` — what this file does and what specifically changed
- `path/to/file.py` — same

## How the pieces connect
<explain how the changed code fits into the larger system — what calls what,
what depends on what, why the pieces are structured this way>

## How to modify this later
<concrete instructions for a future agent who needs to change this behaviour —
what to find, what to change, what to watch out for>
```

Update `docs/history/CHANGELOG.md` index after adding any entry.

---

## 6. Workflow — every task, every time

```
Read context → Read spec → Read style guide (UI tasks) → Identify files →
Implement (Ponytail) → Verify (npm run check) → Log change (docs/history/) →
Report: files changed, verification result, anything left to do
```

**Hard rules:**
- Do not deploy, push to git, publish images, or mutate the VPS unless explicitly asked.
- Do not create commits unless explicitly asked.
- Do not add dependencies without rationale + user approval.
- Do not open files you do not need. Name them first, justify them, then open.
- Do not skip `npm run check`. If it fails, fix it before reporting done.
- Do not leave half-implemented features. Either finish or explicitly hand off with a written
  description of what remains.

---

## 7. Documentation structure

```
docs/
  CONTEXT.md          — context map: task → which spec to read
  ROADMAP.md          — phased build plan with status

  product/            — what the product IS (full scope, module specs)
  design/             — how it must LOOK (style guide + design canvas)
  architecture/       — how it is BUILT (quick-read system overview)
  work/               — what is happening NOW (active plans, bug queue)
  history/            — what was DONE and exactly how (permanent log)
```

---

## 8. Asking questions

If a task is ambiguous, ask one focused question before starting. Do not ask multiple
questions at once. Do not ask about things you can determine by reading the code.

If a task requires more than eight files, summarize findings and justify the expanded scope
before reading more.

---

## 9. What good looks like

A completed task produces:
1. Working code that passes `npm run check`
2. A history entry in `docs/history/` with all five sections filled in
3. A one-paragraph summary to the user: what changed, what was verified, what (if anything)
   is left

Nothing else is needed. No lengthy explanations, no design documents, no extra files.
