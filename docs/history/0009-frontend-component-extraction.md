# 0009 — Frontend component extraction

Date: 2026-07-01
Status: accepted

## What changed

Extracted 4 shared UI components from module code into `src/components/`, per the
component architecture plan (`docs/work/plans/COMPONENT_ARCHITECTURE_PLAN.md`):

- **`<Card>`** — card container wrapping `.cal-card`. Used in calendar menu (Sidebar).
- **`<Field>`** — labelled form field wrapping `.cal-field`. Used in calendar sidebar
  for color picker and name fields.
- **`<IconButton>`** — small square icon button (26–30px). Replaced 6+ inline button
  implementations across Sidebar, EventEditor, PageTree, and SettingsLayout.
- **`<ConfirmDialog>`** — portalled confirmation dialog using `.scope-prompt` / `.scope-card`.
  Used in calendar sidebar (delete calendar) and notes (delete page).

## Why

Consolidate recurring UI patterns before new modules (Finance, Fitness, Food) are built.
Each module was independently re-implementing the same HTML/CSS patterns, causing
inconsistencies and duplication.

## Files touched

- `apps/web/src/components/Card.tsx` — new: wraps `.cal-card` with optional `animate` prop
- `apps/web/src/components/Field.tsx` — new: wraps `.cal-field` with label+children
- `apps/web/src/components/IconButton.tsx` — new: inline-styled icon button (no new CSS)
- `apps/web/src/components/ConfirmDialog.tsx` — new: portalled scope-prompt dialog
- `apps/web/src/modules/calendar/Sidebar.tsx` — replaced 6 patterns with Card, Field,
  IconButton, ConfirmDialog
- `apps/web/src/modules/calendar/EventEditor.tsx` — replaced editor-close with IconButton
- `apps/web/src/modules/notes/Notes.tsx` — replaced pendingDelete dialog with ConfirmDialog
- `apps/web/src/modules/notes/PageTree.tsx` — replaced heading buttons with IconButton
- `apps/web/src/modules/settings/SettingsLayout.tsx` — replaced close button with IconButton
- `docs/work/plans/COMPONENT_ARCHITECTURE_PLAN.md` — updated component status table

## How the pieces connect

The four new components sit alongside the existing `AppRail`, `EmojiPicker`, `Segmented`,
and `ProtectedRoute` in `src/components/`. They export named functions consumed by
calendar, notes, and settings modules via standard imports. No new CSS was added — all
components reuse existing classes from `styles.css`.

## How to modify this later

- Extending Card: add `as` prop for semantic elements (form, section) if needed.
- Extending IconButton: add support for SVG icon components via `icon` prop (already
  handled via `ReactNode`).
- New consumers: import from `src/components/<Name>`, pass the required props.
- The remaining P2 components (`SaveIndicator`, `SearchField`, `SidebarShell`,
  `LinkedItems`) should be extracted when a second real consumer emerges.
