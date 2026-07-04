# Second Brain — Database Reference

> Every table, every column, in plain language.
> Source of truth: `apps/api/app/models.py`

---

## The big idea: the Link table

The most important architectural decision in this database: **a generic `Link` table connects
everything to everything**. No module needs to know about another module's tables. An event
links to a note through the `links` table, not through a foreign key.

```
event ──┐
        └── Link ──── page
note  ──┘
```

This means adding a new module (Finance, Fitness, Food) never requires changing existing
tables — you just start creating `Link` rows pointing to the new module's records.

---

## Tables

### `users`
One row per user. Currently single-user (you).

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| username | String(50) | Unique, indexed. Backfilled from email on creation. |
| email | String(255) | Unique, indexed. Used for login. |
| password_hash | String(255) | Argon2 hash. Never stored plain. |
| totp_secret | String(255)? | Encrypted TOTP secret, null if 2FA not set up. |
| role | String(20) | "user" or "admin". |
| is_active | Boolean | False = soft-disabled account. |
| created_at / updated_at | DateTime | UTC timestamps. |

---

### `login_attempts`
Audit log for rate limiting. Every login attempt (success or failure) is recorded.

| Column | Type | Description |
|--------|------|-------------|
| ip_address | String(45) | Supports IPv6. |
| success | Boolean | Whether the login succeeded. |
| attempted_at | DateTime | Indexed. Used to count attempts in a time window. |

---

### `refresh_tokens`
One row per active refresh token. When a user logs out or a token is rotated, `revoked_at`
is set. Expired and revoked tokens are not automatically purged (future cleanup job).

| Column | Type | Description |
|--------|------|-------------|
| user_id | UUID FK | Which user owns this token. |
| token_hash | String(255) | SHA-256 hash of the opaque token. Never stored plain. |
| revoked_at | DateTime? | Null = still valid. |
| expires_at | DateTime | After this, the token cannot be used even if not revoked. |

---

### `calendars`
A user can have multiple calendars (Personal, Work, etc.).

| Column | Type | Description |
|--------|------|-------------|
| user_id | UUID FK | Owner. |
| name | String(255) | Display name. |
| color | String(7) | Hex color, e.g. `#22d3ee`. |
| is_visible | Boolean | Whether events from this calendar show on the grid. |
| source | String(20) | "local" or "google" (for future Google sync). |

---

### `calendar_events`
The main event table. Supports one-off events and recurring series.

| Column | Type | Description |
|--------|------|-------------|
| calendar_id | UUID FK | Which calendar owns this event. |
| title | String(255) | Event title. |
| icon | String(32)? | Emoji icon. |
| description | Text? | Free text. |
| location | String(255)? | |
| start_at / end_at | DateTime | UTC. Indexed. |
| all_day | Boolean | If true, time portion is ignored in the UI. |
| timezone | String(63) | Stored for display purposes (e.g. "Europe/Stockholm"). |
| color_override | String(7)? | Per-event color. Null = inherit from calendar. |
| rrule | String(255)? | Recurrence frequency: DAILY / WEEKLY / MONTHLY / YEARLY. Null = one-off. |
| recurrence_interval | Integer | Repeat every N units. Default 1. |
| recurrence_byday | JSON | Array of weekday codes for weekly rules, e.g. `["MO", "WE"]`. |
| recurrence_count | Integer? | Stop after N occurrences. Mutually exclusive with `until`. |
| recurrence_until | DateTime? | Series stops before this occurrence. |
| recurrence_exdates | JSON | Array of skipped occurrence starts (ISO strings). |
| recurrence_parent_id | UUID FK? | If set, this row is an override for one occurrence of the parent series. |
| recurrence_overridden_at | DateTime? | Which occurrence this row overrides. |
| connections | JSON | Draft cross-module link intentions (notes, finance, fitness, food). Not real links yet — stored until target modules exist. |
| created_by | String(50) | `"user"` or `"system:fitness"`. Tags auto-created events vs user-created. |

**How recurring events work:**
- One row in the database per series (the "parent" event).
- On read, the API expands the rrule into virtual occurrences for the requested date range.
- To skip an occurrence: add its start to `recurrence_exdates`.
- To modify one occurrence: create a new row with `recurrence_parent_id` pointing to the
  parent and `recurrence_overridden_at` set to the original occurrence start. Add that
  original start to the parent's `recurrence_exdates`.

