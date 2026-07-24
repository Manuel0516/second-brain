# Plan: Selectable Neon and Monochrome visual styles

> Audience: implementing AI or developer. This is a production-code implementation
> plan. Follow the repository `AGENTS.md` workflow before changing code: read
> `docs/CONTEXT.md`, `docs/product/SETTINGS_MODULE.md`,
> `docs/design/STYLE_GUIDE.md`, and the relevant backend/database architecture
> sections. Do not combine this work with the separate whole-app UX audit.

Status: ready for implementation

Date: 2026-07-24

---

## 1. Goal and fixed decisions

Add a saved visual-style preference independently from the existing color-mode
preference:

- **Visual style**: `neon` or `monochrome`.
- **Color mode**: the existing `system`, `light`, or `dark`.
- Existing and new users default to `neon`; deployment must not unexpectedly
  restyle the app.
- Neon keeps the current warm-charcoal and cyan appearance.
- Monochrome keeps the existing layout, typography, spacing, radii, components,
  and motion, but replaces branded chrome with soft-neutral black, white, and
  gray.
- Calendar colors, note highlights, charts that encode multiple data series,
  workout feeling colors, success, warning, danger, and user-selected colors
  remain meaningful. Monochrome applies to the app chrome, not the user's data.
- Use the supplied `apps/web/public/Blanco_SinFondo.png` for Monochrome and the
  existing `logo-neon-planet.png` for Neon.
- No new dependency or new component pattern is needed.

The preference must be authoritative in the backend. A browser-local copy is
only a pre-authentication/first-paint cache and must be replaced by the backend
value after settings load.

## 2. Appearance model and CSS contract

Keep `data-theme` exactly as it works now and add
`data-visual-style="neon" | "monochrome"` to the root `<html>` element.
Component code must continue consuming semantic CSS custom properties rather
than checking style names.

The existing Neon values remain the default token set. Add Monochrome overrides
for dark, explicit light, and system-light mode:

| Token | Monochrome dark | Monochrome light |
|---|---|---|
| `--bg-base` | `#0b0b0b` | `#f5f5f5` |
| `--bg-elevated` | `#141414` | `#ffffff` |
| `--bg-raised` | `#202020` | `#eaeaea` |
| `--border` | `rgba(255, 255, 255, 0.08)` | `rgba(0, 0, 0, 0.08)` |
| `--border-strong` | `rgba(255, 255, 255, 0.14)` | `rgba(0, 0, 0, 0.15)` |
| `--border-grid` | `rgba(255, 255, 255, 0.05)` | `rgba(0, 0, 0, 0.05)` |
| `--text-primary` | `#f5f5f5` | `#0a0a0a` |
| `--text-secondary` | `#a3a3a3` | `#525252` |
| `--text-tertiary` | `#737373` | `#737373` |
| `--accent` | `#ffffff` | `#0a0a0a` |
| `--accent-tint` | `rgba(255, 255, 255, 0.10)` | `rgba(0, 0, 0, 0.07)` |
| `--accent-tint-border` | `rgba(255, 255, 255, 0.18)` | `rgba(0, 0, 0, 0.14)` |

Use neutral black shadows in both modes, keeping the current shadow geometry.
Do not redefine the semantic status or user-content color tokens in the
Monochrome layer.

Add brand-logo classes/tokens so:

- Neon uses the current cyan glow and never changes asset or tone.
- Monochrome uses a restrained neutral glow.
- The supplied white Monochrome logo is unchanged in dark mode and uses a CSS
  tone filter in light mode so it renders black.
- The existing `glow` animation no longer contains a hard-coded cyan value that
  leaks into Monochrome.
- The existing reduced-motion behavior still disables long transitions.

## 3. Remove theme-bearing hard-coded colors

Audit frontend CSS and TSX for current cyan and warm surface/text values. Convert
values that represent UI chrome, selection, focus, borders, surfaces, and
single-series brand accents to the existing semantic tokens. Known areas include:

- Global connection/open-note actions and logo glow.
- The Login page's hard-coded warm palette and cyan focus state.
- Fitness local accent aliases, week-strip states, current-week bars, and
  single-series chart fills.
- Food current-day/current-week accent states.
- Shared controls or cards containing exact copies of the base surface/text
  palette.

Use CSS classes instead of adding new inline theming branches. When a rare alpha
strength is required, derive it from `var(--accent)` with native CSS
`color-mix()` or add one clearly semantic shared token; do not add style-specific
conditionals in components.

Do not convert:

