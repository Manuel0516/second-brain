# 0159 — Selectable Neon and Monochrome visual styles

Date: 2026-07-24
Status: accepted

## What changed

Added a second, independent Appearance preference — `visual_style` (`neon` default or
`monochrome`) — alongside the existing color mode (`theme`). Neon is the existing warm
dark/cyan palette, unchanged. Monochrome keeps the exact same layout, typography,
spacing, radii, components, and motion, but restyles app chrome (surfaces, borders, text,
the single accent, the logo/glow) to soft-neutral black/white/gray. Calendar/event colors,
note text/highlight/block colors, multi-series chart palettes, workout feeling colors, and
semantic status colors (success/warning/error/danger) are untouched by design.

The preference is set via `data-visual-style` on `<html>`, orthogonal to the existing
`data-theme`. It's authoritative in the backend (`user_settings.visual_style`), with a
`localStorage` cache (`sb_visual_style`) used only to avoid a flash of the wrong branding
before `/api/settings` loads or on the pre-authentication login screen.

A new Style segmented control was added to the Appearance card in General Settings,
above the existing Color mode control.

As part of the audit required to make Monochrome actually neutral, hard-coded
theme-bearing colors (cyan accents and warm-cream chrome literals) were converted to the
existing semantic CSS tokens across the Login page, the Fitness module, the Food module,
and a few global/shared spots (the `connection-open-note` button, the logo `glow`
keyframe, `BodyWeightCard`, `ProgressBar`).

**Follow-up fix, same day**: three bugs reported after the initial implementation —
(1) the Monochrome logo rendered visibly smaller than the Neon logo, (2) the logo (and
(3) the Style control) reverted to Neon every time the user navigated between top-level
pages. All three are fixed:

- `apps/web/public/Blanco_SinFondo.png` was losslessly cropped to its opaque content
  bounding box (500×500 canvas with the artwork filling only 64%×41% → 320×206 canvas
  filling ~100%×100%), so it now fills the same fraction of its `object-fit: contain` box
  as `logo-neon-planet.png` (which fills 100%×66%). No pixels were resized — just the
  transparent margin trimmed.
