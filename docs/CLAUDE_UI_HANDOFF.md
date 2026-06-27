# Claude UI handoff

This file defines visual-only work for Claude. Codex owns frontend behavior, API contracts,
validation, state, persistence, tests, and backend logic. Claude may change markup and styling,
but must preserve documented behavior and callback/API boundaries.

## Current redesign target: new event panel

Component: `apps/web/src/modules/calendar/EventEditor.tsx`

Claude should redesign the event create/edit panel so it matches the Design Canvas and
`docs/product/DESIGN_SYSTEM.md`. The current panel is functionally complete but its visual
hierarchy, spacing, field grouping, controls, responsive behavior, and polish are placeholders.

Preserve these behaviors exactly:

- The same form fields and submitted values.
- Native form submission through the Save button and Enter where appropriate.
- Visible validation and server errors through `.form-error` with `role="alert"`.
- Save disabled while a request is in flight.
- Escape, backdrop, Cancel, and close-button behavior.
- Delete confirmation and delete error handling.
- Accessible labels, focus states, keyboard operation, and 44px touch targets.
- The `event`, `calendars`, `onClose`, and `onSaved` component interface.
- Existing `/api/events` POST, PATCH, and DELETE contracts.

Visual direction:

- Calm, compact, highly legible panel with color used only for meaning and interaction.
- Strong title/date hierarchy; secondary details should not compete with the event title.
- Group date/time and recurrence controls coherently.
- Make calendar and event-color selection easy to scan.
- Desktop: restrained slide-over. Mobile: usable bottom sheet/full-height panel.
- Use existing design tokens; do not introduce a new visual system or dependency.

Claude should not redesign the calendar grid or sidebar as part of this handoff unless this file
is updated with an additional target.

## Additional redesign target: new calendar creation

Component: `apps/web/src/modules/calendar/Sidebar.tsx`

Claude should redesign the UI used to create a calendar. The current inline name, color, and Save
controls are functional placeholders and need a clean, polished interaction consistent with the
rest of the calendar experience.

Preserve these behaviors exactly:

- The calendar name remains required and the color remains user-selectable.
- Submit through the existing `/api/calendars` POST contract.
- Keep visible request failures in `.form-error` with `role="alert"`.
- Keep the existing `calendars` and `onChanged` component interface.
- After a successful save, close/reset the creation UI and refresh the calendar list.
- Preserve keyboard operation, accessible labels, focus states, and 44px touch targets.
- Do not change calendar rename, color-update, or visibility-toggle logic.

Visual direction:

- Replace the temporary-looking inline controls with an intentional compact popover, panel, or
  equally clear pattern appropriate to the sidebar.
- Give name, color selection, Save, and Cancel a clear hierarchy without adding visual noise.
- Use existing design tokens and calendar-category colors; add no dependency or new visual system.

## Additional redesign target: event selection and manipulation states

Component: `apps/web/src/modules/calendar/TimeGrid.tsx`

Claude should style the functional states introduced for event manipulation without changing
their pointer or keyboard logic:

- Selected events: `.calendar-event.selected`.
- Events while moving or resizing: `.calendar-event.dragging`.
- Bottom-edge resize target: `.event-resize-handle`.
- Bulk move/copy/resize failure message: `.calendar-interaction-error`.

The selected state must be unmistakable without obscuring calendar colors. The resize target
should be discoverable on hover/focus while remaining visually restrained. Dragging should feel
responsive, and errors should be visible without shifting the grid excessively.

Preserve Cmd/Ctrl-click selection, ordinary click-to-edit, pointer drag, bottom-edge resize,
Cmd/Ctrl-C, Cmd/Ctrl-V, `aria-pressed`, pointer capture, and all API calls exactly. Do not move
gesture state or persistence logic into styling components.

Claude should also add a clear calendar-identity marker on every timed event so events from
different calendars are easy to distinguish at a glance. Prefer a calendar-colored right edge
or equivalent narrow accent that always matches the owning calendar color. Keep it subtle,
consistent across views, and compatible with selected/dragging/overlap states.

### Overlapping event layout

Claude should refine the presentation when timed events overlap in the same day column:

- The shorter event should be offset slightly to the right within the same grid column.
- The shorter event should render above the longer event, not be hidden behind it.
- Keep both event titles and active drag/resize handles usable.
- Preserve each event's time-derived vertical position and height.
- Do not allow the horizontal offset to spill into an adjacent day.
- Selection and dragging states must remain visible when events overlap.

This is a visual layout task only. Do not change event times, API data, selection identity, or
bulk-move behavior to achieve the overlap treatment.

### Horizontal day navigation

The grid supports two-finger horizontal trackpad navigation through
`onHorizontalNavigate`. Claude may add restrained movement feedback or transitions, but must
preserve native vertical scrolling, Ctrl/pinch zoom, one-day navigation increments, and arbitrary
seven-day ranges that are not forced to start on Monday.

### Live event draft preview

The calendar now renders an unsaved event while the event editor is open. Drafts use the
`.calendar-event.draft` and `.month-event.draft` states and display `Untitled event` until the user
enters a title.

Claude should make the preview visibly temporary but fully legible. It should feel connected to
the open editor and update naturally as title, time, calendar, and color change. Preserve the live
`onDraftChange` state flow, the `__draft__` identifier, date/time geometry, click protection from
the editor overlay, and the rule that closing without saving removes the preview. Do not persist a
draft or relax backend title validation as part of the styling work.
