# ADR 0003: Calendar view and behavior decisions

Status: accepted

## Context

The calendar module now covers event creation, editing, navigation, selection, bulk actions,
draft preview, recurrence-ready data modeling, and a path toward future Google Calendar sync.
Several behaviors are no longer incidental implementation details; they are the durable product
shape of the calendar experience and should be recorded explicitly.

## Decision

### Views and navigation

- Keep the primary calendar views as day, week, and month.
- Default the calendar landing experience to week view.
- When opening the week view, start the range on Monday.
- The Today action should jump to the current week and reset the cursor to Monday of that week.
- Week navigation should support moving by one day at a time when horizontally displaced.
- Horizontal trackpad navigation should work without relying on native browser back/forward
  gestures.
- Vertical scrolling and zoom behavior should remain native.

### Event creation

- Creating an event begins by clicking or dragging on the calendar grid.
- The creation anchor is minute-precise, not hour-only.
- A click without drag creates a default one-hour event.
- Dragging extends the selection until pointer release, at which point the creation menu opens.
- Events can be created even if the title is still empty while the editor is open.
- Unsaved draft events should remain visible while the editor is being edited.

### Event editing and manipulation

- Events can be moved by dragging the event body.
- Events can be resized from the bottom edge.
- Multiple events can be selected at the same time.
- Selected events can be moved together.
- Multiple events can be copied and pasted together.
- Overlapping events should remain readable, with the shorter event offset slightly to the right
  and layered above the longer one.

### Calendar ownership and identity

- Events belong to a calendar.
- The UI should make calendar identity visible on the event itself, not only in side panels.
- Each event should inherit the owning calendar color by default.
- A calendar-colored right-edge accent is the preferred identity marker in the calendar grid.
- The default calendar exists from the start and can later be renamed or modified.
- Additional calendars are user-creatable and should not require schema changes.

### Event data shape

- Events support notes, location, links, and reminders as first-class fields.
- Events can be linked to a specific calendar when created or edited.
- Event color may be overridden per event.
- Recurring events are supported as a durable calendar concept.
- Google Calendar sync is a future integration path, not a design constraint on current local
  event creation and editing.

### Interaction states

- Selected, dragging, resizing, and draft states should all remain visibly distinct.
- Functional interaction states may be styled, but pointer and persistence logic stays in the
  calendar behavior implementation.
- The calendar should keep native keyboard access and accessible touch targets.

## Consequences

The calendar experience now has a clear behavioral contract:

- Users can create events at minute precision instead of snapping only to hour buckets.
- Dragging and resizing remain fluid for both single and bulk edits.
- The default weekly mental model is Monday-first, with Today re-centering the week.
- Visual identity is driven by calendar color as well as event color and overlap treatment.
- Future Google sync can extend the existing calendar model without changing the core UX
  contract.

The tradeoff is that some behaviors that could have been left implicit are now fixed product
decisions. That is intentional: it reduces ambiguity for both implementation and design work.

