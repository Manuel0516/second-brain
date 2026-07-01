# Bug queue

Add bugs here as they're found. Remove (or move to history/) once fixed.

Format: `- [ ] Short description — context/file — priority (high/medium/low)`

---

## Active bugs

- [ ] Notes page visual inconsistency — colors, glow, and rounded corners don't match calendar page — medium
- [ ] Settings → Security page stub is not yet wired to TOTP backend — low
- [ ] MinIO file attachment not yet wired to frontend — low

---

## Recently fixed (last 30 days)

- [x] Icon picker double-border in notes popover — fixed 2026-07-01 (notes.css scoped :focus rule)
- [x] `editor-icon-custom` focus glow missing — fixed 2026-07-01 (styles.css, restored accent border)
- [x] Recurring event siblings disappearing when editor opens — fixed 2026-06-30 (occurrenceKey filter)
- [x] Calendar sidebar drag-to-reorder not live — fixed 2026-06-30 (live splice in Sidebar.tsx)
- [x] Default calendar setting not applied to new events — fixed 2026-06-30 (Calendar.tsx createAt)
- [x] Event create/move/resize not snapping to 5-minute grid — fixed 2026-06-30 (time.ts + TimeGrid.tsx)