- `apps/web/src/App.tsx` — root cause of the reset-to-Neon bug: `<SettingsProvider>` was
  instantiated separately inside *each* of the five authenticated routes
  (`/calendar`, `/notes`, `/fitness`, `/food`, `/settings`), so navigating between them
  unmounted and remounted it, resetting its React state back to `DEFAULTS`
  (`visual_style: 'neon'`) until `/api/settings` re-fetched. Restructured to a single
  pathless layout `<Route>` — `<ProtectedRoute><SettingsProvider><PageTransition><Outlet
  /></PageTransition></SettingsProvider></ProtectedRoute>` — with all five routes nested
  as children, so `SettingsProvider` now mounts once and persists across navigation
  within the authenticated app. `PageTransition` (the per-page enter-animation wrapper,
  keyed on the URL's top-level segment) moved inside the new layout route so each page
  still gets its entrance animation, but no longer forces `SettingsProvider` to remount.

**Second follow-up, same day**: added a dynamic favicon (the browser tab icon was
hard-coded to the Neon logo in `index.html` regardless of style) and investigated a
report that the login screen's style didn't match the saved preference:

- `apps/web/src/lib/appearance.ts` — `applyVisualStyle()` now also updates the
  `<link rel="icon">` element's `href` via a new `applyFavicon()` helper, reusing
  `logoAssetFor()`. This runs everywhere `applyVisualStyle` already runs (bootstrap,
  settings load, every patch), so the tab icon tracks the active style with no extra
  wiring anywhere else.
- The favicon was distorted (stretched) in Monochrome: browsers scale a favicon into a
  square slot with no `object-fit` control, but `favicon-monochrome.png` initially
  pointed at the same tightly-cropped rectangular asset (320×206) used for the in-page
  logo, which relies on CSS `object-fit: contain` to preserve its aspect ratio — a
  control favicons don't have. Fixed by adding `apps/web/public/favicon-monochrome.png`,
  a square (320×320) transparent-padded version of the same artwork, and a new
  `faviconAssetFor()` helper (separate from `logoAssetFor()`) that `applyFavicon()` uses
  instead. Neon is unaffected since `logo-neon-planet.png` was already a square canvas.
- Investigated the "login screen doesn't match saved style" / "doesn't save properly"
  report with three independent checks against the running dev environment: (1) a direct
  `psql` query confirmed the `visual_style` column exists with the right default and a
  real row was already persisted as `monochrome`; (2) a full `curl` round trip
  (login → GET → PATCH → GET) against the live API with a throwaway QA account
  confirmed default `neon`, successful patch to `monochrome`, and persistence across a
  second GET; (3) an isolated React Testing Library test confirmed `SettingsProvider`'s
  load effect writes the `sb_visual_style` cache and a freshly-mounted `Login` reads it
  back correctly. All three passed — the backend save and the frontend cache/read logic
  are both correct as implemented. The most likely explanation for what was seen is a
  stale bundle/session in the browser tested (`main.tsx`'s pre-mount cache read only runs
  on a full page load, not a Vite HMR update) — recommended a hard refresh to confirm. No
  code change was made for this part since the described behavior could not be
  reproduced.

## Why

User request: a Monochrome visual identity option that doesn't require re-theming every
component individually, without disturbing the existing Neon look or the separate
light/dark/system color mode. Converting the hard-coded colors was necessary groundwork —
without it, Monochrome would still show cyan accents and warm borders bleeding through in
Fitness/Food/Login, defeating the point of the feature.

## Files touched

- `apps/api/alembic/versions/028_visual_style.py` — adds `user_settings.visual_style
  VARCHAR(16) NOT NULL DEFAULT 'neon'`.
- `apps/api/app/models.py` — `UserSettings.visual_style` column (Python + server default
  `"neon"`).
- `apps/api/app/routes/settings.py` — `visual_style: Literal["neon", "monochrome"]` added
  to `SettingsResponse`, `SettingsPatch`, and `_settings_to_response`. Unknown values are
  rejected by Pydantic with HTTP 422.
- `apps/api/tests/test_settings.py` — default-is-neon, patch-persists, and
  reject-unknown-value tests.
- `apps/web/src/lib/appearance.ts` — new shared helper: reads/writes the `sb_visual_style`
  cache, applies `data-theme`/`data-visual-style` (with the existing `theme-transition`
  class), and exposes `logoAssetFor()` for the brand logo.
- `apps/web/src/lib/appearance.test.ts` — covers cache fallback, pre-mount application,
  authoritative backend overwrite, and logo asset selection.
- `apps/web/src/main.tsx` — calls `applyCachedVisualStyleBeforeMount()` before the first
  React render.
- `apps/web/src/context/SettingsContext.tsx` — `UserSettings.visual_style` field and
  `neon` default; load/patch paths now call `applyBackendAppearance()` instead of the
  old private `applyTheme()`.
- `apps/web/src/components/AppRail.tsx`, `apps/web/src/pages/Login.tsx` — select the logo
  asset via `logoAssetFor()`; both `<img>` tags got a `.brand-logo` class for the CSS tone
  filter.
- `apps/web/src/modules/settings/GeneralSettings.tsx` — new Style segmented control
  (Neon/Monochrome) above the existing Color mode control.
- `apps/web/src/styles.css` — Monochrome token overrides for dark/light/system-light
  (`data-visual-style='monochrome'`), `--logo-glow-rgb` token (glow keyframe no longer
  hard-codes cyan), `.brand-logo` tone-filter rule, and `.connection-open-note`
  tokenized.
- `apps/web/src/modules/fitness/fitness.css`, `ExerciseStats.tsx`, `Overview.tsx`,
  `WeekStrip.tsx`, `Fitness.tsx`, `BodyMetricForm.tsx`, `BodyMetricLog.tsx`,
  `RestTimer.tsx`, `SessionWizard.tsx` — `--fit-accent*` now alias `var(--accent)`
  (via `color-mix()` for tints); hard-coded cyan chart/week-strip/current-week-bar
  colors and warm-cream borders converted to semantic tokens.
- `apps/web/src/modules/food/Food.tsx`, `Stats.tsx`, `Overview.tsx`, `food.css` — same
  treatment for the current-day/current-week accent states and chart tooltip/grid
  styling.
- `apps/web/src/components/BodyWeightCard.tsx`, `ProgressBar.tsx` — shared-component
  literals converted to tokens.
- `docs/design/STYLE_GUIDE.md` — documents visual style vs. color mode as independent
  dimensions, the Monochrome token table, and the semantic-color exception.
- `docs/product/SETTINGS_MODULE.md` — documents both Appearance controls.
- `docs/architecture/DATABASE.md` — `visual_style` column and migration 028.
- `docs/history/CHANGELOG.md` — indexes this entry.
- `apps/web/public/Blanco_SinFondo.png` — cropped to its content bounding box (follow-up
  fix, see above).
- `apps/web/src/App.tsx` — `SettingsProvider` hoisted to a single shared layout route
  (follow-up fix, see above).
- `apps/web/src/lib/appearance.ts`, `apps/web/src/lib/appearance.test.ts` — dynamic
  favicon (second follow-up, see above).
- `apps/web/public/favicon-monochrome.png` — new square, undistorted Monochrome favicon
  asset; `apps/web/src/lib/appearance.ts`'s `faviconAssetFor()` and `applyFavicon()`
  updated to use it instead of the rectangular in-page logo asset (third follow-up).

## How the pieces connect

`apps/web/src/lib/appearance.ts` is the single place that knows how to apply appearance:
`main.tsx` calls it synchronously before mount (reading the `sb_visual_style` cache only,
since color mode already had a flash-free CSS-only default); `SettingsContext` calls it
after every successful load or patch with the backend's values (always authoritative,
always rewrites the cache); `Login.tsx` reads the cache directly since it renders outside
`SettingsProvider`. `styles.css` reads `data-theme` and `data-visual-style` off `<html>` to
select the right CSS custom property set — component code never branches on visual style,
it only ever consumes `var(--token)`, so a component written correctly for Neon/dark
automatically works for all four combinations.

