# 0030 — Notes media, embeds, tables, and multi-column layout

Date: 2026-07-03
Status: accepted — frontend half reworked the same day, see 0031 (column
drag-creation, image NodeView controls, table DOM fix, bookmark fixes)

## What changed

Implemented all 5 phases of the Notes media and layout plan:

**Backend — file upload service (prerequisite)**
- Added `minio` Python client dependency to `pyproject.toml`
- Added MinIO/S3 config settings to `config.py` (endpoint, credentials, bucket, public URL)
- Created `app/storage.py` — lazy-init MinIO client, upload/download/delete helpers, content-type validation, 10 MB size cap
- Added `File` model to `models.py` (id, user_id, name, content_type, size, created_at)
- Created migration 012 (`alembic/versions/012_files.py`) for the `files` table
- Created `app/routes/files.py` with:
  - `POST /api/files` — multipart upload with content-type validation and size cap
  - `GET /api/files/{id}` — ownership-checked stream from MinIO with long cache headers
  - `DELETE /api/files/{id}` — remove object + DB row
  - `GET /api/embed?url=` — server-side metadata fetch (SSRF-guarded, stdlib HTML parser, 5s timeout, 512 KB cap, returns title/description/image/favicon)

**Image blocks (frontend)**
- Created `editor/ImageNode.ts` — hand-rolled TipTap image block node (~60 lines), attrs: src, alt, width (percent), align ('left'|'center'|'right'), renders as `<figure data-type="image"><img …></figure>`
- Paste handler in `BlockEditor.tsx` — clipboard image → upload via POST /api/files → insert
- Drop handler — same flow for dragged image files
- Slash command `Image` → hidden file picker → upload → insert
- CSS: `figure[data-type='image']` with `--r-md` radius, width/alignment controls

**Link embed (bookmark) cards**
- Created `editor/BookmarkNode.tsx` — atom block node with React NodeView card: favicon + title + description left, thumbnail right, whole card opens URL in new tab
- Slash command `Bookmark` → prompt → fetch `/api/embed` → insert card
- Paste handler: bare URL on empty paragraph → fetch metadata → insert bookmark card (inline URLs stay as links)
- CSS: `.notes-bookmark` card with tokens, hover lift, remove button overlay

**Table row/column controls**
- Created `editor/TableNodeView.tsx` — NodeView wrapper for tables with hover-revealed header: add/delete row, add/delete column, toggle header, delete table
- Edge "+" affordances: absolutely-positioned buttons on right and bottom of table
- CSS: hover-revealed toolbar, edge buttons with accent color

**Multi-column layout**
- Created `editor/ColumnNodes.ts` — `columnList` (flex container, 2–3 columns) + `column` (block container, no nesting)
- AppendTransaction plugin auto-normalizes: single-column columnList unwraps to top-level
- Slash commands `2 columns` / `3 columns` — wraps current block into columnList with empty sibling
- CSS: flexbox gap, columns stack vertically under 640px

## Why

User requested Notion-style features: image blocks, link embed cards, table row/column controls, and multi-column page layout. These complete the core notes editing experience.

## Files touched

- `apps/api/pyproject.toml` — added `minio` dependency
- `apps/api/app/config.py` — added MinIO config fields
- `apps/api/app/storage.py` — new MinIO client helper module
- `apps/api/app/models.py` — added `File` model
- `apps/api/alembic/versions/012_files.py` — new migration for files table
- `apps/api/app/routes/files.py` — new files and embed router
- `apps/api/app/main.py` — registered files router
- `apps/web/src/modules/notes/editor/ImageNode.ts` — new image block node
- `apps/web/src/modules/notes/editor/BookmarkNode.tsx` — new bookmark card node
- `apps/web/src/modules/notes/editor/ColumnNodes.ts` — new column layout nodes
- `apps/web/src/modules/notes/editor/TableNodeView.tsx` — new table controls NodeView
- `apps/web/src/modules/notes/editor/BlockEditor.tsx` — registered new extensions, added paste/drop handlers, slash commands for Image/Bookmark/2 columns/3 columns
- `apps/web/src/modules/notes/notes.css` — CSS for images, bookmarks, table controls, multi-column layout

## How the pieces connect

The backend file service (MinIO + files table + routes) is the foundation for image uploads. The frontend sends images via `POST /api/files` and stores the returned URL as the `src` attribute of the image block. Bookmark cards use `GET /api/embed` for server-side metadata fetching (avoids CORS). Table controls extend TipTap's built-in Table extension with a custom NodeView header. Column layout uses two custom TipTap nodes with an appendTransaction for auto-normalization. All new block types are registered in the BlockEditor's extension list, and slash commands provide discoverable insertion paths.

## How to modify this later

- **Image blocks**: To add resize handles or alignment controls as a React NodeView, convert `ImageNode.ts` to use `ReactNodeViewRenderer` (like BookmarkNode does).
- **Bookmark cards**: Caching for embed metadata can be added by connecting to a new DB table or Redis; the `# ponytail:` comment in the plan notes this.
- **Table controls**: If the NodeView on `table` breaks the column-resize plugin, fall back to the bubble-menu variant exported as `createTableBubbleMenuItems` in `TableNodeView.tsx`.
- **Multi-column**: Column width dragging and columns inside callouts/toggles are explicit out-of-scope items from the plan.
- **Edge-drop for columns**: The plan describes creating column layouts by dragging a block to the left/right edge of another. This is not yet implemented — the `handleDrop` in `BlockEditor.tsx` currently only handles image drops.
- **Backend file tests**: Not yet written (see note in plan: test approach depends on CI capabilities with MinIO). The `# ponytail:` orphan-sweep upgrade path is noted in the plan.
