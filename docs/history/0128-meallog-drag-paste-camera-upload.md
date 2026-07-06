# 0128 — Meal log: drag-and-drop, clipboard paste, explicit camera/upload choice

Date: 2026-07-06
Status: accepted

## What changed

The "Log meal" modal's empty-state capture area now supports three additional ways to attach a
photo, on top of the existing single ambiguous click target:

1. **Drag and drop** — dragging an image file onto the capture area drops it in directly (visual
   dashed-border highlight while dragging over).
2. **Paste from clipboard** — pasting (Ctrl/Cmd+V) while the modal is open and no photo has been
   attached yet picks up an image from the OS clipboard automatically.
3. **Explicit camera vs. upload choice** — the single ambiguous click target (one hidden
   `<input capture="environment">`) is replaced with two clearly labeled buttons, "Take photo"
   (opens the device camera) and "Upload photo" (opens the file/photo library picker), each
   backed by its own hidden file input.

## Why

User request: the capture area should accept a dragged image or a pasted clipboard image, and
clicking should clearly offer a choice between opening the camera or picking an existing photo,
rather than one ambiguous click zone.

## Files touched

- `apps/web/src/modules/food/MealLogModal.tsx` — split `fileInputRef` into `cameraInputRef`
  (`capture="environment"`) and `libraryInputRef` (plain file input); extracted the upload/analyze
  body of `handleFileSelected` into a shared `handleFile(file: File)` so it can be called from a
  file input's `onChange`, a `drop` handler, and a `paste` listener; added `isDragging` state plus
  `handleDragOver`/`handleDragLeave`/`handleDrop` on the capture area; added a `paste`
  window-level listener (active only while `open && state === 'empty'`) that extracts an image
  `File` from `ClipboardEvent.clipboardData.items`; replaced the single clickable capture-area
  div with two `food-secondary-button`s ("Take photo" / "Upload photo").
- `apps/web/src/modules/food/food.css` — replaced the capture area's `cursor: pointer` and
  `:hover` rule (it's no longer directly clickable) with a `.dragging` state style reusing the
  existing `--food-accent-border`/`--food-accent-tint` tokens; added
  `.food-meallog-capture-choices` (flex row, 8px gap) for the two new buttons.

## How the pieces connect

`handleFile` is the single upload/analyze pipeline (upload to MinIO via `uploadFile`, create a
`MealLog` if none exists yet, call `analyzeMealLog`, populate fields from the AI result) — every
input path (file picker change event, drag-drop, clipboard paste) now funnels through it instead
of duplicating the logic. The two file inputs stay hidden and are only triggered by their
matching button's `onClick`, so the browser's native camera-vs-library behavior is preserved
without any custom picker UI.

## How to modify this later

- To support multiple pasted/dropped files (currently only the first file is used), change
  `e.dataTransfer.files?.[0]` / the clipboard-items `.find()` to loop and call `handleFile` per
  file — note `handleFile` currently assumes a single photo per meal log, so multi-photo support
  would need backend changes too.
- The `paste` listener is attached to `window`, so pasting works regardless of which element has
  focus inside the modal — if this ever causes conflicts with paste handling elsewhere (e.g. the
  calendar's own paste-events shortcut), scope it down to a `ref` on the modal container instead.
