# 0037 — Notes settings page: list marker schemes (N6)

Date: 2026-07-03
Status: accepted

## What changed

The `/settings/notes` nav item went from a disabled "Soon" stub to a working
settings page — sub-phase N6 of `NOTES_MODULE_PLAN.md` §5.5, the plan's last
open item.

- **Settings**: `notes_bullet_style` (disc / circle / square / dash, default
  disc) and `notes_numbered_style` (decimal / lower-alpha / upper-alpha /
  lower-roman / upper-roman, default decimal), persisted on `user_settings`
  (migration 013) through the existing GET/PATCH `/api/settings`, validated
  with the house `Literal` pattern (unknown values → 422).
- **Page**: `NotesSettings.tsx` — one "Lists" `SettingsCard`; bullet style as
  a `Segmented` control, numbered style as a `Dropdown` (five long labels),
  each with a live 3-item preview list beside it styled by the same CSS that
  styles the editor, so the marker is visible before choosing.
- **Application**: pure presentation. `PageView` passes the two settings into
  `BlockEditor`, which sets `data-bullet-style` / `data-numbered-style` on
  the `.notes-editor` root. `listMarkers.css` (new, imported by both
  BlockEditor and NotesSettings) maps the attributes to `list-style-type` at
  every nesting depth — document JSON is never touched, task lists are
  excluded, and the dash scheme uses the string `list-style-type: '–  '`
  syntax. Unknown/legacy values match no override and fall back to
  disc/decimal.

## Why

N6 was the only unshipped sub-phase of the notes plan; the user asked for the
notes settings page built from the plan spec.

## Files touched

- `apps/api/alembic/versions/013_notes_list_styles.py` — two columns with
  server defaults
- `apps/api/app/models.py` — `UserSettings.notes_bullet_style` /
  `notes_numbered_style`
- `apps/api/app/routes/settings.py` — `BulletStyle`/`NumberedStyle` Literals
  in `SettingsResponse`, `SettingsPatch`, `_settings_to_response`
- `apps/api/tests/test_settings.py` — new: defaults, PATCH round-trip,
  422 on unknown values
- `apps/web/src/context/SettingsContext.tsx` — typed keys + defaults
- `apps/web/src/modules/settings/NotesSettings.tsx` — the page (new)
- `apps/web/src/modules/settings/SettingsLayout.tsx` — Notes nav enabled
- `apps/web/src/App.tsx` — `/settings/notes` route
- `apps/web/src/modules/notes/listMarkers.css` — attribute → marker rules (new)
- `apps/web/src/modules/notes/editor/BlockEditor.tsx` — `bulletStyle`/
  `numberedStyle` props → data attributes on the editor root
- `apps/web/src/modules/notes/PageView.tsx` — passes settings to BlockEditor

## How the pieces connect

`SettingsContext.patch` is optimistic React state, so choosing a style
re-renders every `useSettings` consumer immediately — `PageView` (both the
standalone notes page and the calendar split-view pane render through it)
pushes the new value into `BlockEditor`'s root data attribute and open
editors restyle live. BlockEditor takes the values as props rather than
reading the context itself because its tests mount it without a provider.
The settings previews carry the same data attributes, which is why
`listMarkers.css` is imported from both places and keyed on bare attribute
selectors instead of `.notes-editor`.

## How to modify this later

- **New marker scheme**: add the value to the `Literal`s in `settings.py`,
  the unions in `SettingsContext.tsx`, the options in `NotesSettings.tsx`,
  and one rule in `listMarkers.css`. No migration needed (String(16)).
- **Per-list overrides** (explicitly out of scope per spec): would need a
  node attribute on bulletList/orderedList instead — don't extend the global
  attribute for that.
- **More notes settings**: add cards to `NotesSettings.tsx`; the page is a
  plain `SettingsCard` list like GeneralSettings.
