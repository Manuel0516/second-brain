# Remaining — Notes Module Future Improvements

Date: 2026-07-02
Status: deferred (continue tomorrow)

---

## C1 — Delete/Trash UI Rework

**Scope:** Overhaul the delete and trash flows.

- **Enhanced delete confirm:** show page title, icon, type, child pages list, linked events count, database warning
- **Toast for restore:** simple toast component, auto-dismiss 3s, "Undo" button
- **Permanent delete in TrashView:** two-step confirm (click to mark → click to execute), red highlight
- **Backend:** `DELETE /api/pages/{id}?permanent=true` — cascade-deletes children + Link cleanup

**Files:** `Notes.tsx`, `TrashView.tsx`, `Toast.tsx` (new), `notes.py`, `notes.css`

---

## C2 — Split-View Pane Header

**Scope:** Improve the split-view note pane top area.

- Replace lone close button with a sticky header bar: title + icon on left, "Open in full page" + close on right
- Linked-event indicator chip below header (if note was opened from calendar)
- CSS matches `.cal-topbar` — compact, border-bottom, sticky

**Files:** `NotesPagePane.tsx`, `notes.css`

---

## C3 — Create Page Type Prompt

**Scope:** Show a popover when clicking "New page" to choose type.

- "New page" button opens popover with 3 options: 📄 Page, 📁 Folder, 🗄️ Database — each with description
- Applies to topbar button, sidebar `+` heading, sidebar "Sub-page" menu action, and empty-state button
- Uses the Dropdown component (already built) or a small custom popover card

**Files:** `Notes.tsx`, `Sidebar.tsx`

---

## A1 — Text Highlight Mark

**Scope:** Add text highlight to the selection toolbar.

- New Tiptap `Highlight` extension with 8-color palette (token-backed, theme-safe)
- Highlight button in `BubbleMenu` — opens a swatch popover
- No backend changes — stored in Tiptap JSON

**Files:** `HighlightExtension.ts` (new), `BlockEditor.tsx`, `notes.css`

---

## A2 — Block Background Color

**Scope:** Add per-block background color.

- Global Tiptap attribute `blockBackground` on paragraph/heading/list-item/codeBlock nodes
- Paint-bucket button in the block gutter, same 8-color palette
- CSS: `[data-block-bg]` selector with padded background

**Files:** `BlockBackgroundExtension.ts` (new), `BlockEditor.tsx`, `notes.css`

---

## A3 — Code Block Language Selector

**Scope:** Add language picker and syntax highlighting to code blocks.

- Switch from StarterKit's `codeBlock` to `@tiptap/extension-code-block-lowlight` (or custom NodeView)
- Language selector button (top-right of code block) with searchable popover (20 languages, 8 bundled)
- Lowlight/highlight.js for syntax coloring
- **New dependency needed:** `lowlight` + language packs (~15-25KB gzipped)

**Files:** `CodeBlockNodeView.tsx` (new), `BlockEditor.tsx`, `notes.css`, `package.json`

---

## Deferred / Won't Fix

- **Popover clipping rework** — the plan includes portalling popovers to `document.body` with viewport-aware positioning, but this is deferred. The Dropdown component already handles this for selects. The remaining `.calendar-menu`, `.notes-cover-picker`, and `.notes-cell-popover` clipping will be addressed in a future UI pass.
