# 0012 — Notes title focus ring

Date: 2026-07-02
Status: accepted

## What changed

The notes page title now reserves its border while unfocused and changes only the border
color and outward focus ring when focused.

## Why

Adding the border only on focus changed the title row's dimensions and moved nearby
content. The notes-wide focus outline also competed with the title's own focus style.

## Files touched

- `apps/web/src/modules/notes/notes.css` — made the title border layout-stable and aligned
  its focus treatment with the standard accent border and outward ring.

## How the pieces connect

`PageView.tsx` renders the page title as `.notes-title-input`. Its focused selector is
scoped through `.notes-shell`, so it overrides the generic notes input outline without
changing focus behavior for sidebar, database, or dialog inputs.

## How to modify this later

Change `.notes-title-input` for title geometry and `.notes-shell
.notes-title-input:focus` for its focus treatment. Keep the unfocused border width equal
to the focused border width to prevent layout movement.
