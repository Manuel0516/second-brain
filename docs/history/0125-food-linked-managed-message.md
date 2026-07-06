# 0125 — Food connection card: "Managed from linked" message

Date: 2026-07-06
Status: accepted

## What changed
- Added `foodLinked` computed variable in `EventEditor` that mirrors `fitnessLinked` — true when the event has a linked `meal_log` or `event.connections?.food`.
- Food connection toggle is now `disabled={foodLinked}` when a meal log is already linked.
- When `foodLinked` is true and the food toggle is on, the card shows a "Managed from the linked meal" help message instead of the meal_type/notes form.

## Why
- When a calendar event had a linked meal log (created by the food connection hook), the food connection card still showed the meal_type selector and notes textarea — but those values were already consumed by the backend hook. This mirrors the fitness connection card behavior, which already showed a "Managed from the linked workout" message when a workout session was linked.

## Files touched
- `apps/web/src/modules/calendar/EventEditor.tsx` — added `foodLinked` variable (after `fitnessLinked`), added `disabled={foodLinked}` to food toggle, wrapped food card content in `foodLinked ? <help message> : <form>` ternary

## How the pieces connect
- `foodLinked` checks `eventLinks` (fetched from `GET /api/events/{id}/links`) for `meal_log` targets and also checks `event.connections?.food` for the inline connection flag.
- The food card toggle is disabled when linked (same as fitness), preventing the user from toggling off a connection that already has a meal log.
- The help message directs the user to the "Linked" card above to open the meal log, consistent with the fitness pattern.

## How to modify this later
- The `foodLinked` variable lives right after `fitnessLinked` (~line 518). Both follow the same pattern: check `event.id`, check `eventLinks` for the target type, check `event.connections` for the inline flag.
- To change the help message text, edit the `<p className="connection-help">` block inside the `foodLinked` ternary.
- To add a similar pattern for another connection type (e.g. finance), add a new `*Linked` variable, disable the toggle, and add the ternary with a help message.