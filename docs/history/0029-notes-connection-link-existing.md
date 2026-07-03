# 0029 — Link existing note in event connection card

Date: 2026-07-03
Status: accepted

## What changed
Added a "Create new note" checkbox inside the Notes connection card in the event
editor's create mode. When unchecked, the event saves without creating a new
Page — only the pre-selected existing notes are linked via `Link` rows. When
checked (the default), behavior is unchanged: a new Page is created and linked.

## Why
Before this change, enabling the Notes toggle on a new event always created a
new note page. There was no way to connect an existing page to a new event
without also creating a fresh page. The user wanted the option to link existing
notes only, matching the pattern already available in the Linked fieldset.

## Files touched
- `apps/web/src/modules/calendar/EventEditor.tsx` — added `createNoteEnabled`
  state (default `true`); the connection card now shows a "Create new note"
  checkbox that toggles the FolderPicker + title fields with a slide-open
  animation (`.connection-create-fields`); a "Folder" mono label sits above
  the FolderPicker; the `persist` callback skips `POST /api/events/{id}/note`
  when `createNoteEnabled` is `false`, only writing `Link` rows for the
  pending picks.
- `apps/web/src/styles.css` — added `.connection-create-fields` (animated
  `max-height` + `opacity` on toggle) and `.connection-field-label` (mono
  uppercase label matching the style guide section-label pattern).

## How the pieces connect
The Notes connection card in the event editor (create mode) now has two
sub-options gated behind the Notes toggle:

1. **Create new note** (checkbox, default on) — shows FolderPicker + note title.
   On save, calls `POST /api/events/{id}/note` to create the Page + Link.
2. **Link existing notes** (search input, always visible) — searches pages by
   title, adds them to `pendingNoteLinks`. On save, writes `Link` rows via
   `POST /api/links`.

Both sub-options can be active simultaneously. When only "Link existing" is
used, the `connections.notes` JSON on the event still carries a title (from the
event title) for provenance, but no Page is created. The toggle in edit mode
remains toggle-only — the Linked card manages all linking there.

## How to modify this later
- The `createNoteEnabled` state lives in `EventEditor.tsx` near the other
  note-related state. It defaults to `true` on every mount.
- The `persist` callback's dependency array includes `createNoteEnabled`.
- If you want this pattern in edit mode too, add the same checkbox + search
  inside the `form.connect_notes && event.id` branch (currently toggle-only).
- The `connections.notes.title` sent to the backend is always populated
  (`form.note_title.trim() || form.title.trim()`), even when no page is
  created — this is intentional provenance data per the plan.
