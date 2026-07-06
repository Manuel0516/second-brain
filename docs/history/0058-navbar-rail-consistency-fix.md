# 0058 — Navbar/AppRail consistency fix

Date: 2026-07-05
Status: accepted

## What changed

- **Calendar.tsx**: Made the AppRail (global navigation rail) conditional on mobile.
  Previously it always rendered; now it hides when the page sidebar is closed on mobile
  (≤640px), matching the Fitness and Settings behavior.
- **Notes.tsx**: Added an `isMobile` state with a 640px breakpoint.
  Made the AppRail conditional on mobile — same pattern as Calendar/Fitness/Settings.
- No changes to Fitness.tsx or SettingsLayout.tsx — they already had the correct pattern.

## Why

The user reported that the navbar behaves "weirdly" across pages. The root cause was
inconsistency: Calendar and Notes always rendered the AppRail on all screen sizes,
while Fitness and Settings conditionally rendered it only on mobile when the sidebar
was open. On mobile, the AppRail was taking up screen real estate even when the page
sidebar was closed, which is undesirable.

## Files touched

- `apps/web/src/pages/Calendar.tsx` — Changed unconditional `<AppRail />` to
  `{(!isMobile || sidebarOpen) && <AppRail />}`, so on mobile the rail hides with
  the sidebar.
- `apps/web/src/modules/notes/Notes.tsx` — Added `isMobile` state (640px breakpoint)
  with matching `useEffect` listener. Changed unconditional `<AppRail />` to
  `{(!isMobile || sidebarOpen) && <AppRail />}`, same pattern as Calendar.

## How the pieces connect

Each page layout follows this structure:
```
<div class="page-shell">
  {(!isMobile || sidebarOpen) && <AppRail />}
  <div class="workspace">
    <Sidebar open={sidebarOpen} />
    <main>...</main>
  </div>
</div>
```

On desktop (`isMobile === false`), the condition `(!false || sidebarOpen)` is always
`true` — the AppRail is always visible regardless of sidebar state. The sidebar toggle
button only affects `sidebarOpen`, which controls the page sidebar independently.

On mobile (`isMobile === true`), the condition collapses to `sidebarOpen` — the AppRail
is only rendered when the page sidebar is open. Clicking the sidebar toggle button
toggles `sidebarOpen`, which affects both the sidebar and the AppRail in unison.

## How to modify this later

To change the mobile breakpoint, update the `640` value in the `isMobile` state
initializer and the `matchMedia` call in the `useEffect`. The same pattern exists in:
- Calendar.tsx (lines 59–61, 168–173)
- Notes.tsx (lines 71–72, 115–120)
- Fitness.tsx (lines 58–60, 143–148)
- SettingsLayout.tsx (lines 68–69, 75–80)

If the approach ever needs to animate instead of mounting/unmounting, add a `closed`
prop to `AppRail` that applies the `.app-rail.closed` / `.app-rail.open` CSS classes
(already defined in `styles.css` at the `@media (max-width: 800px)` breakpoint).
