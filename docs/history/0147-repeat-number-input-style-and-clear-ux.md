# 0147 — Repeat number input style and clear UX

Date: 2026-07-22
Status: accepted

## What changed
The two number inputs in the event editor's Repeat popover — the "Every N" interval and
the "N times" occurrence count — were restyled and their edit behaviour fixed.

- **Style**: both inputs now match the `Dropdown` sitting next to them (38px min-height,
  `--border-strong` border, `--r-md` radius, `--bg-elevated` background, centered text,
  accent focus ring). Previously they had no border/background CSS at all and fell back to
  the native browser number-input look (native border + spinners), which clashed with the app.
- **Native spinners removed** and native appearance flattened.
- **Clear behaviour**: deleting the value no longer snaps the field back to `1`. The field is
  clearable while typing; the value is clamped to a valid range only on blur.

## Why
User feedback: the repeat number inputs' border did not match the site style, and deleting
the number forced a minimum of `1` mid-edit, producing awkward "can't clear the field"
behaviour.

## Files touched
- `apps/web/src/styles.css` — replaced the bare `.repeat-interval { flex }` / `.repeat-count { flex }`
  rules with a shared styled block (border, radius, background, focus ring, spinner removal)
  that mirrors `.dropdown-trigger`.
- `apps/web/src/modules/calendar/EventEditor.tsx` — for both the interval and count `<input>`:
  dropped the forcing `min={1}`, bound `value` to `recurrence.x || ''` (so `0` renders empty),
  relaxed `onChange` to store the raw `Number(...)`, and added an `onBlur` that clamps into
  `[1, max]`.

## How the pieces connect
The Repeat popover is rendered via `createPortal` from `EventEditor`, so it lives outside the
`.event-editor` DOM subtree and inherits none of the editor-scoped input styling — which is
why the inputs previously looked native. The new CSS is unscoped (`.repeat-interval`,
`.repeat-count`) so it applies inside the portal. The interval/count values live in the
`recurrence` state object; they are already clamped a second time in the save path
(`recurrence_interval` / `recurrence_count`) before hitting the API, so allowing a transient
empty/`0` value during editing is safe.

## How to modify this later
- Visual tweaks: edit the `.repeat-interval, .repeat-count` block in `styles.css`. Keep it in
  sync with `.dropdown-trigger` (same height/radius/focus) so the interval input and its
  frequency dropdown stay aligned.
- Range limits: the clamp bounds live in two places per field — the `onBlur` handler in
  `EventEditor.tsx` and the save path (`Math.max(1, ...)` around `recurrence_interval` /
  `recurrence_count`). Change both.
- If you ever need the field to hold a value below 1 or above the max transiently, that already
  works while typing; only `onBlur` and save enforce the range.
