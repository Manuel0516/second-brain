# 0013 — Shared sidebar and settings cards

Date: 2026-07-02
Status: accepted

## What changed

Added `SidebarShell` as the shared sidebar/header/footer component used by Calendar,
Notes, and Settings. Added `SettingsCard` and replaced the three separate card
implementations in General, Calendar, and Admin settings. Shared sidebar CSS now uses
the component-oriented `.app-sidebar` name instead of `.calendar-sidebar`, and Settings
card styles moved from inline objects into shared CSS.

## Why

The three main modules shared visual class names but still duplicated the structural
markup that those classes expected. Settings also maintained three versions of the same
card. Centralizing those contracts makes future modules compose existing components and
prevents markup and focus/layout behavior from drifting between pages.

## Files touched

- `apps/web/src/components/SidebarShell.tsx` — shared semantic sidebar with title,
  actions, content, open state, and optional footer.
- `apps/web/src/components/SettingsCard.tsx` — shared Settings card with optional
  description and save state.
- `apps/web/src/modules/calendar/Sidebar.tsx` — uses `SidebarShell` for Calendar chrome.
- `apps/web/src/modules/notes/Sidebar.tsx` — uses `SidebarShell`, including its Trash
  footer.
- `apps/web/src/modules/settings/SettingsLayout.tsx` — uses `SidebarShell` as a nav.
- `apps/web/src/modules/settings/GeneralSettings.tsx` — uses the shared `SettingsCard`.
- `apps/web/src/modules/settings/CalendarSettings.tsx` — uses the shared `SettingsCard`.
- `apps/web/src/modules/settings/AdminSettings.tsx` — uses the shared `SettingsCard`.
- `apps/web/src/styles.css` — owns the shared sidebar and Settings card contracts.
- `apps/web/src/modules/notes/notes.css` — updates sidebar documentation to name the
  component contract.
- `docs/work/plans/COMPONENT_ARCHITECTURE_PLAN.md` — records the implemented components.

## How the pieces connect

Each module continues to own its domain rows, menus, responsive state, and actions, but
passes that content into `SidebarShell`. The component emits the stable `.app-sidebar`,
`.sidebar-title`, and `.sidebar-title-actions` structure consumed by `styles.css`.
Settings pages similarly pass their specific controls into `SettingsCard`, which owns the
shared heading, body spacing, and optional save footer.

## How to modify this later

Change shared sidebar geometry in the `.app-sidebar` rules and shared Settings card
geometry in the `.settings-card*` rules in `styles.css`. Add module-only classes through
`SidebarShell.className`; do not copy the shell markup back into a feature module.
