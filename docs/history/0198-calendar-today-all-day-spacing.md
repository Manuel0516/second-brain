# 0198 — Calendar today all-day spacing

Date: 2026-07-24
Status: accepted

## What changed

All-day event buttons in today's week or day header now sit slightly farther below the
highlighted date.

## Why

The today date uses a circular highlight, which left the first all-day event visually
crowded against it.

## Files touched

- `apps/web/src/styles.css` — increases the all-day band's top margin only inside today's
  header column.

## How the pieces connect

`TimeGrid` already marks today's header column with the `today` class. The targeted CSS
rule uses that existing state to adjust the all-day band without adding component logic or
changing spacing for other days.

## How to modify this later

Adjust the `.week-header .today .allday-band` margin in `apps/web/src/styles.css`. Keep the
rule scoped to `.today` so ordinary day headers retain their current density.
