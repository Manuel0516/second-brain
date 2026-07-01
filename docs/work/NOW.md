# What's happening now

Last updated: 2026-07-01

---

## Active work

**Notes module polish**
- Notes page UI is implemented but needs visual parity with the calendar page.
- Icon picker popover CSS fixes in progress (double-border / glow issues).
- Block editor (Tiptap v3) is working with drag handles and bubble menu.
- Many-to-many event↔note linking is working.

**Project governance restructure**
- AGENTS.md rewritten as universal guide (Claude + Codex + Copilot).
- docs/ folder reorganized: design/, architecture/, work/, history/.
- STYLE_GUIDE.md created from calendar/settings patterns.
- Old decisions/ converted to history/ with richer format.

---

## Up next (rough priority order)

1. **Frontend componentization** — extract `<Card>`, `<Field>`, `<IconButton>`, `<ConfirmDialog>`
   from existing module code into `src/components/`. See `plans/COMPONENT_ARCHITECTURE_PLAN.md`.
2. Notes UI visual parity — match calendar/settings feel exactly.
3. Notes mobile layout — same touch patterns as calendar.
4. Finance module — Phase 3 (see `docs/product/FINANCE_MODULE.md`).
5. Settings → Security page — wire up TOTP 2FA UI.
6. Google Calendar sync — Phase 1 completion.

---

## Known issues

See `FIXES.md` for the bug queue.

---

## Plans

See `plans/` for upcoming feature implementation plans.
