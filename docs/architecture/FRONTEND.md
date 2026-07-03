# Second Brain — Frontend Architecture

> How the React app is structured. Read this before any frontend task.

---

## Directory layout

```
apps/web/src/
  App.tsx              — router root; all routes defined here
  main.tsx             — React entry point, context providers mounted here
  styles.css           — ALL design tokens + global styles (the single CSS file)

  pages/               — top-level route components (one per URL segment)
    Login.tsx          — /login
    Calendar.tsx       — /calendar (owns all calendar state)
    AppRail.tsx        — the persistent left icon rail (shared across all pages)

  modules/             — feature modules (self-contained)
    calendar/          — event grid, sidebar, editor, time logic
    notes/             — page tree, block editor, backlinks
    settings/          — settings panels

  components/          — shared UI primitives (used by 2+ modules)
    EmojiPicker.tsx    — icon/emoji picker popover (used in calendar + notes)
    ProtectedRoute.tsx — redirects to /login if not authenticated
    Segmented.tsx      — segmented control (tab-like selector)

  context/             — React context providers (global state)
    AuthContext.tsx    — current user, login/logout, auth status
    SettingsContext.tsx — user settings (theme, timezone, presets, etc.)

  lib/
    api.ts             — typed fetch wrapper for all /api calls
```

---

## Routing

All routes defined in `App.tsx`. Protected routes are wrapped in `<ProtectedRoute>` which
checks `AuthContext` and redirects to `/login` if not authenticated.

Current routes:
- `/login` — public
- `/calendar` — protected
- `/notes` — protected
- `/notes/:pageId` — protected (deep link to specific page)
- `/settings` — protected
- `/settings/:section` — protected

---

## State model

**Server state** lives only at the route/page level (`Calendar.tsx`, `Notes.tsx`). It is
fetched via `lib/api.ts`, stored in `useState`, and passed down as props. No global store.

**Global state** (auth, settings) lives in Context providers mounted in `main.tsx`.

**Local interaction state** (hover, open/closed, draft values) lives in the component that
owns the interaction. Never lifted unless two components truly need to share it.

---

## API calls

All HTTP calls go through `lib/api.ts`. It:
- Prefixes all paths with `/api`
- Sends credentials (cookies) with every request
- Handles 401 responses by clearing auth state and redirecting to login
- Returns typed JSON using the Pydantic response shapes from the backend

Never use raw `fetch()` in components. Always use the functions in `lib/api.ts`.

---

## CSS architecture

One file: `apps/web/src/styles.css`. This is the law.

- Design tokens defined at `:root` and `:root[data-theme='light']`
- Global resets and base element styles
- All keyframe animations
- All shared component classes (`.cal-card`, `.cal-field`, `.editor-group`, etc.)

Module-specific styles live in the module folder (e.g. `modules/notes/notes.css`).
They use the same tokens from `styles.css` — never new values.

**See `docs/design/STYLE_GUIDE.md` for the complete visual rules.**

---

## Calendar module internals

The calendar is the most complex module. Key files:

```
modules/calendar/
  TimeGrid.tsx      — the week/day grid; handles drag, resize, create
  MonthView.tsx     — month grid
  Sidebar.tsx       — calendar list with drag-to-reorder
  EventEditor.tsx   — create/edit event card (portalled to body)
  time.ts           — all time math (snap, overlap, grid position)
  order.ts          — calendar sidebar order (localStorage)
  colors.ts         — color presets
```

Event identity for recurring series: `occurrenceKey(event) = "${event.id}:${event.start_at}"`.
The draft preview in the grid is identified by `draftReplaceKey` to avoid replacing all
occurrences of a series when only one is being edited.

Gestures on touch devices use a state machine in `TimeGrid.tsx` — not ad-hoc touch handlers.

---

## Notes module internals

```
modules/notes/
  Notes.tsx          — route shell: pages state, sidebar, topbar, front-page
                       overview tree (no page selected)
  PageView.tsx       — page canvas: icon, title, block editor, backlinks
  Sidebar.tsx        — sidebar page tree with drag-to-reorder
  Backlinks.tsx      — backlinks panel at the bottom of each page
  api.ts             — notes-specific API calls
  types.ts           — TypeScript types for Page, Backlink, SearchResult, Link
  notes.css          — module styles (tokens only, no new values)
  listMarkers.css    — settings-driven list marker schemes (also imported by
                       the Notes settings page for its live previews)
  editor/
    BlockEditor.tsx  — the Tiptap v3 editor: extensions, slash menu,
                       BubbleMenu (marks, colors, text alignment), DragHandle,
                       paste/drop (images, bookmark URLs, column edge-drops)
    ImageNode.tsx    — image block NodeView (width grip, align, upload helper)
    BookmarkNode.tsx — link-embed card NodeView + metadata fetch helper
    ColumnNodes.ts   — multi-column layout nodes + drag-to-edge drop logic
    TableToolbar.tsx — floating table controls (row/col/header/delete)
    TextAlignExtension.ts — paragraph/heading text-align attribute
    (+ math, callout, code block, collapsible heading, task item, location,
     color extensions — one file each)
```

Block content is stored as Tiptap JSON in the `Page.content` JSONB column.
Images upload to `POST /api/files` (MinIO-backed) and embed by URL.

---

## Settings module internals

```
modules/settings/
  GeneralSettings.tsx   — theme, timezone, week start, time format
  CalendarSettings.tsx  — default calendar, event duration, emoji/color presets
```

Settings are read from `SettingsContext` (which fetches on mount) and written via
`lib/api.ts → PATCH /api/settings`.

---

## Adding a new module

1. Create `modules/<name>/` with an index component and a `<name>.css`.
2. Add a route in `App.tsx`.
3. Add a rail icon in `AppRail.tsx`.
4. Use the rail→sidebar→canvas layout shell (see `STYLE_GUIDE.md` §8).
5. Read and write through `lib/api.ts`.
6. Never import from another module's internals — only from `components/`, `context/`, `lib/`.
