# Plan A — Settings Module (General + Calendar)

> Audience: an implementing AI (Codex / DeepSeek) or developer. This is a precise,
> self-contained build spec. Follow it top to bottom. Do **not** invent new
> visual language — every screen reuses the tokens and component patterns already
> in `apps/web/src/styles.css` (see §7). Run `npm run check` (web) and
> `npm run check:api` before declaring any task done.

Scope of THIS plan: only the **General** page and the **Calendar** page get real
functionality. Fitness / Food / Notes / Security(2FA) appear in the nav as
disabled "Soon" rows (same pattern as the Google import button in the calendar
sidebar). Reminders/email and AI provider config are out of scope here.

---

## 1. Outcome

A `/settings` area, reachable from the existing left **app-rail** gear icon,
laid out exactly like the rest of the app (rail → contextual sidebar → main
canvas). Two working pages:

- **General** — change username, change email, change password, theme,
  timezone, week-start, default calendar view, time format, export data, log out.
- **Calendar** — edit **favourite emojis** and **favourite colours** (these
  drive the event editor's icon/colour pickers), plus calendar defaults
  (default event duration, default calendar, default reminder, show weekends,
  dim past events).

The favourites are the headline: today `EventEditor.tsx` uses a hardcoded
`ICON_PRESETS` array and `COLOR_PRESETS` from `modules/calendar/colors.ts`.
After this plan, those presets come from saved user settings, and editing them
on the Calendar settings page updates what the event editor offers.

---

## 2. Data model & migration (backend)

File: `apps/api/app/models.py`. New Alembic migration: `apps/api/alembic/versions/008_user_settings.py`
(down_revision = `"007"`).

### 2.1 `User` — add a username

```python
# in class User
username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
```

Migration: add column nullable, backfill from the email local-part
(`split('@')[0]`), add unique index, then set NOT NULL. Update
`ensure_initial_user()` in `app/main.py` to set `username` from
`settings.initial_user_username` (new config field, default `"manuel"`).

### 2.2 New `UserSettings` table (one row per user, lazily created)

```python
class UserSettings(Base):
    __tablename__ = "user_settings"
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), primary_key=True
    )
    # Appearance / general
    theme: Mapped[str] = mapped_column(String(10), default="system", nullable=False)   # system|light|dark
    timezone: Mapped[str] = mapped_column(String(63), default="Europe/Stockholm", nullable=False)
    week_start: Mapped[str] = mapped_column(String(8), default="monday", nullable=False) # monday|sunday
    default_view: Mapped[str] = mapped_column(String(8), default="week", nullable=False) # day|week|month
    time_format: Mapped[str] = mapped_column(String(3), default="24h", nullable=False)   # 24h|12h
    # Calendar
    favorite_emojis: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    favorite_colors: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    default_event_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    default_calendar_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("calendars.id", ondelete="SET NULL"), nullable=True
    )
    default_reminder_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    show_weekends: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    dim_past_events: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC), nullable=False,
    )
```

Seed defaults (used when a row is first created — see §3.2):

```python
DEFAULT_FAVORITE_EMOJIS = ["📅", "💼", "☕", "🏃", "🍽️", "📝", "🎧", "🎯"]
DEFAULT_FAVORITE_COLORS = ["#3B6FE0", "#2E9E6E", "#D6932B", "#8B5CF6", "#D9573F"]
```

(These are exactly today's `ICON_PRESETS` and `COLOR_PRESETS`, so behaviour is
unchanged until the user edits them.)

Migration adds the table; no data backfill needed (rows are created on demand).

---

## 3. API surface (backend)

New router file: `apps/api/app/routes/settings.py`, `prefix="/api/settings"`,
registered in `app/main.py` (`app.include_router(settings.router)`). Auth via
the existing `Depends(get_current_user)`.

### 3.1 Pydantic schemas

```python
class SettingsResponse(BaseModel):
    theme: Literal["system","light","dark"]
    timezone: str
    week_start: Literal["monday","sunday"]
    default_view: Literal["day","week","month"]
    time_format: Literal["24h","12h"]
    favorite_emojis: list[str]
    favorite_colors: list[str]
    default_event_minutes: int
    default_calendar_id: str | None
    default_reminder_minutes: int | None
    show_weekends: bool
    dim_past_events: bool

class SettingsPatch(BaseModel):           # all optional; same field constraints
    theme: Literal["system","light","dark"] | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=63)
    week_start: Literal["monday","sunday"] | None = None
    default_view: Literal["day","week","month"] | None = None
    time_format: Literal["24h","12h"] | None = None
    favorite_emojis: list[str] | None = Field(default=None, max_length=32)
    favorite_colors: list[str] | None = Field(default=None, max_length=24)
    default_event_minutes: int | None = Field(default=None, ge=5, le=1440)
    default_calendar_id: str | None = None
    default_reminder_minutes: int | None = Field(default=None, ge=0, le=40_320)
    show_weekends: bool | None = None
    dim_past_events: bool | None = None
```

Validation: each emoji ≤ 8 chars; each colour must match `^#[0-9A-Fa-f]{6}$`
(reuse the `HEX` constant from `routes/calendar.py` — move it to a shared spot
or re-declare). Reject `default_calendar_id` that the user does not own.

### 3.2 Endpoints

```
GET   /api/settings            -> SettingsResponse   (creates the row with defaults if missing)
PATCH /api/settings            -> SettingsResponse   (partial update, exclude_unset)
GET   /api/settings/export     -> application/json    (Content-Disposition: attachment; filename="secondbrain-export-<date>.json")
```

`export` returns `{ "exported_at", "user": {username,email}, "calendars": [...], "events": [...] }`
— pull the user's calendars and **stored** events (raw rows, not expanded
occurrences). Keep it simple; no MinIO/zip yet.

