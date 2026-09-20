# 0267 — Event copy UI consistency

Date: 2026-09-20
Status: accepted

## What changed
The event editor's Copy to calendar helper text and action now reuse the existing
connection-help and connection-open-note styles. The text has the same compact,
muted typography as other editor hints, and the action has the same font size,
accent treatment, border, and hover behavior as other inline editor actions.
The button also references its explanatory text for assistive technology.

## Why
The copy section used an unstyled paragraph and button, making it visually
inconsistent with the surrounding editor. The user requested matching typography
and button styling.

## Files touched
- `apps/web/src/modules/calendar/EventEditor.tsx` — apply existing helper and action classes and associate the button with its description.
- `docs/history/0267-event-copy-ui-consistency.md` — record this change.
- `docs/history/CHANGELOG.md` — index this entry.

## How the pieces connect
EventEditor renders the destination Dropdown and calls copyToCalendar from the
action. Existing styles in styles.css already define the editor's helper text and
inline actions, so this change reuses those rules without adding CSS or changing
copy behavior, destination selection, or disabled states.

## How to modify this later
Find the Copy to calendar fieldset in EventEditor.tsx to change its content.
Keep its classes aligned with other editor actions. Changes to connection-help
or connection-open-note in styles.css affect all consumers, so inspect those
callers before changing shared styling.
