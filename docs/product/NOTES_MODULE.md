# Notes / Pages Module — Deep Dive

## 1. Key Architectural Decision: Blocks Are Polymorphic

Rather than giving `Page` its own content field and `CalendarEvent` a separate one (as
loosely sketched in the Calendar doc), both should point at the **same `Block` table**
through a generic owner reference. One editor component, one storage system, used
everywhere content can appear — pages, event descriptions, and later fitness/food log
notes.

```
Block
  id              UUID
  owner_type      "page" | "event" | "fitness_log" | "food_log" | ...
  owner_id        UUID
  parent_block_id UUID | null     # for nested blocks (toggle lists, nested bullets)
  type            "paragraph" | "heading_1/2/3" | "bulleted_list" | "numbered_list" |
                  "todo" | "toggle" | "quote" | "callout" | "divider" | "code" |
                  "image" | "file" | "table" | "spreadsheet" | "location" |
                  "page_mention" | "event_mention" | "transaction_mention"
  content         jsonb            # shape depends on `type`
  position        string           # fractional index (see §4), enables O(1) reordering
  created_at, updated_at
```

This is what makes "I should be able to access notes in some other way too, with pages"
and "events and notes must be linked" the *same mechanism* instead of two systems bolted
together.

---

## 2. Pages

```
Page
  id              UUID
  parent_page_id  UUID | null      # infinite nesting, like Notion's sidebar tree
  workspace_id    FK
  title           string
  icon            string | null    # emoji or uploaded icon
  cover_image_id  UUID | null
  type            "page" | "database"
  is_template     bool default false
  created_at, updated_at, deleted_at (soft delete → trash/restore)
```

- A plain **page** just owns a list of `Block` rows (rendered top-to-bottom, like a
  Notion doc).
- A **database** page additionally owns a schema (`DatabaseProperty`) and a set of
  **records** — each record is itself a `Page` with `parent_page_id` = the database, so a
  database row can always be "opened" as a full page with its own blocks underneath. This
  mirrors exactly how Notion databases work and is why it feels so flexible there.

```
DatabaseProperty
  id, page_id (FK -> database Page)
  name            string            # "Status", "Due Date", "Category"
  type            "text" | "number" | "select" | "multi_select" | "date" |
                  "checkbox" | "relation" | "person" | "formula" | "url"
  config          jsonb             # select options, relation target, formula expression

DatabaseView
  id, page_id
  type            "table" | "board" | "calendar" | "gallery" | "list"
  filters, sort, group_by   jsonb
```

`type: "calendar"` view on a database is what lets, e.g., your "Recipes" database or
"Trips" database show up *as a calendar* without duplicating data — same `Link`/owner
pattern feeding into the actual Calendar module's render layer if a property is mapped to
a date.

---

## 3. Two different "table" needs — don't conflate them

You mentioned both "tables" (Notion-style) and "excel-like sheets." These solve different
problems and should be two distinct block/page types:

| | Database / Table block | Spreadsheet block |
|---|---|---|
| Use case | Structured lists: tasks, recipes, contacts, job applications | Real calculation: budget grids, formulas, cell references |
| Data shape | Rows = Pages with typed Properties | Raw grid of cells with formulas |
| Powers | Filtering, sorting, multiple views (board/calendar/gallery) | SUM/AVERAGE-style formulas, cell-to-cell refs |
| Backed by | `DatabaseProperty` + records-as-Pages | A dedicated `SpreadsheetBlock` content shape: `{cells: {"A1": {value, formula}}}`, rendered with a grid component (e.g. a lightweight HyperFormula-based widget) |

For your Finance use case specifically — most of it (transaction log, job income tracker)
is better served by a **Database** (so each transaction can carry properties, attached
receipts, tax tags, and still be queried/filtered) rather than a raw spreadsheet. Reserve
the Spreadsheet block for genuinely formula-driven things, e.g. a budget model with
percentages and projections.

---

## 4. Block Ordering: Fractional Indexing

