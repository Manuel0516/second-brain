# 0261 — Paste calendar events at the pointer

Date: 2026-09-02
Status: accepted

## What changed

Copied calendar events now paste at the five-minute grid time under the pointer. When the
pointer is outside a timed day column, they paste one day after the first copied event at its
original hour.

## Why

User request to make paste follow the current pointer position while retaining a predictable
next-day fallback outside the calendar grid.

## Files touched

- `apps/web/src/modules/calendar/TimeGrid.tsx` — tracks the live timed-grid paste target.
- `apps/web/src/modules/calendar/TimeGrid.interaction.test.tsx` — covers pointer-targeted and
  fallback pastes.
- `docs/history/0261-calendar-paste-target.md` — records the change.
- `docs/history/CHANGELOG.md` — indexes the change.

## How the pieces connect

The existing copy endpoint preserves the selected events' relative timing from one
`target_start`. `TimeGrid` supplies that start from the hovered day column, or the existing
one-day fallback when no column is hovered.

## How to modify this later

Keep all paste-target decisions in `TimeGrid` before the `/api/events/copy` call. The backend
should continue receiving one authoritative `target_start` for a multi-event paste.
