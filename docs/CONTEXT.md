# Context map

Load this index first. Open only the row that matches the task.

## Always read first
- `AGENTS.md` (repo root) — universal rules for every AI on this project
- For any UI work: `docs/design/STYLE_GUIDE.md` — mandatory, no exceptions

## Task → spec mapping

| Task | Read this |
|---|---|
| Full project scope or phase plan | `docs/product/ARCHITECTURE.md` |
| Login, sessions, 2FA, network, or secrets | `docs/product/AUTH_AND_SECURITY.md` |
| Any UI, layout, visual, or styling work | `docs/design/STYLE_GUIDE.md` |
| Calendar or recurrence | `docs/product/CALENDAR_MODULE.md` |
| Notes, blocks, pages, backlinks, or generic linking | `docs/product/NOTES_MODULE.md` |
| Transactions, banking, tax, or imports | `docs/product/FINANCE_MODULE.md` |
| Stocks, crypto, or futures | `docs/product/INVESTMENTS_MODULE.md` |
| Workouts or wearable imports | `docs/product/FITNESS_MODULE.md` |
| Meals, nutrition, water, or recipes | `docs/product/FOOD_MODULE.md` |
| AI capture, tools, or provider behavior | `docs/product/AI_ASSISTANT_MODULE.md` |
| Settings, preferences, or exports | `docs/product/SETTINGS_MODULE.md` |
| File uploads, images, MinIO storage | `docs/architecture/BACKEND.md` + `DATABASE.md` (`files` table) |
| Backend / API architecture | `docs/architecture/BACKEND.md` |
| Database tables or migrations | `docs/architecture/DATABASE.md` |
| Frontend structure or routing | `docs/architecture/FRONTEND.md` |
| What is currently being built | `docs/work/NOW.md` |
| Known bugs | `docs/work/FIXES.md` |
| How a past feature was implemented | `docs/history/CHANGELOG.md` → find the entry |

## Cross-cutting rules

- Generic graph/link changes: `DATABASE.md` + the affected module spec.
- Authenticated UI: `AUTH_AND_SECURITY.md` + the module spec.
- Deployment: `BACKEND.md` + `AUTH_AND_SECURITY.md` — do not load feature specs.
- The raw Design Canvas at `design/design-canvas/` is archival — read it only for
  explicit visual design work, not for code tasks.
