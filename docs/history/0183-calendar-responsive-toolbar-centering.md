# 0183 — Calendar responsive toolbar centering

Date: 2026-07-24
Status: accepted

## What changed

Restored centered responsive positioning for the Calendar selector and add button after the
desktop secondary wrapper was removed. On widths up to 800px, the primary controls occupy the
first row and the selector/add controls center together on the second row.

## Why

The direct-child desktop structure left the responsive controls aligned by grid columns
instead of centered as they were with the former secondary wrapper.

## Files touched

- `apps/web/src/styles.css` — add a responsive flex-wrap layout for the direct toolbar
  children and adjust the compact selector width for the larger 12px control gap.

## How the pieces connect

The responsive media query changes the same three direct toolbar children to a centered flex
wrap. The primary group spans the first row, while `.calendar-tabs` and
`.cal-new-event-button` remain sibling items in the centered second row. Desktop space-between
alignment is unaffected.

## How to modify this later

Keep the responsive breakpoint aligned with the app rail breakpoint. If the add button or
selector width changes, update the selector's `calc(100% - 46px)` allowance so the second row
continues to fit narrow phones.
