# ADR 0004: Calendar first-pass implementation and integration decisions

Status: accepted

## Context

The first calendar phase is complete enough that several implementation choices are no longer
temporary. The module now defines the app's main navigation rhythm, event editing contract,
mobile behavior, and the first graph connections into Notes, Finance, Fitness, and Food.

These decisions affect the calendar UI, the API, the database schema, and the shape of future
modules that attach to calendar events.

## Decision

### Calendar grid and navigation

- Keep the calendar focused on a week-first main experience on desktop.
- On mobile, default the grid to a compact multi-day view that starts with today.
- The week title must always match the days currently shown in the grid.
- Remove the year from the mobile title to keep the header compact.
- Render all-day events as small rectangles at the top of the grid, directly under the day name.
- Make horizontal scrolling feel continuous instead of jumpy when moving between days.
- Keep horizontal motion aligned to day boundaries so the grid feels sticky to the current day.

### Event interaction

- Dragging an event must follow the pointer while the mouse button is still down.
- Snapping should stay aligned to the 5 minute grid.
- Whole-day to timed event dragging must keep the visual ghost aligned with the pointer.
- Events shorter than 15 minutes cannot be resized from the grid with the mouse.
- Short events can still be edited through the edit event card.
- Event text should remain visible for small events until the box is genuinely too short to fit it.
- Remove the title only when the rendered box height makes the text unusable.

### Event editing behavior

- Editing an existing event is manual save only.
- Auto-save is removed entirely from the event editor.
- Saving uses a fixed-width button so the control does not jump while state changes.
- The save flow uses the same loading circle visual as the login screen, then a tick, then closes.
- The loading state must stay visible long enough to read.
- Validation failures for missing titles or invalid time ranges must show an error state on the save button.
- Validation errors must also surface in a centered alert attached to the edit card, not buried inside it.
- The editor should animate in and out when opening and closing.

### Calendar identity and sidebar controls

- Do not edit calendar name or color inline in the sidebar.
- Use a three dot menu for each visible calendar to change name and color.
- The create and edit event color pickers must include an explicit option to use the owning calendar color.
- Choosing calendar color should immediately switch the picker back to that inherited color state.

### Cross-module connections

- The event editor must expose structured connection toggles for Notes, Finance, Fitness, and Food.
- Each connection type can reveal its own future-specific fields without changing the base event schema again.
- These values are stored as event-owned drafts until the target modules exist.
- The backend must validate and persist these drafts without creating fake link targets.
- Actual graph edges use the generic `Link` table once a real target record exists.

### Data and API shape

- Calendar events now carry a `connections` JSON payload for structured cross-module drafts.
- The database also has a generic `Link` table for real graph edges between modules.
- Event create and update APIs must preserve the connection payload.
- The calendar API must reject impossible date ranges and missing required titles.
- Event responses must round-trip the connection payload so the editor can reopen in the same state.

### Mobile chrome

- On mobile, the app navbar and calendar sidebar act like one coordinated drawer.
- Hiding one must hide the other so the mobile chrome feels like a single surface.
- The combined mobile behavior is only for small screens; desktop keeps the existing layout.

## Consequences

The calendar is now the spine of the app in practice, not only in the architecture doc.

- Users get a smoother grid experience with explicit day snapping and better drag feedback.
- Short events remain editable without becoming visually broken.
- Manual save keeps the editor predictable and avoids background saves that feel noisy.
- The sidebar and editor now reflect a stable calendar ownership model instead of direct inline mutation.
- Notes, Finance, Fitness, and Food can attach to the calendar without a schema rewrite later.
- The current implementation sets the contract for later modules: they should connect through the same graph and reuse the same editor and validation patterns.

