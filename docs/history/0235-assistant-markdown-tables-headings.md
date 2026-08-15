# 0235 — Assistant chat markdown: tables, headings, and the rest of GFM

Date: 2026-08-15
Status: accepted

## What changed

The embedded assistant's chat renderer (`apps/web/src/modules/assistant/markdown.tsx`) was a
hand-rolled "small safe markdown subset" that only understood bold, inline code, fenced code
blocks, bullet lists, and paragraphs — so any table, heading, ordered list, blockquote,
horizontal rule, or link the model wrote came through as literal `|---|---|` / `## ` characters
in the chat bubble instead of rendering as real HTML.

Extended the same hand-rolled, no-`dangerouslySetInnerHTML` parser (kept that design rather
than adding a markdown-library dependency — nothing suitable was already installed, and the
existing approach's safety property, no raw HTML injection, is worth preserving) to also
handle:

- Headings `#`–`######` → `<h1>`–`<h6>`
- GFM pipe tables (header row + `---` separator row + body rows) → `<table>`/`<thead>`/`<tbody>`
- Ordered lists (`1.`, `2.`, ...) → `<ol start=...>`, preserving the list's starting number
- Blockquotes (`>`) → `<blockquote>`
- Horizontal rules (`---`/`***`/`___`) → `<hr>`
- Links `[text](url)` → `<a target="_blank" rel="noopener noreferrer">`, with the href
  scheme-checked (`http:`, `https:`, `mailto:`, or a relative `/path`) before rendering as a
  real link — anything else (e.g. `javascript:`) renders as plain text instead, since this is
  now the one place in the renderer capable of producing a clickable, attacker-influenced URL
- Italics (`*text*`), alongside the existing `**bold**` and `` `code` ``

Added matching CSS in `assistant.css` for the new elements (headings, table, blockquote, hr,
link) using only existing design tokens, and made tables horizontally scrollable
(`overflow-x: auto`) inside the chat bubble instead of overflowing it.

## Why

User request: assistant chat markdown ("boxes") wasn't showing tables, titles, or other
markdown structure — it needed to render as proper formatted markdown, not raw text.

## Files touched

- `apps/web/src/modules/assistant/markdown.tsx` — added heading, table, ordered-list,
  blockquote, and horizontal-rule block parsing; extended inline parsing with italics and
  scheme-checked links; refactored the repeated "join lines with `<br/>`" logic (paragraphs,
  blockquotes) into a shared `renderLines` helper.
- `apps/web/src/modules/assistant/assistant.css` — added `.assistant-message` rules for
  `h1`–`h6`, `ol`, `blockquote`, `hr`, `a`, and `table.assistant-md-table` (+ `th`/`td`),
  all using existing tokens (`--text-primary`, `--text-tertiary`, `--border`, `--border-strong`,
  `--bg-base`, `--accent`) — no new colors, radii, or spacing values.
- `apps/web/src/modules/assistant/markdown.test.tsx` — new test file; asserts real rendered
  DOM (heading role, table rows/columnheaders, ordered-list start number, safe link kept vs.
  unsafe link dropped to plain text, and that bold/code/bullet-list behavior is unchanged).

## How the pieces connect

`AssistantPanel.tsx` calls `renderMarkdown(message.content)` for every assistant message; this
change only touches what that function returns; no caller-side change was needed. The block
loop in `renderMarkdown` checks fence → rule → heading → table → blockquote → ordered-list →
unordered-list → blank → paragraph, in that order, so e.g. a paragraph's line-collection loop
now also stops when it sees a line matching any of the new block patterns (previously it only
excluded fences and bullet lists).

## How to modify this later

- Table cells don't support column alignment (`:---`, `---:`, `:---:`) — the separator row's
  colons are matched but ignored. Add alignment by reading them in the `TABLE_SEPARATOR` match
  and setting `style={{ textAlign }}` per `<th>`/`<td>` if a response ever needs it.
- No visual browser verification was done for this change — no headless-browser tooling
  (Playwright/chromium-cli) is available in this sandbox. Verification is unit tests against
  real rendered DOM roles (`@testing-library/react`) plus `npm run check`. If a rendering
  regression is suspected, load the assistant chat in a real browser and paste a message
  containing a table/heading/list to confirm visually.
