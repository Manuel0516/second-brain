# 0017 — Editable styled todo blocks

Date: 2026-07-02
Status: accepted

## What changed

Todo blocks now use an explicit React node view with an editable content region and a
controlled checkbox. The checkbox uses the app's surface, border, radius, accent, focus,
and transition tokens instead of browser-dependent checkbox rendering.

## Why

The default TipTap task node relied on inherited content editing and native checkbox
presentation. Although existing task JSON could toggle in tests, newly created todo blocks
were not reliably writable in the app and their checkboxes did not match the visual system.

## Files touched

- `apps/web/src/modules/notes/editor/TaskItemNodeView.tsx` — renders the editable task
  content and accessible controlled checkbox.
- `apps/web/src/modules/notes/editor/TaskItemExtension.ts` — installs the custom node view
  while retaining TipTap's task-item schema and commands.
- `apps/web/src/modules/notes/editor/BlockEditor.tsx` — uses the editable task extension.
- `apps/web/src/modules/notes/editor/BlockEditor.test.tsx` — verifies new todo text entry,
  editable markup, and checkbox persistence.
- `apps/web/src/modules/notes/notes.css` — styles the task component with project tokens.

## How the pieces connect

The slash-menu To-do command still calls TipTap's `toggleTaskList`. That creates the same
`taskList` and `taskItem` JSON as before, but `EditableTaskItem` renders each item through
`TaskItemNodeView`. `NodeViewContent` is the text-editing surface, and checkbox changes
update the task node's existing `checked` attribute for autosave.

## How to modify this later

Change task behavior in `TaskItemNodeView.tsx` and visuals in the `.notes-task-*` rules in
`notes.css`. Keep the extension name and `checked` attribute unchanged so existing Notes
content and TipTap list commands remain compatible.