### 3.3 Account endpoints (extend `apps/api/app/routes/auth.py`)

```
PATCH /api/auth/profile        body {username?, email?}              -> UserResponse
PATCH /api/auth/password       body {current_password, new_password} -> 204
```

- `profile`: validate username `^[a-zA-Z0-9_.-]{3,50}$`, unique (409 on clash);
  email via `EmailStr`, unique. Update `UserResponse`/`LoginResponse`/`get_me`
  to also return `username`.
- `password`: verify `current_password` with `verify_password`; hash the new one
  with `hash_password`; enforce min length 10. On success, revoke all other
  refresh tokens for the user (force re-login elsewhere) — reuse the logout
  revocation loop. Rate-limit reuse not required here.

### 3.4 Tests (`apps/api/tests/test_settings.py`)

Cover: GET creates defaults; PATCH partial update persists; PATCH rejects bad
hex colour (422) and unowned `default_calendar_id` (404/422); password change
happy path + wrong current password (401/403); username uniqueness clash (409);
export returns the user's calendars/events. Follow the existing
`authenticated_client` fixture style in `tests/test_calendar.py`.

---

## 4. Frontend — routing & shell

### 4.1 Routes (`apps/web/src/App.tsx`)

Add nested protected routes:

```
/settings            -> redirect to /settings/general
/settings/general    -> <SettingsLayout><GeneralSettings/></SettingsLayout>
/settings/calendar   -> <SettingsLayout><CalendarSettings/></SettingsLayout>
```

Wrap in `<ProtectedRoute>` like `/calendar`.

### 4.2 Rail wiring (`apps/web/src/pages/Calendar.tsx`)

- The gear `RailBtn title="Settings"` currently calls `handleLogout`. Change it
  to `onClick={() => navigate('/settings')}` (use `useNavigate`). Mark it
  `active` only when on a settings route.
- Move logout to the General settings page (§5) — the rail no longer logs out.
- Extract the rail (logo + the 5 `RailBtn`s) into a shared
  `apps/web/src/components/AppRail.tsx` so both Calendar and Settings render an
  identical rail (props: `active: 'calendar'|'settings'|...`). Keep the existing
  inline styles; just lift them into the component verbatim.

