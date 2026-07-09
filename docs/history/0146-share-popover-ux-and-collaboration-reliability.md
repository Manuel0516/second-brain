# 0146 — Share popover UX rework, shared-calendar overrides, and collaboration reliability fix

Date: 2026-07-09
Status: accepted

## What changed

Follow-up UX pass on the sharing/export work landed in 0145, plus a real bug fix in note
collaboration:

1. **`ShareManager`** (used by both notes and calendars) now renders its popover through the
   shared portalled `Popover` component instead of a hand-rolled `position: absolute` `<section>`.
   Its `Invite`/`Revoke` buttons now use the same `.primary`/`.danger` recipe as the rest of the
   app (previously unstyled, falling back to browser defaults). Added a small popover head with a
   close button, matching the calendar edit card.
2. **Notes page** — Export PDF and the share trigger now float top-right over the cover banner
   (or near the breadcrumb row when there's no cover), with share info to the left of Export PDF.
3. **Calendar edit popover** — the Share trigger now sits in the action row, to the left of
   Delete/Done, instead of its own standalone row above.
4. **Shared-calendar management** — a calendar shared with you (viewer/editor) previously had no
   menu at all, and its visibility toggle silently 404'd (the PATCH endpoint was owner-only, and
   toggling it would have repainted the owner's calendar for everyone — `is_visible`/`color` lived
   on one shared `Calendar` row). Added a `visible`/`color` override on `ResourceShare`, a new
   `PATCH /api/calendars/{id}/my-share` endpoint scoped to the caller's own share row, and a
   non-owner popover (color override + "Leave calendar"). `delete_calendar_share` now also allows
   a recipient to delete their own share (self-leave), not just the owner revoking someone else's.
5. **Note collaboration websocket bug** — `NoteRelay.destroy()` set `this.destroyed = true`
   permanently; `connect()` never reset it. React StrictMode's dev-only double-invoke of the mount
   effect (mount → cleanup → mount) closed the first socket (matching the reported Firefox
   "connection was interrupted while loading" error) and left every subsequent event handler gated
   off forever, so the UI never reached "online" — this is what made it look broken specifically
   when testing two accounts at once. Fixed by resetting `destroyed` in `connect()`, and added
   reconnect-with-capped-exponential-backoff for genuine transient drops.

A second follow-up round fixed six more issues found in testing:

6. Notes share badge (`Shared · <owner> · <role>`) now shows the owner's **name**, not email —
   added `owner_name` to the page response.
7. Notes with no cover: Share/Export PDF/`+ Cover` were two separately-floating absolutely
   positioned elements landing on top of each other. They're now one row, in normal document flow
   (not overlaid), Share and Export PDF to the left of `+ Cover`.
8. Notes share popover was hugging the right edge of the screen — anchored with `align="end"` so
   it opens to the left of its trigger instead of past it.
9. **Root cause of two calendar complaints at once**: the "Edit calendar" popover used
   `matchAnchorWidth`, pinning it to the ~200px width of the narrow sidebar row it's anchored to.
   That's too narrow for a 3-button `Share / Delete / Done` action row, which then overflowed the
   popover's own box uncontained — reported as both "Share · 1 doesn't fit on one line" and the
   popover looking "cut by the time grid" (the overflowing buttons had no popover background under
   them, so the grid showed through). Fix: dropped `matchAnchorWidth`, letting the popover use its
   own comfortable `max-width`; tightened `.cal-card-actions` button padding/font and added
   `white-space: nowrap` as a backstop.
10. Calendar visibility toggle for a calendar **shared with you** updated the sidebar display but
    never actually filtered events in the time grid — `GET /api/events` filtered by
    `Calendar.is_visible` (the owner's row) only, never consulting a recipient's own
    `ResourceShare.visible` override added earlier in this entry. Fixed by resolving each
    accessible calendar's effective visibility (owner's value, overridden by the viewer's own share
    row if set) before filtering events, via a new shared `_own_share_overrides()` helper also used
    by `calendar_response()`.
11. Opening `ShareManager`'s popover from inside another popover (the calendar edit menu) closed
    the parent popover immediately — each `Popover` portals to `document.body`, so a click inside a
    nested popover's content isn't DOM-contained by the parent popover's own div and read as an
    "outside click." Fixed in the shared `Popover`'s outside-click handler: a click is also
    considered "inside" if it lands within any element carrying the `.popover` class, not just this
    instance's own subtree.

## Why

User-reported UX friction on the sharing surfaces added in 0145 (button placement, unstyled
popover buttons, a popover visually trapped inside its parent popover) plus a live bug reproducing
consistently when two accounts collaborated on the same note simultaneously.

## Files touched

- `apps/web/src/components/ShareManager.tsx` — popover now uses `Popover` (portal, `align="end"`),
  added a head with close button, accepts `ownerName`.
