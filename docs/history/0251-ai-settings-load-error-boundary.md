# 0251 — AI settings load failures no longer crash the page

Date: 2026-08-16
Status: accepted

## What changed

The AI settings page now checks HTTP status codes and validates the shape of every initial API
response. The main configuration must be a valid settings object; otherwise the route shows a
clear API/database-migration error. Memories, capabilities, actions, and skills load independently,
so an error in one optional section leaves the rest of the page usable and identifies the section
that could not be loaded.

## Why

The loader previously called `response.json()` for five endpoints without checking `response.ok`,
cast every payload to the expected type, and rendered it immediately. An API error object such as
`{"detail":"Internal Server Error"}` was therefore passed to array methods including `filter`,
`map`, and `slice`, crashing the React route. In the reported instance, the local database was
stamped at Finance-branch revision `038` while `main` has a different migration line after `028`;
the `ai_skills` table from main's AI migrations therefore did not exist. No backend or branch-schema
failure should be able to crash the settings UX.

## Files touched

- `apps/web/src/modules/settings/AISettings.tsx` — added status/shape validation, independent
  section loading, cleanup protection, and visible full/partial load errors.
- `apps/web/src/modules/settings/AISettings.test.tsx` — covered a failed configuration endpoint and
  a malformed optional capabilities response.

## How the pieces connect

`fetchJson` rejects non-successful HTTP responses before their bodies can enter component state.
`Promise.allSettled` preserves successful results when sibling requests fail. A valid configuration
unlocks the page; each array-backed section is populated only after `Array.isArray` succeeds, so
the existing render-time array methods always receive arrays.

## How to modify this later

Any new initial AI-settings endpoint must be added to the settled request list with an explicit
runtime shape check before setting state. Keep the configuration endpoint required and ancillary
control-center sections optional. Do not restore unchecked type assertions at the network boundary.
