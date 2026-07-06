# 0131 — Meal log "Take photo" uses a real live camera on desktop

Date: 2026-07-06
Status: accepted

## What changed

"Take photo" in the meal-log modal now opens an actual live camera preview (via
`getUserMedia`, triggering the browser's camera permission prompt) with Capture/Cancel
buttons, instead of relying on `<input type="file" capture="environment">` — which desktop
browsers ignore, silently falling back to the plain file picker (what looked like "opens the
uploads folder"). If `getUserMedia` is unavailable or the user denies/has no camera, it still
falls back to the file-input capture behavior, so mobile devices that open a native camera app
via the file picker keep working unchanged.

## Why

User report: "the feature of opening the camera to log the food does not work, it opens the
uploads folder... I guess I need a prompt asking the browser for permission to show the
camera?" — correct diagnosis: `capture="environment"` on a file input is a mobile-only hint;
desktop Chrome/Safari don't support it and just show the file dialog.

## Files touched

- `apps/web/src/modules/food/MealLogModal.tsx` — added a `'camera'` `ModalState`; added
  `videoRef`/`streamRef`; added `handleTakePhoto` (tries `getUserMedia`, falls back to
  `cameraInputRef.current?.click()` on failure/unsupported), `stopCamera`, `handleCancelCamera`,
  `handleCapturePhoto` (draws the current video frame to a canvas, converts to a JPEG `Blob`,
  feeds it into the existing `handleFile` upload/analyze pipeline). Added two effects: one
  attaches `streamRef.current` to the `<video>` element once it mounts for the `'camera'` state,
  the other releases the camera stream whenever the modal closes or unmounts. Added the
  `state === 'camera'` render block (live `<video>` + Cancel/Capture buttons). The "Take photo"
  button now calls `handleTakePhoto` instead of directly clicking the hidden camera input.
- `apps/web/src/modules/food/food.css` — added `.food-meallog-camera-preview` (full-width video,
  capped height, rounded corners, black background while the stream loads).

## How the pieces connect

The capture flow now has two paths that both terminate in the same `handleFile(file: File)`
function (unchanged): the live-camera path builds a `File` from a canvas snapshot of the video
stream, the old paths (file picker "Upload photo", drag-and-drop, clipboard paste) hand `handleFile`
a `File` directly from the DOM/clipboard/drag event. No changes were needed to the upload/analyze
logic itself.

## How to modify this later

- To support front-camera selfie mode or camera switching, change the `facingMode` constraint in
  `handleTakePhoto`'s `getUserMedia` call, or add a device-picker `<select>` populated from
  `navigator.mediaDevices.enumerateDevices()`.
- The JPEG quality/format for the captured frame is hardcoded (`canvas.toBlob(..., 'image/jpeg')`
  with default quality) — pass a quality argument if compression needs tuning.
