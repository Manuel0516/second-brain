# 0110 — Fitness module typography consistency pass

Date: 2026-07-06
Status: accepted

## What changed

Normalized font-family and font-size declarations across the Fitness module to
match `docs/design/STYLE_GUIDE.md` and the rest of the app, and replaced a few
hardcoded accent colors/radii in `RestTimer.tsx` with the module's existing
CSS custom-property tokens.

Specifically:
- Replaced every hardcoded `'JetBrains Mono, monospace'` inline font-family
  (18 occurrences across `BodyMetricForm.tsx`, `ExerciseStats.tsx`,
  `Fitness.tsx`, `RestTimer.tsx`, `SessionWizard.tsx`, `WeekStrip.tsx`) with
  `var(--font-mono)`.
- Bumped mono label/metadata sizes that fell below the style guide's 10px
  floor: `WeekStrip.tsx`'s day-of-week label (9px→10px), `ExerciseStats.tsx`'s
  Personal Records column headers (9.5px→10px, ×3), and
  `.fit-history-set > label` / `.fit-history-set-note` in `fitness.css`
  (9px→10px).
- Normalized non-standard `13.5px` body text (`RestTimer.tsx`,
  `SessionWizard.tsx`, ×6 total) down to the app's standard 13px body-text
  size.
- Normalized two `SessionWizard.tsx` subtitle `<p>` elements from `12.5px` to
  `13px` — 12.5px is reserved for buttons in the style guide, not body copy.
- `RestTimer.tsx`: replaced hardcoded `#22D3EE` / `rgba(34,211,238,...)`
  literals with the module's existing `--fit-accent` / `--fit-accent-tint` /
  `--fit-accent-border` tokens, and hardcoded `12px` / `6px` border-radius
  with `var(--r-lg)` / `var(--r-md)`.

## Why

User-reported: "review all the texts in the fitness pages and pop up and
inputs to match in style size and font with the app, I have the feeling some
of them are a bit weird." An audit against the style guide's typography rules
(10–11px mono labels, 13px UI body text, 12.5–13px buttons) found the fitness
module had accumulated inline styles that duplicated the design tokens as
literal strings instead of referencing them, drifting to odd sizes (9px,
9.5px, 12.5px, 13.5px) not on the app's established scale.

## Files touched

- `apps/web/src/modules/fitness/BodyMetricForm.tsx`,
  `ExerciseStats.tsx`, `Fitness.tsx`, `SessionWizard.tsx`, `WeekStrip.tsx` —
  hardcoded font-family literal swapped for `var(--font-mono)`.
- `apps/web/src/modules/fitness/ExerciseStats.tsx` — 3 column-header labels
  9.5px→10px.
- `apps/web/src/modules/fitness/WeekStrip.tsx` — day label 9px→10px.
- `apps/web/src/modules/fitness/SessionWizard.tsx` — 5×`13.5px`→`13px`,
  2×`12.5px`→`13px` (non-button `<p>` subtitles).
- `apps/web/src/modules/fitness/RestTimer.tsx` — font-family token swap,
  `13.5px`→`13px`, hardcoded accent colors/radii replaced with
  `--fit-accent`/`--fit-accent-tint`/`--fit-accent-border`/`--r-lg`/`--r-md`.
- `apps/web/src/modules/fitness/fitness.css` — `.fit-history-set > label,
  .fit-history-set-note` 9px→10px.

## How the pieces connect

The fitness module already defines `--fit-accent`, `--fit-accent-tint`, and
`--fit-accent-border` in `fitness.css` under `.fitness-page` specifically so
components don't need to hardcode the cyan accent — `RestTimer.tsx` (and
several chart components) were written before/without reusing them. This pass
only touched `RestTimer.tsx`'s colors since it's the one component built
entirely from inline styles rather than CSS classes; the SVG chart color
literals in `ExerciseStats.tsx`/`Overview.tsx`/`WeekStrip.tsx` were left as-is
— they're chart/graphic colors, not text, and out of scope for a "make the
text match" request. No visual layout changed; every edit is a same-position
value swap (literal → token, or off-scale size → nearest standard size).

## How to modify this later

- Any new fitness inline style using a monospace font must use
  `var(--font-mono)`, not the literal family string — grep for `'JetBrains`
  to catch regressions.
- The style guide's floor for mono labels/metadata is 10px and the UI body
  text size is 13px; treat any smaller value found in this module as a bug
  unless it's a deliberately tiny badge/icon-adjacent glyph.
- The chart stroke/fill color literals (`#22D3EE` etc. in `ExerciseStats.tsx`,
  `Overview.tsx`, `WeekStrip.tsx`) were intentionally left untouched in this
  pass — if a future task wants full token compliance there too, confirm
  `var(--fit-accent)` resolves correctly as an SVG presentation-attribute
  value in the target browsers before converting.
