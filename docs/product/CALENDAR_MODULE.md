# Calendar Module — Deep Dive

## 1. Data Model

Two core tables: `Calendar` (a "bucket" of events — Personal, Work, your synced Google
calendar, etc.) and `CalendarEvent`.

```
Calendar
  id            UUID
  name          string            # "Personal", "Work", "Synced – Google Primary"
  color         string            # hex, default color for events in this calendar
  source        "local" | "google"
  google_calendar_id   string | null
  is_visible    bool              # toggle shown/hidden in UI, per-calendar
  sync_token    string | null     # Google incremental sync cursor

CalendarEvent
  id                    UUID
  calendar_id           FK -> Calendar
  title                 string
  description           jsonb     # block-based content — SAME editor as Notes (see §5)
  location               string | null
  start_at               timestamptz
  end_at                 timestamptz
  all_day                bool
  timezone               string    # IANA tz, e.g. "Europe/Stockholm"
  color_override          string | null   # per-event color, overrides calendar default

  # Recurrence
  rrule                  string | null    # RFC5545 RRULE, e.g. "FREQ=WEEKLY;BYDAY=MO,WE"
  recurrence_id          UUID | null      # set on override rows, points to the master event
  recurrence_original_at timestamptz | null  # which occurrence this overrides
  is_cancelled_occurrence bool default false # deletes a single instance without touching the series

  # Google sync
  source                 "local" | "google"
  google_event_id        string | null
  google_etag            string | null
  last_synced_at         timestamptz | null

  created_at, updated_at, deleted_at
```

**Why store the description as the same block-JSON used by Notes?** This is what makes
"events and notes are linked" effortless — an event's description panel *is* a mini-page.
No separate rich-text system to maintain, and it means an event can contain a table,
a checklist, an embedded location, etc., for free.

---

## 2. Recurrence Strategy

Industry-standard approach (same one Google Calendar uses internally), not pre-generating
rows for every future occurrence:

- A **master event** stores the `rrule`. No `recurrence_id` of its own.
- Instances are **expanded on the fly** for whatever date range the UI requests, using a
  `rrule` library (e.g. Python's `dateutil.rrule` or JS `rrule.js` on the frontend for
  preview).
- If you edit **one occurrence** ("just this Tuesday's meeting moves to 3pm"), the backend
  creates an **override row**: `recurrence_id` = master's id, `recurrence_original_at` =
  the original occurrence time, and its own `start_at/end_at/title/...`. When expanding,
  any occurrence matching an override's `recurrence_original_at` is replaced by the override.
- If you **delete one occurrence**, same override row but with `is_cancelled_occurrence = true`
  and it's simply skipped when rendering.
- Edit scopes exposed in the UI (same as Google Calendar / Notion Calendar):
  - "This event" → override row
  - "This and following" → splits the series: master's `rrule` gets an `UNTIL` added before
    this date, and a **new master** is created starting from this occurrence with the new
    settings
  - "All events" → edit the master directly

---

## 3. UI Behavior

### Views
- **Month** (default landing view), **Week**, **Day**, **Agenda/List**. Keyboard shortcuts:
  `M`/`W`/`D`/`A` to switch, arrows to navigate periods, `T` for today.
- Multi-day and all-day events render as a banner across the top of the affected days
  (not squeezed into hourly slots).
- Overlapping timed events in Week/Day view stack side-by-side (same algorithm as Google
  Calendar: greedy column assignment).

