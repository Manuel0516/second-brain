# 0217 — Photo-attach UI: SVG icon + style guide alignment

Date: 2026-08-15
Status: accepted

## What changed

Follow-up polish on the photo-attach feature shipped in `0216`, per
`docs/design/STYLE_GUIDE.md`:

- Replaced the 📷 emoji attach-button glyph with a `CameraIcon` inline SVG matching this
  module's existing icon house style (`SparkleIcon`'s construction: `viewBox="0 0 20 20"`,
  one path + one circle) and added it to the shared icon-sizing rule (20×20, `stroke:
  currentColor`, `stroke-width: 1.7`, round caps/joins) already shared by the launcher,
  chat-header, and empty-state icons — so it renders identically across light/dark/neon/
  monochrome instead of carrying a fixed-color pictograph.
- Fixed a CSS specificity bug: the photo-remove button's selector had been narrowed to a
  single class (`.assistant-composer-photo-remove`), which is *less* specific than the
  generic `.assistant-composer button` rule (44×44px, accent-tinted) and would have been
  silently overridden by it. Re-scoped to `.assistant-composer-photo
  .assistant-composer-photo-remove` (matches the icon-button pattern: 28×28px, transparent,
  `var(--r-sm)`, hover swaps to `var(--bg-raised)`/`var(--text-primary)` per §7's Icon
  Button pattern — previously had no hover feedback at all).
- Attached-photo filename label switched from an untyped `12px` sans span (selected via a
  fragile `:nth-of-type` selector) to an explicit `.assistant-composer-photo-name` class at
  `11px var(--font-mono)` / `var(--text-tertiary)` — matching the metadata/small-chip
  typography convention used everywhere else in this module (`.assistant-tool-chip`,
  `.assistant-confirm-tool`, timestamps), rather than a one-off sans-serif size.
- The photo-upload error text no longer reuses `.assistant-list-error` (which carries a
  `margin: 12px 8px` meant for the conversation sidebar, wrong in the composer's `gap: 6px`
  grid rhythm). New `.assistant-composer-error` — `margin: 0`, `11px`, `var(--text-tertiary)`
  — matches the neutral (non-red) tone this panel already uses for its other inline error
  states (`.assistant-error`, `.assistant-list-error` also don't use the danger color).

## Why

User request: the emoji attach icon didn't match the app's line-icon visual language, and
asked for a pass on box/text proportions "to feel more cohesive" — both were introduced by
the previous session's photo-attach feature and hadn't been checked against the style guide.

## Files touched

- `apps/web/src/modules/assistant/AssistantPanel.tsx` — `CameraIcon`; explicit class names
  on the photo-preview filename span and remove button.
- `apps/web/src/modules/assistant/assistant.css` — icon sizing, remove-button specificity
  fix + hover state, filename/error typography.

## How the pieces connect

The icon-sizing rule at the top of `assistant.css` (`.assistant-launcher svg,
.assistant-title-icon svg, .assistant-empty-icon svg, .assistant-attach-button svg`) is the
single place every monochrome stroke icon in this panel is sized — any new icon button
should join that selector list rather than setting its own `width`/`height`/`stroke-width`.

## How to modify this later

If another icon-only button is added to `.assistant-composer`, remember the same
specificity trap: `.assistant-composer button` is `(0,1,1)`, so a bare single-class
override loses to it silently (no error, it just renders wrong). Either scope the override
under its parent class (as done here) or give it two classes.
