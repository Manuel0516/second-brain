# 0064 — Hide Fitness card in event edit

Date: 2026-07-05
Status: accepted

## What changed

The Fitness connection card is no longer shown while editing an existing calendar event. It
remains available when creating an event.

## Why

The edit-mode event-to-fitness workflow needs a redesign before it is exposed in the editor.

## Files touched

- `apps/web/src/modules/calendar/EventEditor.tsx` — limits the Fitness connection card to create mode.
- `apps/web/src/modules/calendar/EventEditor.test.tsx` — verifies edit mode does not render the Fitness switch.

## How the pieces connect

`EventEditor` already distinguishes create mode from edit mode using `event.id`. The Fitness
card now follows the same create-only rendering rule as the Notes connection card.

## How to modify this later

Reintroduce an edit-mode Fitness surface only after its ownership and persistence behavior are
defined, then update the edit-mode test with the intended controls.