### Color system
- Each `Calendar` has a base color (toggle visibility per-calendar in a sidebar, like
  Google Calendar's checkbox list).
- Individual events can override with their own color (`color_override`) — this is the
  "more colors and functionality than Notion Calendar" you mentioned: e.g. color by
  *type* of activity (deep work, social, gym, finance deadline) rather than just by which
  calendar it came from.

### Event creation & detail
- **Quick create**: click/drag an empty slot → inline mini-form (title + time only,
  expand for more).
- **Full detail panel** (slide-over, not a clunky modal): title, date/time with a visual
  recurrence builder ("Repeats: every week on Mon, Wed" with plain-language editing, not a
  raw RRULE box), location, the block-based description editor, color, and a **"Linked"**
  section showing any notes/transactions/logs connected to this event via the generic
  `Link` table — with a button to create a new linked note directly from there.
- Drag to move an event, drag the bottom edge to resize duration.

### Cross-module connection drafts

The event editor can prepare structured details for a related Note, Finance transaction,
Fitness session, or Food log. These values live in `CalendarEvent.connections` until the
corresponding module exists. They are creation drafts, not graph edges.

When a target module is implemented, saving an enabled connection must transactionally:

1. create or update the real module record;
2. create the generic `Link` row from the event to that record; and
3. retain the event draft only as needed for editing/provenance.

Do not write placeholder `Link` rows: every `target_id` must identify a real target record.
Adding another life area extends the connections object and editor list without adding a
new boolean column to `CalendarEvent`.

---

## 4. Google Calendar Sync

- **OAuth2** connect flow; refresh token stored encrypted server-side.
- **Initial sync**: pull events in a window (e.g. −1 month → +6 months) via the Calendar
  API's `events.list`, store the returned `nextSyncToken`.
- **Incremental sync**: subsequent syncs call `events.list` with `syncToken` — Google
  returns only what changed (including deletions) since last sync. Much cheaper than
  re-pulling everything.
- **Push notifications**: register a `watch` channel pointing at a webhook endpoint on
  your VPS (Traefik already gives you HTTPS, so this is straightforward). On notification,
  trigger an incremental sync. **Polling fallback** every ~15 min in case a push is missed.
- **Outgoing changes** (you create/edit an event in *your* app on a Google-backed calendar):
  push to Google via `events.insert`/`update`, store the returned `google_event_id`/`etag`.
- **Loop prevention**: every sync compares `updated_at` (yours) vs the Google `updated`
  timestamp before deciding which side wins — since it's single-user, last-write-wins is
  good enough; no need for real conflict UI.

---

## 5. API Surface (sketch)

```
GET    /calendars
GET    /events?from=&to=&calendar_ids[]        # returns expanded instances in range
POST   /events
PATCH  /events/{id}?scope=this|following|all
DELETE /events/{id}?scope=this|following|all
POST   /events/{id}/links                       # { target_type, target_id, relation }
GET    /events/{id}/links

POST   /integrations/google/connect              # starts OAuth
GET    /integrations/google/callback
POST   /integrations/google/webhook              # push notification receiver
```

---

## 6. Edge Cases Worth Deciding Now

1. **Timezones while traveling** — events store an explicit `timezone`; rrule expansion
   respects DST transitions automatically if using a proper rrule library (don't hand-roll
   this).
2. **Natural-language quick-add** ("lunch with Marc tomorrow 1pm") — this overlaps with the
   Phase 5 AI capture work. Worth stubbing the input field now even if the NLP parsing
   comes later.

---

## 7. Multi-Calendar Setup (decided: yes, from day 1)

Default calendar set to seed on first run:

| Calendar | Source | Default color | Notes |
|---|---|---|---|
| Personal | local | warm orange | catch-all default |
| Work | local | blue | |
| Synced – Google Primary | google | (matches Google's own color) | created automatically on OAuth connect |
| Fitness | local | green | workout sessions, auto-populated from Fitness module logs (Phase 4) |
| Finance Deadlines | local | red | tax dates, invoice due dates, recurring bills — auto-created from Finance module (Phase 3) |

UI: left sidebar lists all calendars with a colored checkbox to toggle visibility — same
interaction pattern as Google Calendar, but each calendar's color is also used as the
*default* event color (overridable per-event as already specced in §3). New calendars can
be created freely later (e.g. "Studies", "Travel") without any schema change — it's just a
new row in `Calendar`.

One implication worth flagging: since Fitness and Finance modules will programmatically
create events on their own calendars (a workout log writes a Fitness-calendar event, a bill
due date writes a Finance-calendar event), the `CalendarEvent` API needs a `created_by`
concept (`"user"` vs `"system:fitness"` vs `"system:finance"`) so the UI can, e.g., warn
before letting you manually delete a system-generated event rather than its source log.
