# 0047 — Remove duplicate " 2" files

Date: 2026-07-04
Status: accepted

## What changed
Deleted 13 stray duplicate files that had a trailing `" 2"` in their filename (e.g.
`Card 2.tsx`, `test_notes 2.py`) — the classic macOS "keep both copies" naming pattern
left behind by an editor/Finder sync conflict. All were introduced in commit `4a64540`
("Fixing UI in notes for phone view, not complete").

Removed:
- `apps/web/src/components/Card 2.tsx`
- `apps/web/src/components/ConfirmDialog 2.tsx`
- `apps/web/src/components/Dropdown 2.tsx`
- `apps/web/src/components/EmojiPicker 2.tsx`
- `apps/web/src/components/Field 2.tsx`
- `apps/web/src/components/FolderPicker 2.tsx`
- `apps/web/src/components/IconButton 2.tsx`
- `apps/web/src/components/Popover 2.tsx`
- `apps/web/src/components/SettingsCard 2.tsx`
- `apps/web/src/components/SidebarShell 2.tsx`
- `apps/web/src/modules/notes/PageView 2.tsx`
- `apps/api/tests/test_databases 2.py`
- `apps/api/tests/test_notes 2.py`

## Why
User reported "duplicated components" in the project. A filename with a space isn't a
valid ES module specifier, so none of the frontend `" 2.tsx"` files were ever imported —
they were dead weight sitting next to the real, in-use components. Where content
differed from the original (`EmojiPicker 2.tsx`, `PageView 2.tsx`), the non-suffixed
original was newer and more complete (mobile pointerdown-dismiss fix, favorite covers,
list style props), so no merge was needed. The two backend test files were exact
duplicates that pytest was silently collecting and running twice (52 passed → 39 passed
after removal, same coverage).

## Files touched
- 13 files deleted, listed above — no other files were modified.

## How the pieces connect
No production code referenced these files; this is a pure cleanup with no behavioral
change. `npm run check` (ruff, mypy, pytest) passes identically before and after, minus
the duplicated test collection.

## How to modify this later
If this pattern recurs, check whether it's coming from an editor/sync tool creating
"keep both copies" files on save conflicts (common with iCloud Drive / Dropbox on macOS
when a file is edited from two locations at once). Add `*" 2".*` or similar to
`.gitignore` if it keeps happening, or check editor/sync settings for the working
directory.
