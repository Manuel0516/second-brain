# 0070 — Event-linked empty state + fitness icon + workout type icons + topbar fix

Date: 2026-07-05
Status: accepted

## What changed

- **`event-linked-empty` CSS** (`styles.css`): Added styling for the empty-state paragraph
  in the event editor's Linked section. The class had no CSS rules, causing the
  "Nothing linked yet" message to render without proper font or spacing. Now styled with
  `var(--font-ui)`, `var(--text-tertiary)` color, 12px font-size, centered text, and
  appropriate padding.

- **`LinkIcon` component** (`EventEditor.tsx`): Extended to accept `targetType` prop
  and render a dumbbell SVG for `workout_session` links. Fixed ordering — the
  `targetType` check now runs _before_ the generic `if (icon)` fallback, so an
  API-returned emoji won't override the dedicated dumbbell icon.

- **Fitness topbar fix** (`Fitness.tsx` + `fitness.css`): The `fit-topbar-nav-group`
  (week number + nav buttons) now sits to the right of the "Fitness" title via the new
  `.fit-topbar-title-row` flex wrapper, matching the calendar's horizontal title+nav layout.

- **Workout-type icons** (`EventEditor.tsx` + `styles.css`): Each workout type card in the
  fitness connection panel (Push, Pull, Legs, Upper, Cardio, Custom) now shows a
  distinctive 13px SVG icon next to the label. `.type-card` updated to `display: flex`
  with a 5px gap; icons fade to 0.65 opacity normally and snap to full opacity when active.

## Why

- Empty-state text was unstyled, breaking visual consistency.
- Workout links in the Linked section had no icon, making them indistinguishable from notes.
- Dumbbell SVG was hidden by an API-returned emoji due to check ordering.
- Topbar nav-group was vertically stacked below the title, not beside it like the calendar.
- Type cards lacked visual distinction — icons make them scannable at a glance.

## Files touched

- `apps/web/src/styles.css` — Added `.event-linked-empty` rules; updated `.type-card` with `display:flex` + `gap`; added `.type-card svg` opacity rules.
- `apps/web/src/modules/calendar/EventEditor.tsx` — Reordered `LinkIcon` checks; added dumbbell SVG + workout-type icons with inline SVGs per type.
- `apps/web/src/modules/fitness/Fitness.tsx` — Added `fit-topbar-title-row` class to the title/nav wrapper div.
- `apps/web/src/modules/fitness/fitness.css` — Added `.fit-topbar-title-row` flex-row class.
