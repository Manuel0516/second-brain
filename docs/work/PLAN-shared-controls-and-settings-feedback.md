# Plan: Correct shared controls, number fields, and Settings feedback

Status: ready after higher-priority workflow fixes

Date: 2026-07-24

## Summary

Resolve UX-007, UX-008, and UX-011 with shared-control, number-field, and
semantic-feedback changes. Do not alter palettes, backend setting names, or visual-style
behavior.

## Segmented control

Update the existing `Segmented` component to follow radio-group keyboard behavior:

- Only the checked option has `tabIndex=0`; others use `-1`.
- ArrowLeft/ArrowUp select the previous option.
- ArrowRight/ArrowDown select the next option.
- Selection wraps at both ends.
- Home selects the first and End selects the last.
- Keyboard selection calls the existing `onChange` once and focuses the selected button.
- Click behavior and sliding indicator remain unchanged.
- Disabled behavior is not added because the public component does not currently accept a
  disabled state.

Use `Segmented` for the exclusive Fitness/Food type pills when the relevant logging plans
touch those surfaces. Do not duplicate radio-keyboard logic in module components.

## Settings number fields

Add one small internal `SettingsNumberField` component and reuse it for every number setting
in Food and Fitness:

- Keep the editable value as a string draft so blank and partially typed values remain
  stable while editing.
- Commit once on blur or Enter instead of PATCHing on every keystroke.
- Escape restores the last backend value without PATCHing.
- Nullable fields map an empty committed draft to `null`.
- Required fields do not commit an empty or out-of-range draft; restore the previous value
  and expose the browser validation message.
- Preserve each existing min/max/step contract and send a number only after parsing a valid
  draft.
- Resync the draft when an external settings response changes the authoritative value,
  except while that input has focus.

Style the component with existing field tokens:

- Remove native number spinners with scoped `appearance: textfield` and WebKit spinner
  rules.
- Keep values aligned and show a non-editable suffix where useful (`kcal`, `g`, `units`,
  `seconds`, or `sessions`).
- Use the standard 38px input height on desktop and at least 44px/16px text on mobile.
- Keep one focus ring and existing tokenized border/radius/background behavior.

Reshape the Food Targets card without inventing a new card pattern:

- First row: meals per day and calories.
- **Macros** group: protein, carbohydrates, and fat.
- **Daily units** group: water, vegetables, and fruit.
- Use a compact responsive grid on desktop and one column at 390px.
- Keep labels concise because the suffix carries the unit.

Fitness rest duration and weekly target use the same component. Stats-range segmented
controls remain unchanged.

## Settings feedback

- Profile/password success messages use `role="status"`.
- Validation/request errors use `role="alert"`.
- Admin errors use `role="alert"`.
- Keep feedback as visible text; color remains supplementary.
- Avoid mounting duplicate live messages or moving focus on routine success.

No public API, backend, schema, or settings type changes are required.

## Tests and acceptance

Add a focused shared-control test for tab stop, checked state, arrow wrapping, Home/End,
focus movement, click behavior, and one `onChange` call.

Add number-field tests for string drafts, one commit per edit, Enter, Escape, nullable blank,
required invalid values, decimal steps, external resync, and suffix labelling.

Add or extend Food/Fitness Settings tests for the responsive groups and status/alert
semantics.

Manually verify every existing `Segmented` consumer plus Food/Fitness number settings,
including keyboard editing, mobile input behavior, Light/Dark, and both visual styles.

Run root `npm run check` and add the required production history entry/changelog row.