---

### `user_settings`
One row per user, created on first write (lazy creation).

| Column | Type | Description |
|--------|------|-------------|
| user_id | UUID PK+FK | One-to-one with `users`. |
| theme | String(10) | "dark", "light", or "system". |
| timezone | String(63) | Default "Europe/Stockholm". |
| week_start | String(8) | "monday" or "sunday". |
| default_view | String(8) | "week", "month", "day". |
| time_format | String(3) | "24h" or "12h". |
| favorite_emojis | JSON | Array of emoji strings the user has saved. |
| favorite_colors | JSON | Array of hex color strings the user has saved. |
| default_event_minutes | Integer | Default event duration when created by click (not drag). |
| default_calendar_id | UUID FK? | Which calendar new events are created in. |
| default_reminder_minutes | Integer? | Default reminder offset. |
| show_weekends | Boolean | Whether Sat/Sun show on the week grid. |
| dim_past_events | Boolean | Whether past events render at lower opacity. |
| notes_bullet_style | String(16) | Notes list marker: disc / circle / square / dash. |
| notes_numbered_style | String(16) | decimal / lower-alpha / upper-alpha / lower-roman / upper-roman. |
| favorite_text_colors | JSON | Array of hex colors saved for the notes toolbar's text color picker. |
| favorite_highlight_colors | JSON | Array of hex colors saved for the notes toolbar's highlight picker. |
| favorite_block_colors | JSON | Array of hex colors saved for the notes toolbar's block color picker. |
| favorite_covers | JSON | Array of favorite cover image URLs shown first in the page cover picker. |

---

### `pages`
Notes/pages module. Nested page tree (Notion-style).

| Column | Type | Description |
|--------|------|-------------|
| user_id | UUID FK | Owner. |
| parent_page_id | UUID FK? | Null = root-level page. Points to another page for nesting. |
| title | String(255) | Page title. Default "Untitled". |
| icon | String(16)? | Emoji icon shown in the tree and page header. |
| content | JSON | Tiptap v3 JSON document. The full block content of the page. |
| position | String(255) | Fractional index string for ordering sibling pages. |
| type | String(16) | "page" or "database". A database's records are its child pages. |
| is_template | Boolean | Template flag; "Use template" duplicates the subtree (copy is never a template). |
| cover | String(512)? | Cover preset token (e.g. "gradient:3") or image URL. No FK. |
| properties | JSON | Record property values keyed by `database_properties.id`. |
| deleted_at | DateTime? | Soft delete. Null = active. Set = in trash. Purged 30 days after deletion when the trash view is opened. |

---

### `database_properties`
Schema columns of a database page (`pages.type = "database"`).

| Column | Type | Description |
|--------|------|-------------|
| page_id | UUID FK | The database page. ON DELETE CASCADE. |
| name | String(255) | Property display name ("Status", "Due"). |
| type | String(32) | text, number, select, multi_select, date, checkbox, url, relation. |
| config | JSON | Type-specific config (select options, relation target). |
| position | String(255) | Fractional index string for column ordering. |

---

### `database_views`
Saved views of a database page.

| Column | Type | Description |
|--------|------|-------------|
| page_id | UUID FK | The database page. ON DELETE CASCADE. |
| name | String(255) | View display name. |
| type | String(32) | table, board, calendar, gallery, list. |
| config | JSON | Filters, sort, group_by, visible properties — one blob. |
| position | String(255) | Fractional index string for tab ordering. |

---

### `files`
User-uploaded files (images in notes today). The bytes live in MinIO under the
object key `{user_id}/{file_id}`; this table is the ownership/metadata index.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key; also the MinIO object key suffix. |
| user_id | UUID FK | Owner. Every read is ownership-checked. |
| name | String(255) | Original filename. |
| content_type | String(100) | Validated on upload (png/jpeg/gif/webp/svg). |
| size | Integer | Bytes. Uploads are capped at 10 MB. |
| created_at | DateTime | UTC. |

Served via `GET /api/files/{id}` (streamed from MinIO with long cache
headers). Deleting a note block does not delete its file — orphans are
acceptable for now (`# ponytail:` orphan sweep later).

---

### `links`
The generic cross-module graph edge. **The most important table for future modules.**