- Calendar and event colors.
- Notes text/highlight/block color choices or their default custom-picker value.
- Multi-series data colors where color distinguishes series.
- Workout feeling colors.
- Success, warning, error, and destructive colors.
- User-uploaded or user-selected content.

This distinction is required to avoid turning a visual restyle into a loss of
information.

## 4. Frontend preference lifecycle

Extend `UserSettings` and its defaults with:

```ts
visual_style: 'neon' | 'monochrome'
```

Use `neon` as the frontend default. Keep appearance application in one minimal
shared helper used by bootstrap, settings state, and the unauthenticated login
screen:

1. Read `sb_visual_style` before React mounts.
2. Accept only `neon` or `monochrome`; ignore missing or invalid values and use
   `neon`.
3. Set `document.documentElement.dataset.visualStyle` synchronously so the auth
   loading and login screens do not flash the wrong branding.
4. When `/api/settings` loads, apply `theme` and `visual_style`; this response is
   authoritative and overwrites the local cache.
5. A settings change updates the UI optimistically and uses the existing
   `theme-transition` class for either appearance dimension.
6. Write `sb_visual_style` only after a successful settings load or PATCH.
7. If PATCH fails, follow the existing settings refresh path and reapply the
   returned backend values.

The local value is not a second preference store and must never override a
successfully loaded backend setting.

Update both logo consumers:

- The authenticated app rail selects its asset from `settings.visual_style`.
- Login selects the cached/root visual style because it is outside
  `SettingsProvider`.

Keep Login's current dark-first composition; refactor its theme-bearing colors
to semantic styling so Neon and Monochrome branding are both coherent. Do not
change login behavior or authentication.

## 5. Settings UI

In the existing Appearance card in General Settings, reuse `SegmentControl` and
show two clearly separate fields in this order:

1. **Style** — `Neon` / `Monochrome`.
2. **Color mode** — `System` / `Light` / `Dark`.

Do not add preview cards, a new selector component, or a new layout pattern.
The selected style must apply immediately and persist through the existing
`patch()` settings flow.

## 6. Backend and migration

Create the next Alembic migration (currently revision `028`, down revision
`027`) adding:

```text
user_settings.visual_style VARCHAR(16) NOT NULL DEFAULT 'neon'
```

Use a server default so existing rows are backfilled safely. The downgrade drops
the column.

Update the SQLAlchemy `UserSettings` model with a non-null string column whose
Python and server defaults are `neon`.

Extend the settings API contract:

```python
visual_style: Literal["neon", "monochrome"]
```

Add it to:

- `SettingsResponse`.
- Optional `SettingsPatch`.
- `_settings_to_response`.
- Lazy-created settings defaults through the model default.

Unknown values must be rejected by Pydantic with HTTP 422. Do not create a new
endpoint; use the existing `GET/PATCH /api/settings`.

## 7. Documentation and history

Update the sources of truth as part of the production change:

- `docs/design/STYLE_GUIDE.md`: distinguish visual style from color mode,
  document both palettes and the semantic-color exception, and keep
  `apps/web/src/styles.css` as the token source of truth.
- `docs/product/SETTINGS_MODULE.md`: document both Appearance controls.
- `docs/architecture/DATABASE.md`: add `visual_style` to `user_settings` and
  record migration `028`.
- Add the next history entry (currently `0159`) with all required sections and
  update `docs/history/CHANGELOG.md`.

Do not deploy, push, create a commit, or mutate the VPS.

## 8. Verification and acceptance criteria

Add backend tests proving:

- Default settings return `visual_style == "neon"`.
- PATCH to `monochrome` succeeds and a later GET returns `monochrome`.
- Unknown style values return 422 and do not change the stored setting.

Add focused frontend tests for the appearance helper/settings lifecycle:

- Valid cached values apply before settings load.
- Invalid cached values fall back to Neon.
- Backend settings replace a stale cached value.
- A successful change updates the root attribute and local cache.
- Logo asset selection and light-mode tone treatment follow the active style.

Manually verify Login, Calendar, Notes, Fitness, Food, and Settings in:

- Neon Dark and Light.
- Monochrome Dark and Light.
- System mode while changing the OS preference.
- Desktop and mobile layouts.

Acceptance requires:

- Neon has no unintended visual regression.
- Monochrome contains no cyan or warm UI chrome.
- Semantic/data colors remain present.
- Both logos are legible in their supported modes.
- Focus visibility and contrast remain accessible.
- Style and color-mode changes transition smoothly.
- Reduced-motion behavior remains respected.
- Reload, logout/login, and backend refresh resolve to the expected style.
- Root `npm run check` passes.

