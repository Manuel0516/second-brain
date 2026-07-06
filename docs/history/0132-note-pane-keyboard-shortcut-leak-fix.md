# 0132 — Fix: editing a note in the calendar side pane hijacked calendar keyboard shortcuts

Date: 2026-07-06
Status: accepted

## What changed

Typing inside the note side-pane (the "open note" pane in Calendar, `NotesPagePane`/`PageView`'s
rich-text editor) no longer triggers the calendar's global keyboard shortcuts. Previously, if any
calendar events were selected and the user then typed in the note — e.g. pressed Backspace to
edit text — the calendar's global `Delete`/`Backspace` handler fired and deleted the selected
events; `Cmd+C`/`Cmd+V` while editing note text hijacked clipboard for calendar event copy/paste
instead of normal text editing.

## Why

User report: "opening a note on the side crashes the UX of the website." Root cause:
`TimeGrid.tsx`'s global `keydown` listener guards itself with an `isTyping(target)` check that
only excludes `<input>`, `<textarea>`, and `<select>` elements — it never excludes
`contentEditable` elements. The note pane's rich-text editor (TipTap `BlockEditor`) is a
`contentEditable` div, so it was never recognized as "typing," and every keystroke reached the
calendar's shortcut handler.

## Files touched

- `apps/web/src/modules/calendar/TimeGrid.tsx` — `isTyping()` now also returns `true` for any
  `HTMLElement` with `isContentEditable`, covering the note editor (and any other contenteditable
  surface) in addition to the existing input/textarea/select checks.

## How the pieces connect

`TimeGrid.tsx` binds one `window`-level `keydown` listener (mounted alongside the calendar grid)
that handles `Escape` (clear selection), `Delete`/`Backspace` (delete selected events), and
`Cmd/Ctrl+C`/`Cmd/Ctrl+V` (copy/paste events) — all guarded by a single `isTyping()` check at the
top so the shortcuts stay out of the way of actual text input anywhere on the page, including the
note pane that renders alongside the calendar grid (`Calendar.tsx`'s `<aside className="calendar-note-pane">`).
Since `isTyping` is the single choke point all these shortcuts route through, fixing it there
covers every current and future shortcut in this handler, not just the reported symptom.

## How to modify this later

If a new global calendar shortcut is added to this same `keydown` handler, no extra guarding is
needed — it will automatically respect `isTyping()`. If a new contenteditable surface is added
elsewhere in the app, no changes are needed here either, since `isContentEditable` is a native DOM
property checked generically, not by class or component name.