Instead of an integer `order` column (which requires re-numbering every sibling block on
insert), `position` is a sortable string (e.g. `"a0"`, `"a1"`, `"a0V"` between them).
Inserting a block between two existing ones just computes a string that sorts between
their two positions — no cascading updates. This is the same technique Notion/Linear use
under the hood, and it matters once pages get long.

---

## 5. Location Block

```
content: {
  address: string,
  lat: number,
  lng: number,
  place_id: string | null   # for re-fetching live details later
}
```

Rendered as a small embedded map preview + address line. This is also what a "Restaurant"
or "Gym" page would use, and what a Food/Fitness log entry can reference via a
`location_mention` block or a `relation` property pointing at that page.

---

## 6. Linking System (ties everything together)

Two complementary mechanisms, both already introduced in the Architecture doc's generic
`Link` table:

1. **Inline mentions** — typing `[[` or `@` inside a block opens a search popover; selecting
   a page/event/transaction inserts a `page_mention`/`event_mention`/`transaction_mention`
   block-content reference *and* writes a row to `Link` (`relation: "mentions"`) so it shows
   up in backlinks even though it's embedded inline.
2. **Relation properties** — on a database, a property of type `relation` lets a record
   point at another page/database explicitly (e.g. a "Workout Log" record relates to a
   "Calendar Event"). Same underlying `Link` table, `relation` = the property name.

Every page (and event, per the Calendar doc) gets a **"Linked" panel**: a query over `Link`
showing everything pointing at it, regardless of which of the two mechanisms created the
connection. This panel is the actual "second brain" feel — you open any note and
immediately see every event, transaction, or other note connected to it.

---

## 7. API Surface (sketch)

```
GET    /pages/{id}
GET    /pages/{id}/children
POST   /pages
PATCH  /pages/{id}
DELETE /pages/{id}                       # soft delete -> trash

GET    /blocks?owner_type=&owner_id=     # full block tree for a page/event/log
POST   /blocks
PATCH  /blocks/{id}
DELETE /blocks/{id}
POST   /blocks/reorder                   # { id, new_position }

GET    /databases/{id}/properties
POST   /databases/{id}/properties
GET    /databases/{id}/views
POST   /databases/{id}/views

GET    /pages/{id}/backlinks
GET    /search?q=                        # Postgres full-text now, pgvector semantic later
```

---

## 8. Edge Cases Worth Deciding Now

1. **Autosave granularity** — debounce per-block PATCH (~500ms after typing stops) rather
   than full-page saves; keeps it feeling instant and avoids losing content on a crash.
2. **Database property type changes** — converting an existing property's type (e.g.
   text → select) needs an explicit migration step per record rather than silently
   reinterpreting stored values.
3. **Templates** — a template is just a `Page` with `is_template = true`; "Use template"
   duplicates its block tree under a new page. Worth having from day one for things like a
   recurring "Daily Note" or "Meeting Notes" structure.
4. **Trash/restore** — soft delete (`deleted_at`) rather than hard delete, with a Trash view
   and auto-purge after N days.
5. **Recurring event note linking** — when the calendar creates a linked note for an event
   that is part of a recurring series, the note must be linked to **all occurrences** of the
   series, not just the master event or a single override.

   **Implementation sketch:** the `Link` row's `source_id` points to the **master** event's
   UUID (the one with the `rrule`), never to an override. The "Linked" panel on the note side
   queries all `Link` rows where `source_id` = master event id, and the calendar side shows
   the note as attached to every expanded occurrence. If a user later splits the series
   ("this and following"), the old master's `rrule` gets an `UNTIL` and a new master is
   created — the `Link` row stays pointing at the original master for past occurrences, and
   a new `Link` row is created for the new master so future occurrences remain connected.

   **Deferred until:** the first time a user creates a linked note from a recurring event in
   the calendar UI. The current EventEditor already handles the `scope` concept for edits and
   deletes; linking follows the same pattern: "All events" → master link, "This event" →
   single-occurrence override link (stored on the override row).