### 4.3 `SettingsContext` (`apps/web/src/context/SettingsContext.tsx`)

A provider that fetches `GET /api/settings` once on mount, exposes
`{ settings, loading, patch(partial) }` where `patch` does optimistic update +
`PATCH /api/settings` + reconcile. Wrap the app (in `App.tsx`, inside
`AuthProvider`, only when authenticated). The calendar event editor reads
`settings.favorite_emojis` / `favorite_colors` from here.

### 4.4 Settings shell component (`apps/web/src/modules/settings/SettingsLayout.tsx`)

Layout = **rail** (`<AppRail active="settings"/>`) + **settings sidebar** +
**main**. Mirror the calendar page's fl/flex structure (`Calendar.tsx` lines
~318–410).

```
┌──────┬───────────────────┬──────────────────────────────────────────┐
│ rail │  SETTINGS          │  General settings            (h1 + desc)  │
│ 64px │  ───────           │  ┌────────────────────────────────────┐  │
│ 🧠   │  ▸ General  (active)│  │ Profile             [section card] │  │
│ 📅   │    Calendar        │  │ ...                                 │  │
│ 📝   │    Fitness   Soon  │  └────────────────────────────────────┘  │
│ ...  │    Food      Soon  │  ┌────────────────────────────────────┐  │
│ ⚙    │    Notes     Soon  │  │ Password            [section card] │  │
│      │    Security  Soon  │  └────────────────────────────────────┘  │
└──────┴───────────────────┴──────────────────────────────────────────┘
```

- The settings **sidebar** reuses `.calendar-sidebar` structure & tokens: 230px,
  `border-right: 1px solid var(--border)`, header label in mono uppercase
  (`.sidebar-title` style), and a vertical list of nav rows. Active row =
  `background: var(--accent-tint); color: var(--text-primary)`; inactive =
  `color: var(--text-secondary)`, hover `background: rgba(255,240,200,0.04)`.
  "Soon" rows are `disabled`, `color: var(--text-tertiary)`, with a small mono
  "Soon" pill on the right (copy the `.integration-status` style).
- On tablet/mobile (<900px) the settings sidebar collapses to an overlay drawer
  exactly like `.calendar-sidebar` already does (reuse those rules / a backdrop).
- Main area: `.settings-main { padding: 24px 28px; max-width: 760px; overflow:auto }`,
  a header (`<h1>` 20px/700 primary + `<p>` 13px secondary), then a vertical
  stack (`gap: 16px`) of `.settings-card` sections.

---

## 5. General page (`modules/settings/GeneralSettings.tsx`)

Each numbered block is a `.settings-card` (see §7 for the class). Use a
**per-section save** model: each card with editable fields has its own footer
row `[ Saved ✓ / error ]  …  [ Save ]` button (primary, tinted-accent style).
Disable Save until a field changed; show the same saved-check micro-animation
the event editor uses if cheap, otherwise a simple "Saved" text that fades.

1. **Profile** — fields: Username (text), Email (text). Save → `PATCH /api/auth/profile`.
2. **Password** — Current password, New password, Confirm new password (all
   `type="password"`). Validate match + min length client-side. Save →
   `PATCH /api/auth/password`; on success clear fields and show "Password updated".
3. **Appearance** — Theme: a **segmented control** (System | Light | Dark) reusing
   the `.repeat-segmented` pattern. On change → `settings.patch({theme})` and
   apply immediately (see §6).
4. **Preferences** — Timezone (`<select>` of common IANA zones; default list ok),
   Week starts on (segmented Mon | Sun), Default view (segmented Day | Week | Month),
   Time format (toggle-row switch labelled "24-hour time"). Each control writes
   through `settings.patch(...)` (no separate Save button — instant, like the
   calendar sidebar toggles).
5. **Data & account** — "Export all data" button (ghost) → fetch
   `/api/settings/export`, trigger a file download (create a Blob + anchor).
   Below it, a "Log out" button (ghost, but `color: var(--danger?)` — there is no
   danger token; use `.danger` class already used by the event editor Delete
   button). Calls `useAuth().logout()` then navigate `/login`.

