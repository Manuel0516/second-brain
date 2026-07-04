# 0040 — Folders linkable as notes in event card links

Date: 2026-07-04
Status: accepted

## What changed

Folders (`Page.type === "folder"`) are now treated identically to notes in the
event editor's linking UI, both in create-mode (Connections → Notes card) and
edit-mode (Linked card). The backend now returns `page_type` on search and link
responses so the frontend can show a 📁 glyph for folders without a custom
emoji icon.

### Backend (`apps/api/app/routes/notes.py`)

- **`_node_details`** now returns a 3-tuple `(title, icon, page_type)` instead
  of `(title, icon)`. The third element is the `Page.type` column for page
  nodes, or `None` for event nodes.
- **`SearchResultResponse`** — added `page_type: str | None = None`. The search
  endpoint populates it from `Page.type` so the frontend can distinguish
  folders from regular pages in search results.
- **`LinkedNodeResponse`** — added `page_type: str | None = None`. The
  `get_event_links` endpoint populates it from `_node_details`, flowing through
  to linked items displayed in the editor.
- **`BacklinkResponse`** — added `page_type: str | None = None`. The
  `get_backlinks` endpoint populates it from `_node_details`.

### Frontend (`apps/web/src/modules/calendar/EventEditor.tsx`)

- **`EventLink` interface** — added `page_type?: string | null`.
- **Search result state** (`noteResults`) — added `page_type?: string | null`
  to the shape.
- **Pending link state** (`pendingNoteLinks`) — added `page_type?: string |
  null` to the shape.
- **`LinkIcon` component** (replaces `linkIcon` string helper) — renders the
  page's custom emoji icon if set; falls back to the sidebar-style folder SVG
  (same `currentColor` stroke path used in the notes sidebar) for folder-type
  pages without an icon; returns `null` otherwise. Used in all three display
  contexts: search results (create + edit mode), linked items (edit mode), and
  pending items (create mode).
- **`createNoteEnabled` default** changed from `true` to `false` — the "Create
  new note" checkbox in the Connections card now starts unchecked.
- **Placeholder text** updated from `"Link an existing note…"` / `"Also link
  existing notes…"` to `"Link a note or folder…"` / `"Also link notes or
  folders…"`.

### Tests (`apps/web/src/modules/calendar/EventEditor.test.tsx`)

- Two tests that relied on `createNoteEnabled` being `true` by default now
  explicitly click the "Create new note" checkbox before saving.

## Why

Folders (`Page.type === "folder"`) were already technically linkable — they are
Pages in the database and the generic `Link` table accepts `target_type: "page"`
for any Page ID. However, the UI had no awareness of folders as a distinct
concept: search results showed them without any distinguishing icon, and the
placeholder text only mentioned notes. The user wanted folders to be treated as
first-class link targets alongside notes in the event editor.

## Files touched

- `apps/api/app/routes/notes.py` — `_node_details` returns 3-tuple; all three
  response models gain `page_type`; search and link endpoints populate it.
- `apps/web/src/modules/calendar/EventEditor.tsx` — `EventLink` interface,
  `noteResults`/`pendingNoteLinks` state shapes, new `linkIcon()` helper,
  linked card and connection card rendering, placeholder text.

## How the pieces connect

The data flow is:

1. User opens event editor and searches for items to link.
2. `GET /api/search?q=...` returns pages (including folders) with `page_type`
   set to `"page"`, `"folder"`, or `"database"`.
3. Frontend displays each result: uses the custom emoji icon if set, otherwise
   shows `📁` for `page_type === "folder"`.
4. When the user clicks a result, `linkExistingNote(pageId)` or
   `pendingNoteLinks` stores the item — linking uses `target_type: "page"`
   (which works for all Page subtypes).
5. `GET /api/events/{id}/links` returns linked items with `page_type` set,
   so the Linked card also shows the `📁` glyph for linked folders without
   a custom icon.
6. Clicking a linked folder navigates to it (same `onOpenNote` handler as
   regular pages).

No schema change was needed — folders were already Pages. The change is purely
in the API response shape and the frontend display logic.

## How to modify this later

- To add another page type to the linking UI, add the type string to the
  `linkIcon()` helper in `EventEditor.tsx` (e.g. `if (pageType === 'database')
  return '🗄️'`).
- To change the fallback icon for folders, update the `'📁'` literal in
  `linkIcon()`.
- The `page_type` field is `null` for event-type nodes — any future
  event-to-event linking UI should handle this case.
- If the `_node_details` return type is changed again, update all three
  response models and their consumers in `get_event_links` and `get_backlinks`.
