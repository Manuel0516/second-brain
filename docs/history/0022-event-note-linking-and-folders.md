# 0022 — Event↔note linking rework + folder page type

Date: 2026-07-02
Status: accepted

## What changed

- **New `folder` page type** (third `pages.type` value — no migration, the
  column is String(16)). Folders show a folder glyph in the notes sidebar,
  can be chosen in the row menu's Type select, and render as a simple child-
  page list in the canvas (no block editor).
- **New shared `FolderPicker` component** (`src/components/FolderPicker.tsx`):
  native select of all folder pages, depth-indented, with a Root option.
- **Event creation** (EventEditor, no event id yet): toggling the Notes
  connection now asks for Folder + Note title AND lets you attach existing
  notes via search — pending links render as removable rows. The draft is
  stored in `event.connections.notes = { title, folder_id, link_ids }`. On
  save: the note is created inside the folder (`POST /events/{id}/note` with
  `parent_page_id`), then each pending link is created via `POST /api/links`
  (409/network failures non-fatal).
- **Event editing**: the Notes connection card is now toggle-only. All link
  management moved to the Linked card (visible only while the toggle is on):
  open note, unlink, link existing (search), and "Create new note" which
  reveals an inline Folder + title mini-form and posts with `force_new` when
  the event already has a note (so one event can gather several notes). If
  links were made from the notes side, the toggle flips on automatically when
  links load.
- **Toggle OFF while editing** deletes every event↔page link on save (loop of
  `DELETE /api/links/{id}`); the note pages survive in the tree. Cleanup runs
  at save time so Cancel stays safe. The PATCH already sends
  `connections.notes: null`.
- **Backend**: `EventNoteCreate` gained `parent_page_id` (validated through
  `_owned_page`, also honored from the draft's `folder_id`) and `force_new`
  (skips the idempotent existing-note shortcut). `NoteConnection` (calendar.py)
  accepts `folder_id` + `link_ids` (max 50).

## Why

User request: notes need folders, and the event editor's note connection
needed a real create-vs-edit split — draft fields at creation, a Linked card
for management afterwards, and a clean way to disconnect everything.

## Files touched

- `apps/api/app/routes/notes.py` — folder Literal, EventNoteCreate fields, create_event_note parent/force_new.
- `apps/api/app/routes/calendar.py` — NoteConnection folder_id/link_ids.
- `apps/api/tests/test_notes.py` — folder creation, note-in-folder, draft folder_id, force_new, idempotency.
- `apps/web/src/components/FolderPicker.tsx` — new.
- `apps/web/src/modules/calendar/EventEditor.tsx` — the rework (state, connections build, persist flow, connection card, Linked card, openEventNote).
- `apps/web/src/modules/calendar/types.ts` — EventConnections.notes shape.
- `apps/web/src/modules/calendar/EventEditor.test.tsx` — mock answers /api/pages; new tests: folder create flow, toggle-only edit card + unlink on toggle-off.
- `apps/web/src/modules/notes/{types.ts,Sidebar.tsx,PageView.tsx}` — folder type, sidebar option/glyph, folder canvas branch.

## How the pieces connect

Create and edit are now different data paths sharing one Link table. Create
mode is draft-driven: everything lives in local state + `connections.notes`
until the event POST succeeds, then the frontend materializes the note and
links. Edit mode is server-state-driven: the Linked card renders `eventLinks`
(from `GET /api/events/{id}/links`) and every action (link/unlink/create)
round-trips and calls `refreshLinks()`. The toggle is derived from
`connections.notes` at open and corrected to true when page links load —
so it always reflects reality, and switching it off is the single destructive
action (links only).

## How to modify this later

- Create-mode fields: the `form.connect_notes && !event.id` block in the
  connections card (EventEditor).
- Linked card actions: the `event.id && form.connect_notes` fieldset;
  `openEventNote` controls the force_new/folder behavior.
- Toggle-off cleanup: the `event.id && !form.connect_notes` loop in
  `persist()`.
- Folder rendering: `PageView.tsx` folder branch; `FolderPicker` handles
  nesting/indentation on its own.
- Recurring events: links point at the event id the editor holds (master for
  series) — the spec's §8.5 split-series handling remains deferred until
  series-splitting exists.
