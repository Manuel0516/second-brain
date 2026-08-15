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
| source | String(20) | "local", "google", or "ics" (migration 024). |
| google_calendar_id | String(255)? | Remote Google calendar id for synced calendars. |
| sync_direction | String(10)? | "pull" (read-only mirror) or "push" (two-way). Null for local. |
| sync_token | Text? | Google incremental sync cursor (`nextSyncToken`); wiped on 410 to force a full resync. |
| last_synced_at | DateTime? | Last successful sync. |
| external_id | String(512)? | Stable id for the remote source (ICS feed identity). |
| ics_url | Text? | Feed URL for `source == "ics"` subscriptions. |
| etag | String(255)? | HTTP ETag of the last ICS fetch (skip unchanged feeds). |

Mirrored calendars (`source != "local"` with `sync_direction == "pull"`) reject local
event edits with 403 — the sync layer owns their events.

---

### `google_accounts`
One row per user's connected Google account (migration 024).

| Column | Type | Description |
|--------|------|-------------|
| user_id | UUID FK | Owner. Unique — one Google account per user. |
| access_token | Text | Fernet-encrypted with `GOOGLE_TOKEN_ENCRYPTION_KEY`. Never stored plain. |
| refresh_token | Text | Fernet-encrypted. |
| token_expires_at | DateTime | Access-token expiry; refreshed automatically. |
| email | String(255)? | Google account email for display in Settings. |

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
| visual_style | String(16) | "neon" (default) or "monochrome". Independent of `theme` — see `docs/design/STYLE_GUIDE.md`. |
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
| food_daily_meal_goal | Integer | Default 5. Number of planned meal slots per day. |
| food_calorie_target | Integer? | Daily calorie target. |
| food_protein_target_g | Float? | Daily protein target in grams. |
| food_carbs_target_g | Float? | Daily carbs target in grams. |
| food_fat_target_g | Float? | Daily fat target in grams. |
| food_water_target_units | Integer? | Daily water target in units. |
| food_veg_target_units | Integer? | Daily vegetable target in units. |
| food_fruit_target_units | Integer? | Daily fruit target in units. |
| fitness_stats_range_days | Integer | Default 90. How many trailing days the fitness overview/exercise graphs cover. |
| food_stats_range_days | Integer | Default 90. How many trailing days the food stats graphs cover. |

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

### `resource_shares`
Explicit grants from a calendar or page owner to one existing account.

| Column | Type | Description |
|--------|------|-------------|
| resource_type / resource_id | String / UUID | The shared `calendar` or `page`. |
| recipient_user_id | UUID FK | Account receiving access. Unique with the resource. |
| role | String(8) | `viewer` or `editor`. Owners are represented by the resource row, not a share row. |
| visible | Boolean? | Calendar shares only. Recipient's own show/hide override; null inherits the owner's `Calendar.is_visible`. |
| color | String(7)? | Calendar shares only. Recipient's own color override; null inherits the owner's `Calendar.color`. |
| created_at / updated_at | DateTime | Grant audit timestamps. |

Indexes support recipient lookups and checks for a particular resource.

---

### `note_collaboration_updates`
Durable opaque Yjs updates for a shared note. The browser merges these CRDT updates and writes
the resulting Tiptap JSON snapshot back to `pages.content`, preserving normal note rendering,
search, and browser PDF export.

| Column | Type | Description |
|--------|------|-------------|
| page_id | UUID FK | Note receiving the update. ON DELETE CASCADE. |
| update | Binary | Yjs-compatible CRDT update. |
| created_at | DateTime | Replay order. |

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
| size | Integer | Bytes. Uploads are capped at 50 MB. |
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
Daily body measurements: weight and extensible measurement values.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key. |
| user_id | UUID FK | Owner. |
| date | DateTime | Measurement date (UTC). |
| weight | Float? | Body weight (kg.decimals). |
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

### `meal_logs`
One row per meal — planned or logged. Ordered photo associations live in `meal_log_photos`.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key. |
| user_id | UUID FK | Owner. |
| date | DateTime | When the meal was logged or planned for (UTC). |
| meal_type | String(20) | "breakfast", "lunch", "dinner", or "snack". Enforced in API layer. |
| slot_index | Integer | Position within the day for slot-based planning. Default 0. |
| status | String(20) | "planned" or "logged". Default "planned". |
| scheduled_at | DateTime? | Mirrors linked calendar event start for planned meals. |
| logged_at | DateTime? | When the meal was actually logged. |
| calories | Float? | Total calories for the meal. |
| protein_g | Float? | Protein in grams. |
| carbs_g | Float? | Carbs in grams. |
| fat_g | Float? | Fat in grams. |
| water_units | Integer | AI-detected water units for this meal. Default 0. |
| veg_units | Integer | AI-detected vegetable units for this meal. Default 0. |
| fruit_units | Integer | AI-detected fruit units for this meal. Default 0. |
| notes | Text? | Free-text notes. |
| ai_items | JSON? | Raw AI item breakdown `[{name, quantity, calories, ...}]` for the edit view. |
| created_at / updated_at | DateTime | UTC timestamps. |