---

## 6. Theme application

`SettingsContext` applies the theme by setting `document.documentElement.dataset.theme`
to `light` / `dark`, or removing it for `system`. Add to `styles.css`:

```css
:root[data-theme='light'] { /* copy the contents of the @media (prefers-color-scheme: light) :root block */ }
:root[data-theme='dark']  { /* the default dark tokens (already at :root) — explicit override so it wins over OS light */ }
```

Today light mode is only `@media (prefers-color-scheme: light)`. Refactor so the
light token values live in BOTH the media query (for `system`) and
`:root[data-theme='light']` (for explicit choice). Keep dark as the `:root`
default and also under `:root[data-theme='dark']`. No JS theme flable beyond the
`data-theme` attribute.

---

## 7. Calendar page (`modules/settings/CalendarSettings.tsx`)

Sections (each a `.settings-card`):

1. **Favourite emojis** — heading + helper text ("Shown first in the event icon
   picker."). A wrap-flex grid of the current `favorite_emojis`, each rendered as
   a 36px rounded tile (reuse `.editor-icon-choice` look) with a small × on hover
   to remove. An "add" tile at the end opens the **same** freeform emoji input the
   event editor uses (reuse the `.editor-icon-custom` input + the `event-icon-glyph`
   font handling so Nerd Font glyphs render). Enforce ≤ 8 chars, max 32 items.
   Every add/remove/reorder → `settings.patch({ favorite_emojis })`.
2. **Favourite colours** — a row of swatches reusing `.color-swatch` (21px circle)
   for each `favorite_colors` entry, each with a remove ×; plus a `.color-custom`
   native colour picker tile (identical to the event editor / calendar create card)
   to add a new colour. Max 24. → `settings.patch({ favorite_colors })`.
3. **Calendar defaults** — Default event duration (`<select>`: 15/30/45/60/90/120
   min), Default calendar (`<select>` of the user's calendars, fetched from
   `/api/calendars`), Default reminder (`<select>`: None/5/15/30/60/1440), Show
   weekends (toggle-row), Dim past events (toggle-row). Instant write-through.

### 7.1 Wire favourites into the event editor

In `apps/web/src/modules/calendar/EventEditor.tsx`:
- Replace the module-level `const ICON_PRESETS = [...]` with a value read from
  `useSettings().settings.favorite_emojis` (fallback to the default array if
  empty / settings still loading).
- `colors.ts` `COLOR_PRESETS` stays as the **fallback default**; in the editor and
  in `Sidebar.tsx`'s `ColorField`, source the presets from
  `useSettings().settings.favorite_colors` (fallback to `COLOR_PRESETS`). Keep
  `onColor()` as-is.
- Do not change the picker markup/CSS — only the data source. This guarantees the
  pickers stay visually identical and "clean and polished".

---

## 8. UI structure & style reference (MUST follow)

Design tokens live in `apps/web/src/styles.css` `:root`. Reuse, never hardcode
hexes. Key tokens: `--bg-base|elevated|raised`, `--border`, `--border-strong`,
`--text-primary|secondary|tertiary`, `--accent`, `--accent-tint`,
`--accent-tint-border`, `--shadow-sm|md`, radii `--r-sm:5 --r-md:8 --r-lg:12`,
fonts `--font-ui` (Inter) and `--font-mono` (JetBrains Mono, for uppercase
labels). Motion: 120–200ms, `cubic-bezier(0.16,1,0.3,1)`, no bounce.

Component patterns to copy (exact classes already in the stylesheet):

| Need | Reuse this pattern |
|---|---|
| Section/card container | `.editor-group` (border `1px var(--border)`, radius `--r-md`, bg `--bg-base`, padding 14px) or `.cal-card` for elevated |
| Section header label | `.editor-group legend` — mono 10px uppercase, `--text-tertiary`, letter-spacing .07em |
| Text / number / select inputs | `.event-editor input/select/textarea` — 38px min-height, `--border-strong`, radius 7px, bg `--bg-elevated`, focus ring `box-shadow: 0 0 0 3px var(--accent-tint)` |
| Primary button | `.event-editor footer .primary` — `background: var(--accent-tint)`, `border-color: var(--accent-tint-border)`, `color: var(--accent)`, weight 600, height 34px |
| Secondary / ghost button | `.event-editor footer button` — bg `--bg-raised`, `--border-strong`, height 34px |
| Danger button | `.danger` (existing delete-button styling) |
| Toggle switch row | `.toggle-row` + `input[type=checkbox][role=switch]` |
| Segmented control (2–3 options) | `.repeat-segmented` + `.repeat-segmented button.active` |
| Colour swatches / custom picker | `.color-swatches`, `.color-swatch`, `.color-custom` |
| Emoji tiles / freeform input | `.editor-icon-choice`, `.editor-icon-custom`, `.event-icon-glyph` |
| Contextual sidebar | `.calendar-sidebar` (width, border, collapse/drawer behaviour) |
| "Soon" pill | `.integration-status` |
| Hover lift on buttons | already global on `button:not(.calendar-event)` |
| Entrance animations | `popIn`, `fadeUp`, `slideInR` keyframes |

New classes to add (prefix `settings-`), styled only with the tokens above:
`.settings-layout`, `.settings-nav`, `.settings-nav-item(.active/.disabled)`,
`.settings-main`, `.settings-header`, `.settings-card`, `.settings-card-head`
(title 13px/600 primary + optional helper 12px secondary), `.settings-field-row`
(label left, control right; stack on mobile), `.settings-card-actions` (right-
aligned save row). Keep `.settings-card` = same recipe as `.editor-group` but
allow a header + body + actions; padding 16px, gap 12px, radius `--r-md`,
`border: 1px solid var(--border)`, `background: var(--bg-base)`.

Accessibility: every control has a `<label>`/`aria-label`; segmented controls use
`role="radiogroup"`/`role="radio"`+`aria-checked` (as `.repeat-segmented` already
does); switches use `role="switch"`; touch targets ≥44px on mobile. Visible focus
rings (the accent box-shadow) on all inputs/buttons.

---

## 9. Build order (tasks)

1. **BE-1** migration 008 (User.username + UserSettings) + model fields + seed defaults.
2. **BE-2** `routes/settings.py` (GET/PATCH/export) + register router + tests.
3. **BE-3** auth: `/auth/profile`, `/auth/password`, add `username` to responses + `get_me` + tests.
4. **FE-1** `AppRail.tsx` extraction; rail gear → `/settings`; routes in `App.tsx`.
5. **FE-2** `SettingsContext` + theme application (§6) + light/dark `data-theme` CSS.
6. **FE-3** `SettingsLayout` + settings sidebar + `settings-*` CSS.
7. **FE-4** `GeneralSettings` (profile, password, appearance, preferences, data/account).
8. **FE-5** `CalendarSettings` (favourite emojis, favourite colours, defaults).
9. **FE-6** wire favourites into `EventEditor`/`Sidebar` pickers via `useSettings`.
10. **QA** `npm run check` + `npm run check:api`; manual pass on desktop + <640px.

## 10. Acceptance criteria

- Gear opens `/settings`; rail identical to calendar; settings sidebar matches
  `.calendar-sidebar` and collapses to a drawer under 900px.
- Changing username/email/password persists and survives reload; wrong current
  password shows an inline error, not a crash.
- Theme switch flips light/dark instantly and persists across reload; "System"
  follows the OS.
- Adding a favourite emoji/colour on the Calendar settings page makes it appear
  (first) in the event editor's icon/colour picker without a manual refresh.
- Export downloads a JSON file containing the user's calendars and events.
- All inputs/buttons use the shared tokens — no raw hex, no off-pattern controls.
- `npm run check` and `npm run check:api` pass.
