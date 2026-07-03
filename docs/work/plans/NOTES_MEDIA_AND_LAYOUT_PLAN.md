# Plan E — Notes media, embeds, tables, and multi-column layout

> ## STATUS (2026-07-03) — COMPLETE (history 0030–0033)
>
> All five phases shipped, then reworked/polished the same day. Deltas from
> this plan as written:
> - Columns are created by **dragging a block to another block's edge**
>   (plus slash commands); dissolution lifts content (0031).
> - Tables: **no NodeView** — a floating toolbar overlay instead, which
>   keeps native column resizing working; tables center and auto-size
>   (0031, 0033). Row-height dragging remains unsupported.
> - Images got a NodeView with width grip + align controls and are never
>   upscaled past natural size (0031, 0033).
> - Extra beyond plan: block text alignment in the selection toolbar (0033).
> - Ops traps hit and fixed in 0032: migration must be applied, MinIO
>   endpoint format, credential env names (compose now passes them).

> Audience: implementing AI or developer. Read order: this plan →
> `docs/design/STYLE_GUIDE.md` → nearest `AGENTS.md`. Run `npm run check`
> (web) and `npm run check:api` before any task is "done". Reuse the tokens
> and components already in `apps/web/src/styles.css` and
> `src/components/` (Popover, Dropdown, IconButton) — no new visual language.

Requested 2026-07-03 (user): image blocks, Notion-style link embed cards,
table row/column controls, multi-column page layout. "Drag fully left → root"
in the sidebar shipped already as part of the gap-based drag depth
(history 0025) — dragging left in any gap where root is a valid depth
out-dents to root; nothing further planned here.

---

## 1. Outcome

- **Images inside notes**: paste, drag-in, or pick a file → stored on the
  VPS (MinIO) → rendered as a block with alignment/width controls.
- **Link embed cards**: pasting a URL on an empty paragraph (or `/bookmark`)
  creates a bookmark card with title/description/favicon fetched from the
  target page, Notion-style. Plain inline links stay untouched.
- **Tables**: hover controls to add/remove rows and columns, plus a header
  toggle — no more raw 3×3-only tables.
- **Columns**: blocks can sit side by side in 2–3 column groups, created by
  dragging a block to the left/right edge of another and removable by
  dragging out. The biggest piece; ships last, behind everything else.

Suggested order: 2 (backend files) → 1 (images) → 3 (bookmark cards)
→ 4 (tables) → 5 (columns). Each phase independently shippable.

---

## 2. Backend: file upload service (prerequisite for images)

**⚠ New dependency (needs explicit approval before Phase 2 starts):**
`minio` (Python client, ~small). MinIO itself is already provisioned in
`compose.yaml`; the API has no S3 client today.

- New table `files` (migration 012): `id UUID pk, user_id FK, name,
  content_type String(100), size Integer, created_at`. Object key =
  `{user_id}/{id}` in one bucket (created lazily at startup or first upload).
- New router `apps/api/app/routes/files.py`:
  - `POST /api/files` — multipart upload; validate content type
    (`image/png|jpeg|gif|webp|svg+xml`) and size cap (~10 MB); store to
    MinIO; return `{ id, url: "/api/files/{id}", name, content_type }`.
  - `GET /api/files/{id}` — ownership-checked stream from MinIO with the
    stored content type and long cache headers.
  - `DELETE /api/files/{id}` — remove object + row (used by future cleanup;
    no UI required this phase — deleting the block orphans the file,
    acceptable; note a `# ponytail:` orphan-sweep upgrade path).
- Config: reuse the compose env names for MinIO endpoint/credentials in
  `app/config.py` (check `compose.yaml` for the exact vars).
- Tests: upload→fetch round-trip (mock or MinIO test double — check what CI
  can run; a `fakeredis`-style stub is NOT available for MinIO, so either
  monkeypatch the client or gate the test on the service being reachable),
  ownership 404, content-type rejection, size rejection.
- Bonus once this exists: cover image uploads (deferred item from 0020)
  become trivial — the CoverPicker URL field already accepts any URL.

## 3. Image blocks (frontend)

- New `editor/ImageNode.ts` — TipTap image node (extend the official
  `@tiptap/extension-image`? It is NOT installed; a hand-rolled block node is
  ~60 lines and avoids a dependency — attrs `{ src, alt, width (percent),
  align ('left'|'center'|'right') }`, `renderHTML` as `<figure data-type="image">
  <img …></figure>`). Recommend hand-rolled; flag `@tiptap/extension-image`
  as the alternative if resize interop gets hairy.
- Insert paths, all ending in `POST /api/files` then
  `insertContent({ type: 'image', attrs: { src: url } })`:
  - Slash command `Image` → hidden `<input type="file" accept="image/*">`.
  - **Paste**: `editorProps.handlePaste` — if clipboard has an image file,
    upload it (show a placeholder paragraph "Uploading…" or just block until
    done — keep simple, uploads are local-network fast).
  - **Drop**: `editorProps.handleDrop` for image files.
- NodeView (React) with a width drag-handle on the right edge (pointer events
  on a `contentEditable={false}` grip; width stored as percentage) and an
  align control (three IconButtons revealed on hover, or reuse the swatch-row
  pattern). Keep controls minimal: width + align only.
- CSS: `figure[data-type='image']` with `--r-md` radius, alignment via
  margin auto rules, max-width 100%.
- `_mention_targets`/`_plain_text` walkers ignore unknown nodes (covered by
  the existing additive-node pytest) — no backend change.

## 4. Link embed (bookmark) cards

