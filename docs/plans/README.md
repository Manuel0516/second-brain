# Plans

Upcoming and in-progress work. Each plan is self-contained: root cause or
motivation, implementation approach, and a verification checklist. Completed
plans are retired and logged as ADRs in `docs/decisions/`.

Run `npm run check` (web) and `npm run check:api` (api) before marking any
task done. Reuse existing design tokens and components in
`apps/web/src/styles.css` — no new visual language.

| Plan | Scope | Status |
|---|---|---|
| [NOTES_MODULE_PLAN.md](NOTES_MODULE_PLAN.md) | Phase 2 Notes/Pages, calendar-first: Tiptap block editor (tables + LaTeX + `[[` mentions), standalone nested page tree, event→note linking with a calendar/editor **split view** (full-screen on mobile), and backlink panels over the existing `Link` graph. Databases/spreadsheets/uploads deferred. | ready to implement |
