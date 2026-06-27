# Context map

Load this index first. Open only the row that matches the task, plus the nearest scoped `AGENTS.md`.

| Task | Required specification |
|---|---|
| Repository structure, shared graph, or phase boundaries | `product/ARCHITECTURE.md` |
| Login, sessions, 2FA, network exposure, or secrets | `product/AUTH_AND_SECURITY.md` |
| Theme, layout, responsive behavior, or visual components | `product/DESIGN_SYSTEM.md`; add `design/mockup-v3/` only when visual evidence is needed |
| Calendar or recurrence | `product/CALENDAR_MODULE.md` |
| Notes, blocks, pages, backlinks, or generic linking | `product/NOTES_MODULE.md` |
| Transactions, banking, tax, or imports | `product/FINANCE_MODULE.md` |
| Stocks, crypto, or futures | `product/INVESTMENTS_MODULE.md` |
| Workouts or wearable imports | `product/FITNESS_MODULE.md` |
| Meals, nutrition, water, or recipes | `product/FOOD_MODULE.md` |
| AI capture, tools, provider behavior, or write confirmation | `product/AI_ASSISTANT_MODULE.md` |
| Reminders, account settings, theme preferences, or exports | `product/SETTINGS_MODULE.md` |

Cross-cutting exceptions:

- Generic graph/link changes: architecture plus the Notes linking section.
- Authenticated UI: auth/security plus the one affected module spec.
- Deployment: architecture and auth/security; do not load feature-module specs.

The raw Design Canvas source under `design/design-canvas/` is archival input, not application code.