- **Metadata fetch must be server-side** (CORS blocks client fetches of
  arbitrary pages). New endpoint in `files.py` or a small `embeds.py`:
  `GET /api/embed?url=` — fetches the page (timeout ~5s, size cap ~512 KB,
  http/https only, **reject private/loopback addresses — SSRF guard**),
  parses `<title>`, `og:title/description/image`, favicon (best-effort regex
  or a tiny HTML parse via stdlib `html.parser` — NO new dependency), returns
  `{ title, description, image, favicon, url }`. `# ponytail:` no caching;
  cache table if embeds get slow.
- New `editor/BookmarkNode.tsx` — block node, attrs
  `{ url, title, description, image, favicon }`, no inner content
  (`atom: true`), rendered as a card NodeView: favicon + title + description
  left, thumbnail right, whole card opens the URL in a new tab; small ⋯ →
  "Remove" (or rely on Delete block).
- Insert paths:
  - Slash command `Bookmark` → `window.prompt` URL (consistent with the
    Link command) → fetch `/api/embed` → insert with whatever metadata came
    back (fallback: url as title).
  - **Paste a bare URL on an empty paragraph** → replace the paragraph with a
    bookmark card (handlePaste: single text/plain URL + empty parent). Paste
    into non-empty text keeps today's inline-link behavior.
- CSS: `.notes-bookmark` card on tokens (border, `--bg-elevated`, hover lift
  like `.notes-board-card`).

## 5. Table row/column controls

TipTap's Table extension already ships the commands — this is purely UI:
`addRowAfter/addRowBefore/deleteRow/addColumnAfter/addColumnBefore/
deleteColumn/toggleHeaderRow/deleteTable`.

- Recommended shape (smallest that feels Notion-like):
  - A **table bubble menu**: extend the existing BubbleMenu logic — when the
    selection is inside a table, show a second row (or swap the toolbar) with
    row/col add/delete + header toggle + delete table icons. TipTap v3
    BubbleMenu supports `shouldShow`; alternatively render a small fixed
    toolbar above the table via a NodeView header (like the code block's
    language header). **Recommend the NodeView-header approach** — it reuses
    the `CodeBlockView` pattern exactly (wrap Table in a NodeView with a
    hover-revealed header of IconButtons) and avoids BubbleMenu mode
    switching. Verify a NodeView on `table` doesn't break the column-resize
    plugin (`resizable: true`) — if it does, fall back to the bubble-menu
    variant (note both in the implementation).
  - Plus **edge "+" affordances**: a thin hover strip on the right/bottom of
    the table that adds a column/row (one absolutely positioned button each,
    CSS-revealed on hover) — this is the interaction people actually use.
- Keyboard: Tab in last cell already adds a row (TipTap default — verify).

## 6. Multi-column layout (the big one)

- **Schema**: two new nodes, hand-rolled (~80 lines total, official
  extension for columns does not exist for v3):
  - `columnList` — `group: 'block'`, `content: 'column{2,3}'`.
  - `column` — `content: 'block+'`, NOT part of the `block` group (columns
    can't nest columns — YAGNI, matches Notion's flat columns).
  - CSS: `[data-type='columnList'] { display: flex; gap: 16px; }`,
    `[data-type='column'] { flex: 1; min-width: 0; }`. Column widths equal
    this phase (`# ponytail:` width attr + divider drag later).
- **Creation via drag**: extend the block DragHandle drop behavior — when a
  block is dropped on the **left/right edge** of a top-level block
  (ProseMirror `handleDrop` with the drop position's horizontal coordinate
  vs the target block's rect), wrap target + dragged into
  `columnList(column(target), column(dragged))`; dropping on an edge of an
  existing columnList adds a third column (cap at 3). This is a custom
  `handleDrop` in editorProps that intercepts BEFORE the default dropcursor
  insert when within an edge zone (~48px); otherwise default behavior.
- **Dissolution**: when a column becomes empty (blocks dragged/deleted out),
  an `appendTransaction` unwraps: columnList with one column → lift its
  blocks to top level. Same plugin normalizes malformed states.
- **Slash command** `2 columns` / `3 columns` as the discoverable path:
  wraps the current block into a columnList with empty sibling column(s).
- **Fallbacks/mobile**: CSS stacks columns vertically under 640px
  (`flex-direction: column`).
- **Risks (called out honestly)**:
  - Drag-handle interop: the nested-drag scoring may treat `column` as a
    container; add `column`/`columnList` handling to the DragHandle `nested`
    config or exclude them.
  - The gap-based dropcursor shows a horizontal line; the edge-zone drop
    needs its own visual (a vertical accent bar on the target edge —
    decoration or a tracked hover class).
  - `duplicateBlock`/`deleteBlock`/block-color act on `$from.node(1)` (top
    level) — inside a column the "block" is deeper; generalize those helpers
    to the nearest child-of-column-or-doc depth.
  - Backlinks/mention walkers: additive nodes, safe (existing pytest).
  - This phase alone is roughly the size of the whole previous batch —
    schedule it as its own session.

---

## 7. Verification

Per phase: `npm run check` / `npm run check:api`; headless-browser smoke via
the scratchpad playwright script pattern (login → create page → exercise the
feature → assert DOM + zero pageerrors) — jsdom does NOT catch stale-vite or
selection-dependent bugs (see FIXES.md 2026-07-03). **Restart the dev server
after installing any new dependency** (Vite optimize-deps cache).

Manual: paste + drag an image; paste a URL on an empty line → card; add and
remove table rows/columns; build a 2-column layout by dragging, empty a
column and watch it dissolve; all in both themes and on mobile widths.

## 8. Out of scope

Image galleries/captions, video/file attachments, embed iframes (YouTube
players etc. — bookmark cards only), column width dragging, columns inside
callouts/toggles, image editing (crop/rotate).