The `--fit-accent`/`--food-accent` module-local aliases were the main lever in
Fitness/Food: once they point at `var(--accent)` instead of a literal hex, most of each
module's CSS didn't need to change at all.

## How to modify this later

- Adding a third visual style: extend the `VisualStyle` union in `appearance.ts`, add a
  `data-visual-style='...'` token block in `styles.css` (dark + light + system-light,
  mirroring the Monochrome blocks), extend the `Literal` in both the frontend
  `UserSettings` interface and the backend `SettingsResponse`/`SettingsPatch`, and add the
  option to the `Segmented` control in `GeneralSettings.tsx`.
- If a new component introduces its own hard-coded color, it will not respond to
  Monochrome. Grep for `#[0-9a-f]{3,6}` and `rgba(` literals outside `styles.css` before
  merging any new Fitness/Food/Login-adjacent UI.
- The `sb_visual_style` cache is a pre-paint hint only — never read it after mount for
  anything other than the very first render; always prefer `useSettings().settings`.
- Any state that must survive navigation between the authenticated top-level pages
  belongs above the `PageTransition`/`Outlet` layer in `App.tsx`'s shared layout route,
  not duplicated per-route — that duplication is exactly what caused the Neon/Monochrome
  reset bug. If a future page needs its own provider, check first whether it actually
  needs to reset on every navigation (rare) before adding it inside the keyed
  `PageTransition` wrapper.
