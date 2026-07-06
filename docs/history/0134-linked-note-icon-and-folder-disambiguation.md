# 0134 — Linked note emoji hidden and folder-nested notes indistinguishable

Date: 2026-07-06
Status: accepted

## What changed

1. Linked notes in the Event Editor (the "Linked" list, both note-search-result dropdowns, and
   the create-mode pending-links list) now show the note's real emoji/icon instead of always
   falling back to a generic monochrome SVG.
2. Every place that shows a linked or searchable note — the Event Editor's linked list and
   search dropdowns, and a note's own "Linked" backlinks panel (`Backlinks.tsx`) — now shows the
   note's immediate parent folder title (`in <parent>`) when it has one, so two notes with the
   same title in different folders (e.g. two "Shopping" notes, one at root and one nested in a
   folder — both exist in the current data) are distinguishable.
3. `NotesPagePane.tsx`'s ancestor-breadcrumb walk now guards against a `parent_page_id` cycle
   with a `seen` set, instead of being able to loop forever if one is ever introduced (none exist
   today, confirmed via a recursive CTE against the live DB).

## Why

User report: "linking notes inside folders to event from the edit event... is crashing the app.
A note inside a folder is linked is not being liked or read correctly to link it, for example the
emoji does not appear on the note and there are a lot of weird behaviour." Investigation (reading
`_node_details`, `search_nodes`, `FolderPicker.tsx`, `NotesPagePane.tsx`, `PageView.tsx`, and
running cycle-detection + duplicate-title queries against the live dev DB) found no folder-nesting
bug in the backend link-reading logic, no `parent_page_id` cycles, and confirmed the Nerd-Font PUA
icon CSS already works. It did find two concrete, real defects: `LinkIcon` deliberately discarded
a note's real icon by design, and nothing in the UI showed which folder a linked/searched note
lived in — directly explaining both symptoms described ("emoji does not appear" and a folder note
being indistinguishable from another note of the same name).

## Files touched

- `apps/api/app/routes/notes.py` — `_node_details` now also resolves and returns a page's
  immediate parent title as a 4th tuple element (only for `page` nodes; other node types return
  `None`). `BacklinkResponse`, `LinkedNodeResponse`, and `SearchResultResponse` each gained a
  `parent_title: str | None = None` field, populated from `_node_details` in `get_backlinks` and
  `get_event_links`, and from a `parent_page_id -> title` lookup built inline in `search_nodes`
  (which queries pages directly rather than routing through `_node_details`).
- `apps/web/src/modules/calendar/EventEditor.tsx` — `LinkIcon` gained an `icon` prop, rendered
  before any of the existing monochrome SVG fallbacks. `EventLink`, the `noteResults` state type,
  and the `pendingNoteLinks` state type all gained `parent_title`. All 4 render call sites (linked
  list, both search-result dropdowns, pending-links list) now pass `icon` to `LinkIcon` and render
  `parent_title` as a small "in `<parent>`" line next to the title.
- `apps/web/src/modules/notes/types.ts` — `Backlink` and `SearchResult` both gained
  `parent_title?: string | null`, matching the backend response shape.
- `apps/web/src/modules/notes/Backlinks.tsx` — renders `item.parent_title` the same way.
- `apps/web/src/modules/notes/NotesPagePane.tsx` — `ancestors` walk now tracks visited parent ids
  in a `Set` and stops if it would revisit one, instead of only stopping when a parent id isn't
  found.
- `apps/web/src/styles.css` — added `.event-link-parent` (small, muted, ellipsis-truncated) next
  to the existing `.event-linked-item`/`.event-link-results` rules.

## How the pieces connect

All three Link-reading endpoints route real page details through the single `_node_details`
helper, so extending its return tuple by one element automatically reaches every caller
(`get_backlinks`, `get_event_links`); `search_nodes` doesn't use that helper (it queries pages
directly for full-text search) so it got the equivalent `parent_page_id -> title` lookup inline.
On the frontend, `parent_title` flows straight through from the `/api/search` JSON response into
`noteResults` state (no filtering drops it), into `pendingNoteLinks` when a result is clicked, and
is rendered wherever a linked/searchable note's title is shown.

## How to modify this later

- If a note is nested more than one folder deep, only the immediate parent's title is shown, not
  the full breadcrumb path — deliberate, since a single "in `<parent>`" line is enough to
  disambiguate real duplicate-titled notes in the current data; if deeper ancestor chains become
  common, `_node_details` would need to walk parents recursively instead of a single lookup.
- No literal JS crash was found or reproduced this session (backend link logic, `FolderPicker`,
  and `NotesPagePane`/`PageView` were all confirmed correct and folder-agnostic; no
  `parent_page_id` cycles exist). If "crashing" behavior persists after this fix, get a specific
  repro note/event id or a browser console error to keep investigating — don't assume this entry
  covers every possible cause.
- 7 stale orphaned `Link` rows exist in the dev DB from before the 0133 fix (pointing at pages
  trashed before that fix existed) — a one-time cleanup `DELETE` was proposed but never confirmed
  by the user; still pending a go-ahead.