---

### `meal_log_photos`
Ordered images attached to a meal. The API limits each meal to 15 photos and validates that every
file is an image owned by the same user as the meal.

| Column | Type | Description |
|--------|------|-------------|
| meal_log_id | UUID FK | Parent meal. Part of the composite primary key; cascades on meal deletion. |
| file_id | UUID FK | Attached `files` row. Part of the composite primary key and globally unique. |
| position | Integer | Zero-based display and AI-analysis order; unique within the meal. |

---

### `food_daily_extras`
Per-day quick-log totals for water, vegetables, and fruit outside meals. One row per user per day (unique constraint on `user_id, date`).

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key. |
| user_id | UUID FK | Owner. |
| date | Date | The day (date only, no time). |
| water_units | Integer | Quick-logged water units for the day. Default 0. |
| veg_units | Integer | Quick-logged vegetable units for the day. Default 0. |
| fruit_units | Integer | Quick-logged fruit units for the day. Default 0. |
| created_at / updated_at | DateTime | UTC timestamps. |

---

### Embedded AI agent tables

- `ai_conversations` and `ai_messages` persist user-scoped chat history, assistant tool calls,
  matching tool results, and confirmation status.
- `ai_settings` is a user-keyed singleton for chat/embedding providers, models, endpoints,
  dimensions, and autonomy settings. `web_fetch_enabled` (default `false`) gates the agent's
  `web_fetch` tool — off by default since it's the only tool that reaches the open internet
  rather than this app's own API; see `apps/api/app/modules/ai/web.py`.
- `ai_memories` stores durable facts injected into every later conversation, categorized
  (`fact`|`profile`|`preference`|`correction`) via the `category` column — profile/preference/
  correction entries render as an identity block ahead of recent facts in the system prompt.
- `ai_skills` stores user-scoped named markdown procedures; names are unique per user. Includes
  a seeded `memory-consolidation` skill the agent loads on request to collapse old `fact` rows
  into a `preference`.
- `ai_actions` records gated and automatic writes, risk/origin, confirmation progress, original
  tool-call context, affected entity, undo pre-image, and status.
- `ai_tools` stores agent-visible tools defined as declarative specs (method + path + args),
  executed by a generic runner — never arbitrary code. Every spec is validated against the app's
  own registered routes at create time. `source` distinguishes seeded (`system`) specs from
  tools the agent created for itself (`agent`); `enabled` lets either be turned off without
  deleting the row.
- `ai_search_documents` is the user-scoped hybrid retrieval index for pages, events, meals, and
  workouts: normalized text/content hash plus an optional pgvector embedding.
- `device_grants` implements OAuth-style device authorization for machine clients (the Telegram
  bot): a hashed `device_code` the client polls with, a human-friendly `user_code` shown on the
  approval page, and after approval a one-time bearer `bot_token` (delivered once via the status
  poll, hash stored for authentication). Grants expire after 10 minutes while pending.

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
| 021 | Dropped body_metrics.body_fat_pct (weight-only body metrics) |
| 022 | Food core: meal_logs, food_daily_extras, food_* settings |
| 023 | fitness_stats_range_days and food_stats_range_days on user_settings |
| 024 | Calendar sync: google_accounts table; sync columns on calendars (google_calendar_id, sync_direction, sync_token, last_synced_at, external_id, ics_url, etag) and calendar_events (external_id, external_etag) |
| 025 | Account-to-account calendar/page sharing plus durable Yjs note collaboration updates |
| 026 | Per-recipient visibility and color overrides for shared calendars |
| 027 | Ordered multi-photo meal attachments; replaces `meal_logs.photo_file_id` |
| 028 | `visual_style` (neon/monochrome) on user_settings |
| c3b8d4b570e2 | Embedded AI conversations, messages, settings, memories, skills, and actions |
| 029 | `device_grants` — OAuth-style device authorization for the Telegram bot |
| 030 | `ai_tools` — declarative spec tools the agent can create/enable/disable for itself |
| 031 | `ai_memories.category` — fact/profile/preference/correction memory categorization |

Always check `alembic current` before writing a new migration.
