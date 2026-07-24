# 0165 — Segmented keyboard behavior, settings number fields, and feedback semantics

Date: 2026-07-24
Status: accepted

## What changed

**`Segmented`** (`apps/web/src/components/Segmented.tsx`) now follows radio-group keyboard
conventions: only the checked option has `tabIndex=0` (others `-1`), Left/Up moves to the
previous option and Right/Down to the next with wrap-around at both ends, Home/End jump to the
first/last option, and keyboard selection calls `onChange` once and focuses the newly-selected
button. Click behavior and the sliding indicator are unchanged. Every existing consumer (Food/
Fitness settings, Calendar/Notes/Integration settings, EventEditor, SessionWizard, LiveSession)
gets this for free with no call-site changes.

**`SettingsNumberField`** (new, `apps/web/src/modules/settings/SettingsNumberField.tsx`) replaces
every bare `<input type="number">` in Food and Fitness settings:
- Keeps a local string draft; typing never PATCHes.
- Commits once on blur or Enter; Escape reverts the draft to the last committed value without
  committing.
- `nullable` fields map an empty committed draft to `null`; non-nullable fields reject an
  empty or out-of-range draft, call `input.reportValidity()` to surface the browser's native
  validation message, and restore the previous value.
- Resyncs its draft when the `value` prop changes externally, except while the input has focus.
- Renders a non-editable unit suffix (`kcal`, `g`, `units`, `seconds`, `sessions`) and removes
  native number-input spinner chrome.

Food's **Targets** card is regrouped without a new card pattern: meals/day + calories in the
first row, then **Macros** (protein/carbs/fat) and **Daily units** (water/vegetables/fruit) as
labelled subgroups in a responsive grid (`repeat(auto-fit, minmax(110px, 1fr))`, collapsing to
one column at `≤640px`). Fitness's rest duration and weekly target use the same component.
Stats-range `Segmented` controls are untouched.

**Feedback semantics**: `GeneralSettings.tsx` profile/password success messages now use
`role="status"`; profile/password/admin errors (`GeneralSettings.tsx`, `AdminSettings.tsx`) use
`role="alert"`. No visual change — color remains supplementary, text unchanged.

## Why

UX-007, UX-008, and UX-011 in `docs/work/UX-AUDIT.md`: `Segmented` had no radio-group keyboard
behavior; Settings number fields PATCHed on every keystroke (typing `2000` sent `2`, `20`,
`200`, `2000`, and clearing a required field could send an invalid intermediate value that
triggered a settings rollback mid-edit) while keeping native spinner chrome the rest of the app
already removes; and several save/error messages had no `role` for assistive tech. See
`docs/work/PLAN-shared-controls-and-settings-feedback.md`.

## Files touched

- `apps/web/src/components/Segmented.tsx` — roving tabIndex, arrow/Home/End handling.
- `apps/web/src/components/Segmented.test.tsx` — new: tab stop, wrap, Home/End, one `onChange`
  per keyboard selection, click still works.
- `apps/web/src/modules/settings/SettingsNumberField.tsx` — new shared component.
- `apps/web/src/modules/settings/SettingsNumberField.test.tsx` — new: draft/commit/Enter/
  Escape/nullable/required-invalid/decimal-step/external-resync/suffix coverage.
- `apps/web/src/modules/settings/FoodSettings.tsx`, `FitnessSettings.tsx` — every number field
  now uses `SettingsNumberField`; Food's Targets card regrouped.
- `apps/web/src/modules/settings/FoodSettings.test.tsx`, `FitnessSettings.test.tsx` — new:
  grouping, one-patch-per-commit, nullable-clears-to-null, Segmented unit choice unaffected.
- `apps/web/src/modules/settings/GeneralSettings.tsx`, `AdminSettings.tsx` — `role="status"`/
  `role="alert"` on save/error feedback.
- `apps/web/src/modules/settings/GeneralSettings.test.tsx`, `AdminSettings.test.tsx` — new:
  status/alert role coverage for profile, password, and admin user-management feedback.
- `apps/web/src/styles.css` — `.settings-number-input`/`.settings-number-suffix` (spinner
  removal, suffix layout), `.settings-subgroup-label`, `.settings-number-grid` responsive rules.

## How the pieces connect

`SettingsNumberField` never talks to the network itself — callers pass `onCommit`, which Food/
Fitness settings wire straight to the existing `patch()` from `SettingsContext`. A `committedRef`
(not the `value` prop) is what "one commit per edit" is compared against, since the prop only
updates once the async `patch()` round-trip resolves; comparing against the prop instead would
let an Enter-then-blur combo double-PATCH before the response lands. The suffix span sits
inside the `<label>`, so its text becomes part of the input's accessible name (e.g. "Protein
g") — that's intended (it gives screen-reader users the unit), so tests query labels with a
`/^Label/` prefix regex rather than an exact string.

## How to modify this later

Add a new Food/Fitness number setting by rendering `SettingsNumberField` with `id`, `label`,
`value`, `onCommit`, and the relevant `min`/`max`/`step`/`suffix`/`nullable` — don't reach for a
bare `<input type="number">` again, that's exactly the pattern this plan removed. To add another
Segmented keyboard shortcut, edit the single `handleKeyDown` switch in `Segmented.tsx`; all
consumers inherit it automatically.
