# 0018 — Notes link toolbar

Date: 2026-07-02
Status: accepted

## What changed

Linked words now have a visible accent underline in the Notes editor. The selection
toolbar uses explicit SVG icons with accessible labels and tooltips for bold, italic,
strikethrough, inline code, links, and inline equations. The browser link prompt was
replaced with an in-toolbar form supporting apply, remove, cancel, URL normalization,
and unsafe-protocol rejection. Editable links no longer navigate on click.

The Notes plan now records future text highlighting, block colors, code-block language
selection, and permanent deletion from Trash.

## Why

Links were visually indistinguishable from ordinary text, toolbar glyphs were ambiguous,
and `window.prompt` provided no validation or removal flow. The deferred requirements
needed a concrete place in the Notes implementation sequence.

## Files touched

- `apps/web/src/modules/notes/editor/LinkPopover.tsx` — validated link form with apply,
  remove, cancel, and keyboard escape behavior.
- `apps/web/src/modules/notes/editor/BlockEditor.tsx` — clear toolbar icons, link-form
  integration, and editable-safe Link configuration.
- `apps/web/src/modules/notes/editor/BlockEditor.test.tsx` — covers link rendering, URL
  normalization, and unsafe-protocol rejection.
- `apps/web/src/modules/notes/notes.css` — linked-text, toolbar-icon, and link-form styles.
- `docs/work/plans/NOTES_MODULE_PLAN.md` — future formatting, code-language, and permanent
  deletion phases.

## How the pieces connect

The selection toolbar reads the current Link mark and mounts `LinkPopover` without losing
the editor selection. Applying or removing extends the mark range and updates Tiptap JSON,
which uses the existing debounced Notes autosave. StarterKit's Link extension still owns
serialization and autolinking; the editor only replaces its interaction surface.

## How to modify this later

Change URL form behavior in `LinkPopover.tsx`, toolbar commands in `BlockEditor.tsx`, and
visuals in the `.notes-link-*` and editor-anchor rules in `notes.css`. Keep protocol
validation at the form boundary and keep `openOnClick: false` while the editor is editable.