| Column | Type | Description |
|--------|------|-------------|
| source_type | String(50) | The type of the source node, e.g. "event", "page". |
| source_id | UUID | The ID of the source record (in whatever table `source_type` refers to). |
| target_type | String(50) | The type of the target node. |
| target_id | UUID | The ID of the target record. |
| relation | String(100) | What kind of link this is, e.g. "documents", "mentions", "logged_from". |

Unique constraint on `(source_type, source_id, target_type, target_id, relation)` — no
duplicate edges of the same type between the same two nodes.

**To link an event to a note:**
```python
Link(source_type="event", source_id=event_id,
     target_type="page", target_id=page_id,
     relation="documents")
```

**To find all notes linked to an event:**
```python
select(Link).where(
    Link.source_type == "event",
    Link.source_id == event_id,
    Link.target_type == "page"
)
```

---

### `exercises`
Exercise definitions. One row per exercise the user has defined. Created by the user through the fitness UI or imported from a wearable.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key. |
| user_id | UUID FK | Owner. |
| name | String(255) | Exercise name, e.g. "Bench Press". |
| category | String(20) | "strength", "cardio", or "mobility". |
| unit | String(20) | "reps", "kg", "km", "min", or "reps+weight". |
| created_at / updated_at | DateTime | UTC timestamps. |

---

### `workout_sessions`
One row per workout session (a single workout on a given day). Covers strength training sessions, runs, mobility sessions, etc.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key. |
| user_id | UUID FK | Owner. |
| date | DateTime | When the workout happened (UTC). |
| type | String(255) | Workout type, e.g. "Push day", "Pull day", "Run". |
| notes | JSON | Tiptap block content (same shape as `pages.content`). Free-form notes for the session. |
| created_at / updated_at | DateTime | UTC timestamps. |

---

### `set_entries`
Individual sets within a workout session. Linked to an exercise and a workout session. Weight/reps/RPE tracking.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key. |
| workout_session_id | UUID FK | Which session this set belongs to. |
| exercise_id | UUID FK | Which exercise was performed. |
| set_number | Integer | Set order within the session (1-indexed). |
| reps | Integer | Number of reps completed. |
| weight | Integer? | Weight in kg (null for bodyweight exercises). |
| rpe | Integer? | Rate of perceived exertion (1–10). |
| notes | String(500)? | Per-set notes. |
| created_at / updated_at | DateTime | UTC timestamps. |

---

### `body_metrics`
Daily body measurements: weight, body fat percentage, and extensible measurement values.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key. |
| user_id | UUID FK | Owner. |
| date | DateTime | Measurement date (UTC). |
| weight | Float? | Body weight (kg.decimals). |
| body_fat_pct | Float? | Body fat percentage. |
| measurements | JSON | Extensible measurement dict, e.g. `{"waist": 80, "arms": 35}`. |
| created_at / updated_at | DateTime | UTC timestamps. |

---

### `goals`
User-defined fitness goals. Target types point at exercise max weight, exercise max reps, or body metrics.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key. |
| user_id | UUID FK | Owner. |
| target_type | String(20) | "exercise_max", "exercise_reps", or "body_metric". |
| exercise_id | UUID FK? | The exercise this goal targets (for exercise types). |
| metric_key | String(50)? | The metric this goal targets (for body_metric type), e.g. "weight". |
| target_value | Float | The target numeric value. |
| target_date | DateTime? | Optional deadline for the goal. |
| created_at / updated_at | DateTime | UTC timestamps. |

---

## Migration history

| Number | What it added |
|--------|--------------|
| 001 | Initial schema: users, login_attempts, refresh_tokens, calendars, calendar_events |
| 002 | Username column added to users |
| 003 | UserSettings table |
| 004 | is_test_account column on users |
| 005–008 | (calendar refinements, recurrence fields) |
| 009 | (earlier notes-related) |
| 010 | Pages table + Link table |
| 011 | Database pages: pages.type/is_template/cover/properties + database_properties + database_views |
| 012 | Files table (MinIO-backed uploads for note images) |
| 013 | Notes list marker style preferences on user_settings |
| 014 | Favorite text/highlight/block colors and favorite covers on user_settings |
| 015 | Fitness core: exercises, workout_sessions, set_entries, body_metrics, calendar_events.created_by |
| 016 | Goals table for fitness goal tracking |

Always check `alembic current` before writing a new migration.
