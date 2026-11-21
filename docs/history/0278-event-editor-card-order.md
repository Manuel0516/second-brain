# 0278 — Event editor card order

Date: 2026-11-21
Status: accepted

## What changed

The Linked card follows the event title. Copy to calendar is the last card, just above the form actions.

## Why

The user wanted linked records near the title and the copy action at the end of the editor.

## Files touched

- `apps/web/src/modules/calendar/EventEditor.tsx` — moved the existing Linked and Copy to calendar fieldsets.

## How the pieces connect

The create and edit panels share the event editor form. Linked and Copy to calendar appear for saved events, since both operate on the saved event.

## How to modify this later

Move the fieldsets in the form markup to change their visual and keyboard order together. Keep Copy to calendar above the form footer and preserve the saved-event conditions for both cards.