- `apps/web/src/components/ShareManager.css` — removed ad-hoc absolute positioning, added
  `.primary`/`.danger` button rules and `.share-popover-head`.
- `apps/web/src/components/Popover.tsx` — outside-click handler now treats a click inside any
  `.popover`-classed element as "inside," so a nested popover (e.g. ShareManager's, opened from a
  button inside another popover) doesn't close its parent.
- `apps/web/src/modules/notes/PageView.tsx` — moved `.notes-page-actions` to a direct child of
  `.notes-page` (was nested in `.notes-page-head`) so it can anchor top-right over the cover;
  swapped JSX order (ShareManager first, Export PDF second); no-cover state now renders Share /
  Export PDF / `+ Cover` as one flow row instead of two overlapping absolutely-positioned pieces;
  passes `page.owner_name` to `ShareManager`.
- `apps/web/src/modules/notes/notes.css` — `.notes-page` gets `position: relative`;
  `.notes-page-actions` repositioned to `top/right` with a translucent backdrop when there's a
  cover, `position: static` flow row when there isn't; simplified `.notes-add-cover` (no longer a
  hover-reveal hint, now a persistent toolbar button); removed unused `.notes-add-cover-anchor`.
- `apps/web/src/modules/notes/types.ts` — `Page.owner_name`.
- `apps/web/src/modules/calendar/Sidebar.tsx` — moved `ShareManager` into `.cal-card-actions`;
  added `patchOwnShare`/`leaveCalendar`; added a second popover branch for non-owner calendars
  (color override + leave); routed the visibility-toggle swatch through `patchOwnShare` for
  non-owners; dropped `matchAnchorWidth` on both "Edit calendar" popovers.
- `apps/web/src/modules/calendar/Sidebar.test.tsx` — mocks `useAuth` (now used by `Sidebar`).
- `apps/web/src/modules/notes/NoteCollaboration.ts` — `connect()` resets `destroyed`; added
  reconnect-with-backoff; restructured `useNoteCollaboration` to build the relay inside the
  connect effect (avoids a `useMemo`-owned mutable instance, which the stricter
  `eslint-plugin-react-hooks` rules here disallow).
- `apps/web/src/styles.css` — `.cal-card-actions button` padding/font tightened, `white-space:
  nowrap` added.
- `apps/api/app/models.py` — `ResourceShare.visible` / `ResourceShare.color`, nullable overrides.
- `apps/api/alembic/versions/026_calendar_share_overrides.py` — adds those two columns.
- `apps/api/app/routes/calendar.py` — new `_own_share_overrides()` helper shared by
  `calendar_response()` (overlays is_visible/color for the response) and `get_events()` (actually
  filters events by the resolved effective visibility, not just the owner's `Calendar.is_visible`);
  new `SelfSharePatch` model and `PATCH /calendars/{id}/my-share` route; `delete_calendar_share`
  now permits self-leave.
- `apps/api/app/routes/notes.py` — `PageResponse.owner_name`, populated from `User.username`.
- `apps/api/tests/test_sharing.py` — covers the override/self-leave flow, and asserts the
  visibility override actually filters `/api/events` (not just the sidebar's `is_visible` flag).
- `docs/architecture/DATABASE.md` — documents the two new `resource_shares` columns.

## How the pieces connect

`ShareManager` is a single component reused by both the Notes page and the Calendar sidebar, so
fixing its popover mechanics (portal via `Popover`) and button styling fixes both surfaces at
once. Calendar visibility/color used to be a single mutable value on the `Calendar` row shared by
everyone with access; the new `ResourceShare.visible`/`.color` columns let a recipient express "in
my view" without touching the owner's row — `calendar_response()` is the single place that
resolves "owner's value vs. my override" for every calendar list/detail response. The websocket
fix lives entirely in `NoteRelay`/`useNoteCollaboration`; nothing on the backend needed to change,
since the earlier investigation confirmed `collaboration.py`'s connection tracking already
supports multiple concurrent users per page.

## How to modify this later

- To add another per-recipient calendar override (e.g. a personal display name), extend
  `ResourceShare` the same way: nullable column, overlay it in `calendar_response()`, expose it
  through `SelfSharePatch` and the `my-share` route.
- `ShareManager` intentionally still uses native `<select>` for role pickers — swap for the
  `Dropdown` component only if that becomes a real pain point; skipped here as out of scope.
- If the websocket still misbehaves in production (not dev/StrictMode), check
  `NoteRelay.scheduleReconnect()`'s backoff and `apps/api/app/collaboration.py`'s in-memory
  connection registry (documented there as intentionally single-process — a `ponytail:` note marks
  the upgrade path if multi-process/horizontal scaling is ever needed).
