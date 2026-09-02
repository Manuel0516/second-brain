# 0260 — Native desktop event time inputs

Date: 2026-09-02
Status: accepted

## What changed

The New event/Edit event card now renders its desktop start and end date/time controls as
separate ordinary native inputs. The compact segmented appearance remains on mobile.

## Why

User request to remove the custom input design used for choosing the starting and ending hour
in the desktop event card.

## Files touched

- `apps/web/src/styles.css` — overrides the desktop date/time wrapper and input styles while
  preserving the mobile layout.
- `docs/history/0260-desktop-event-time-inputs.md` — records the change.
- `docs/history/CHANGELOG.md` — indexes the change.

## How the pieces connect

`EventEditor.tsx` already uses native `date` and `time` inputs and keeps the submitted value
shape unchanged. The desktop media query only removes the visual wrapper treatment; its change
handlers and validation continue to use the existing form state.

## How to modify this later

Adjust the desktop override beside the existing `.dt-field` rules. Keep mobile-specific layout
changes inside the mobile media query unless the sheet design is intentionally changed too.
