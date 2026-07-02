# 0020 — Page covers and templates

Date: 2026-07-02
Status: accepted

## What changed

Phase 4 of the Notes module remake.

- **Covers**: new `CoverPicker.tsx` — six preset gradients derived purely from
  existing tokens via `color-mix` (stored as `gradient:N` in `pages.cover`)
  plus a pasted image URL. `PageView` renders the cover banner above the page
  head with a hover "Change cover" button; pages without a cover get a
  hover-revealed "+ Cover" button beside the save pill (always visible on
  touch). Upload-to-MinIO deliberately deferred — needs the `minio` dependency
  approval; presets + URL cover the need for now.
- **Templates**: templates (`is_template = true`) are excluded from the page
  tree and listed in a Templates section above the sidebar's Trash link, with
  "use" (⧉ → `POST /pages/{id}/duplicate`, navigates to the copy) and "remove
  template" actions. The row ⋯ menu gained a "Template" action to mark a page.
  The duplicate endpoint already clears `is_template` on the copy (0011).

## Why

Approved remake plan Phase 4; spec §8.3 (templates from day one) and the
`cover_image_id` concept from §2, shipped without any file-storage dependency.

## Files touched

- `apps/web/src/modules/notes/CoverPicker.tsx` — new picker + `coverClass` helper.
- `apps/web/src/modules/notes/PageView.tsx` — cover banner, add/change wiring, `cover` in the patch type.
- `apps/web/src/modules/notes/Sidebar.tsx` — templates section in the `SidebarShell` footer, tree exclusion, menu action, `onSetTemplate`/`onUseTemplate` props.
- `apps/web/src/modules/notes/Notes.tsx` — `applyTemplate` (duplicate → refetch list → navigate) and patch pass-throughs.
- `apps/web/src/modules/notes/notes.css` — `.notes-cover*` (banner, gradients g1–g6, picker, swatches, add button) and `.notes-templates*`.

## How the pieces connect

A cover is just a string column: `gradient:N` maps to a `.notes-cover-gN`
class; anything else is treated as an image URL (inline `background-image` —
data, not theming). Templates reuse the whole duplicate/subtree machinery from
the backend (0011); the frontend only toggles the flag and calls duplicate.
The sidebar's template list is derived from the same `pages` array as the
tree, so marking/unmarking updates both instantly via the shared optimistic
`patchPage`.

## How to modify this later

- More gradients: add a number to `COVER_PRESETS` in `CoverPicker.tsx` and a
  `.notes-cover-gN` rule in `notes.css`.
- Uploaded covers: add `routes/files.py` + `minio` dep (needs approval), then
  store the returned URL in `pages.cover` — the frontend already handles URLs.
- Template picker on page creation (instead of the sidebar section): call
  `notesApi.duplicate(templateId)` wherever needed; nothing else required.
