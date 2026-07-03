# Bug queue

Add bugs here as they're found. Remove (or move to history/) once fixed.

Format: `- [ ] Short description — context/file — priority (high/medium/low)`

---

## Active bugs

- [ ] Settings → Security page stub is not yet wired to TOTP backend — low
- [ ] MinIO file attachment not yet wired to frontend — low
- [ ] Notes heading toggle stops working after repeated use — the chevron
  button (ProseMirror widget in `CollapsibleHeading.ts`) works for the first
  few collapse/expand cycles but eventually becomes unresponsive. Likely a
  decoration-key or widget-recreation issue in the `headingCollapsePlugin`:
  each toggle dispatches `setNodeAttribute` which triggers a decoration
  recompute, and the widget factory creates a fresh button DOM node each
  time. The old button's event listeners may not be cleaned up, or the
  DecorationSet diff may leave a stale widget in the DOM that no longer
  receives events. The `appendTransaction` auto-expand logic may also race
  with rapid clicks. File: `CollapsibleHeading.ts` — medium

---

## Recently fixed (last 30 days)

- [x] Heading collapse chevron jumped down on hover — the global button:hover translate replaced the chevron's centering transform. Fixed 2026-07-03: centered via `top: calc(0.875em - 11px)` (first-line aligned, no transform) + scoped hover override; verified pixel-stable headlessly.
- [x] Notes route blank/crash — stale Vite optimize-deps cache after installing the new TipTap deps (504 "Outdated Optimize Dep" on @tiptap/extension-highlight broke the lazy Notes chunk). Fixed 2026-07-03: cleared `apps/web/node_modules/.vite`; restart the dev server after dependency installs.
- [x] Collapsed headings silently un-collapsed on page load — the auto-expand plugin fired on TipTap's programmatic content sync (selection lands at doc end) and the autosave persisted the expansion. Fixed 2026-07-03: appendTransaction now ignores transactions carrying `preventUpdate` meta (CollapsibleHeading.ts).

- [x] Notes page visual inconsistency with calendar — fixed 2026-07-02 (notes rebuilt on shared calendar classes, history 0010)
- [x] Icon picker double-border in notes popover — fixed 2026-07-01 (notes.css scoped :focus rule)
- [x] `editor-icon-custom` focus glow missing — fixed 2026-07-01 (styles.css, restored accent border)
- [x] Recurring event siblings disappearing when editor opens — fixed 2026-06-30 (occurrenceKey filter)
- [x] Calendar sidebar drag-to-reorder not live — fixed 2026-06-30 (live splice in Sidebar.tsx)
- [x] Default calendar setting not applied to new events — fixed 2026-06-30 (Calendar.tsx createAt)
- [x] Event create/move/resize not snapping to 5-minute grid — fixed 2026-06-30 (time.ts + TimeGrid.tsx)
