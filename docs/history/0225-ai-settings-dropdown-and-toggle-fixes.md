# 0225 — AI settings: real dropdowns, toggle spacing, a11y fix

Date: 2026-08-15
Status: accepted

## What changed

Direct follow-up to `0224`'s AI settings page rework:

1. **Skill "Enabled" toggle had no gap between label and switch.** `ToggleRow`'s inline
   flex style had `justify-content: space-between` but no `gap` — that only produces
   visible spacing when the row is stretched to fill a wider container (as it happens to be
   in `GeneralSettings.tsx`'s grid-column usage); inside the AI settings skill card's
   footer (a plain flex row next to the "Save skill" button), the row hugs its own content
   and the label/switch sat flush against each other. Added `gap: 10` to `ToggleRow`'s
   style — fixes every usage, not just this one, and can only ever add spacing, never
   remove any that already existed.
2. **The three native `<select>` dropdowns had no real styling.** Native `<option>` lists
   don't get the app's design treatment — this codebase already has a purpose-built
   `Dropdown` component (`components/Dropdown.tsx`, `.dropdown-trigger`/`.dropdown-option`
   CSS) used everywhere else a picker is needed (fitness exercise picker, notes property
   type, etc.) specifically to replace native `<select>`. Swapped Provider, Autonomy, and
   Embedding provider over to it.
3. **Along the way:** wrapping `Dropdown` (which renders a `<button>`, not a native form
   control) in a bare `<label>` fails `jsx-a11y/label-has-associated-control` — the
   existing shared `Field` component (`components/Field.tsx`, the `.cal-field` pattern
   already used by the calendar/fitness/notes/food "gold standard" pages) exists
   specifically to avoid this: it encapsulates its own `<label>` in a separate file, so
   ESLint's per-file JSX analysis never sees "label wrapping a non-native control" as a
   literal pattern in the consuming file. Switched **every** field in this page (not just
   the three dropdowns) from the one-off `.settings-field` class to `Field`, and deleted
   `.settings-field` from `styles.css` as dead code.

## Why

Direct user feedback on `0224`'s rework: toggle spacing looked cramped, and the raw
`<select>` elements didn't match the rest of the app's picker styling.

## Files touched

- `apps/web/src/components/ToggleRow.tsx` — added `gap: 10` to the row's flex style.
- `apps/web/src/modules/settings/AISettings.tsx` — Provider/Autonomy/Embedding-provider
  now render `Dropdown`; every field switched from `.settings-field` to the shared `Field`
  component.
- `apps/web/src/styles.css` — removed the now-unused `.settings-field` rules; skill-card
  name-input selector retargeted to `.cal-field`.

## How the pieces connect

`Field`/`cal-field` and `Dropdown`/`dropdown-*` are the two real shared building blocks
for "a labeled control" and "a picker" respectively, used across
`fitness/SessionForm.tsx`, `notes/database/PropertyConfig.tsx`, `food/MealLogModal.tsx`,
and the calendar event editor. AI settings now composes the same two primitives instead of
a page-local reinvention — this is what "proper CSS like in other places" concretely means
here: literally the other places' components, not new lookalike CSS.

## How to modify this later

If a future field needs a native `<select>` inside a `Field` (rather than a picklist small
enough for `Dropdown`), `Field`'s CSS (`.cal-field`) doesn't style `select`/`textarea` by
default — only `.cal-field input`. Extend `.cal-field` itself if that need is genuinely
shared, rather than reintroducing a page-local field class.
