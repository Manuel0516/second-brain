# 0043 — Favourite colours/covers settings + shared favourites editors

Date: 2026-07-04
Status: accepted

## What changed

- Added four new user settings: `favorite_text_colors`, `favorite_highlight_colors`,
  `favorite_block_colors` (hex colour arrays), and `favorite_covers` (image URL array).
- Notes settings page gained four new cards to manage these favourites, mirroring the
  existing "favourite emojis/colours" pattern from Calendar settings.
- The notes editor's text/highlight/block colour popover (toolbar pencil) now shows the
  user's favourite colours alongside the four fixed named swatches.
- The page cover picker now shows favourite covers first, above the fixed gradient presets.
- Extracted the favourites list management UI (emoji tiles, colour swatches, add/remove)
  out of `CalendarSettings.tsx` into a shared `FavoritesEditor.tsx` component, since it's
  now used by Calendar (colours), General (emojis), and Notes (3× colours + covers).
- Moved the "Favourite emojis" settings card from Calendar settings to General settings,
  since the emoji picker is shared by both the calendar event editor and notes pages.
- Reworked `.notes-swatch:hover` in the toolbar colour popover from a flat box-shadow ring
  to the scale-transform hover used by the calendar's colour picker (`.color-swatch`),
  matching the calendar page's established interaction pattern.

## Why

User request: configure favourite colours for notes' text/highlight/block colour pickers
and favourite cover images, the same way favourite emojis/colours are already configurable
for the calendar. Also requested moving the emoji-favourites settings to General now that
the shared `EmojiPicker` component is used by both calendar and notes, and asked for a
more polished hover state on the toolbar's colour swatches.

## Files touched

- `apps/api/app/models.py` — added the four new JSON columns to `UserSettings`.
- `apps/api/app/routes/settings.py` — added the fields to `SettingsResponse`/`SettingsPatch`,
  plus hex-colour and cover-URL validators.
- `apps/api/alembic/versions/014_notes_favorite_colors.py` — new migration adding the columns.
- `docs/architecture/DATABASE.md` — documented the new `user_settings` columns.
- `apps/web/src/context/SettingsContext.tsx` — added the four fields to `UserSettings` and
  `DEFAULTS` (empty arrays).
- `apps/web/src/components/FavoritesEditor.tsx` — new shared component: `FavoriteEmojiEditor`,
  `FavoriteColorEditor`, `FavoriteCoverEditor`.
- `apps/web/src/modules/settings/CalendarSettings.tsx` — removed the emoji section and
  inline swatch logic; now imports `FavoriteColorEditor` for the colours card.
- `apps/web/src/modules/settings/GeneralSettings.tsx` — added the "Favourite emojis" card
  using `FavoriteEmojiEditor`.
- `apps/web/src/modules/settings/NotesSettings.tsx` — added a page header plus "Favourite
  text/highlight/block colours" and "Favourite covers" cards.
- `apps/web/src/modules/notes/editor/BlockEditor.tsx` — reads `useSettings()` and renders
  `favorite_text_colors`/`favorite_highlight_colors`/`favorite_block_colors` as extra
  swatch buttons in each colour popover section.
- `apps/web/src/modules/notes/editor/BlockEditor.test.tsx` — mocked `SettingsContext` so
  the editor renders without a `SettingsProvider` in tests.
- `apps/web/src/modules/notes/CoverPicker.tsx` — added an optional `favorites` prop shown
  as a "Favourites" section above the fixed gradient presets.
- `apps/web/src/modules/notes/PageView.tsx` — passes `settings.favorite_covers` into both
  `CoverPicker` call sites.
- `apps/web/src/modules/notes/notes.css` — reworked `.notes-swatch:hover` to use
  `transform: scale(1.12)` + `var(--shadow-sm)` instead of a box-shadow ring.

## How the pieces connect

Favourite colours/covers follow the same read path as the existing `favorite_emojis`/
`favorite_colors`: stored on `UserSettings`, exposed via `/api/settings`, read through
`useSettings()` in the consuming component, and rendered as extra options alongside a
fixed built-in set. The management UI (add/remove) lives in the relevant settings page and
patches the setting directly. `FavoritesEditor.tsx` centralises the tile/swatch rendering
and add/remove logic so each settings page only wires `values`/`onChange` — Calendar's
colours, General's emojis, and Notes' three colour lists all use the same
`FavoriteColorEditor`/`FavoriteEmojiEditor`.

## How to modify this later

To add another favourite-driven picker (e.g. a favourite icon set for a future module):
add the array field to `UserSettings` (model + migration + route schema + context type),
add a settings card using the appropriate editor from `FavoritesEditor.tsx`, and read
`settings.<field>` wherever the picker renders its options. If the tile shape needed is
genuinely new (not emoji/colour/cover), add a new tile component to `FavoritesEditor.tsx`
rather than duplicating the add/remove logic in the settings page.
