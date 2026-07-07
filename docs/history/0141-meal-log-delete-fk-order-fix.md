# 0141 — Fix meal log deletion — FK ordering bug

Date: 2026-07-07
Status: accepted

## What changed

Deleting a logged meal (with a photo attached — i.e. any meal captured via the camera/AI
flow) failed in production with a Postgres foreign key violation. `delete_meal_log` in
`apps/api/app/routes/food.py` deleted the `files` row referenced by `meal_logs.photo_file_id`
*before* deleting the `meal_logs` row itself. `MealLog.photo_file_id` is a plain
`ForeignKey("files.id")` column with no ORM `relationship()` configured (consistent with this
codebase's "no relationships — routes query directly" pattern), so SQLAlchemy's unit-of-work
has no dependency graph to reorder these deletes automatically — it issues them in the order
`session.delete()` was called. Reordered the function to delete the meal log (and its `Link`
rows) first, then the file.

The bug was invisible in CI because the test database is SQLite via `aiosqlite`, which does
not enforce foreign key constraints unless `PRAGMA foreign_keys=ON` is explicitly set — which
this project's test fixtures don't do. Attempted to add that pragma globally in
`tests/conftest.py` to close this whole class of bug, but it also exposed a pre-existing,
unrelated ordering bug in `duplicate_page` (`apps/api/app/routes/databases.py`) that inserts
`database_properties` rows in a way that isn't guaranteed to run after their parent `pages`
insert. Fixing that is out of scope here, so the pragma change was reverted to avoid breaking
an unrelated feature's tests; only a targeted regression test for meal-log deletion was kept.

## Why

User-reported bug: "I cannot delete a meal." Root cause traced by reading the delete endpoint
and confirming (via `grep` across `models.py`) that no `relationship()` exists between
`MealLog` and `File` anywhere in the codebase.

## Files touched

- `apps/api/app/routes/food.py` — `delete_meal_log`: delete the `MealLog` row (and its `Link`
  rows) before deleting the referenced `File` row, so the FK constraint on
  `meal_logs.photo_file_id` is never violated mid-transaction.
- `apps/api/tests/test_food.py` — new file. Regression test: create a logged meal with a
  photo and a `Link` to a calendar event (mirroring how `calendar.py`'s
  `_create_linked_entries` connects planned meals to events), delete the meal, and assert:
  `204`, the `Link` row is gone, and the `CalendarEvent` still exists (deleting a meal must
  sever the connection, not cascade-delete the event it was scheduled from).

## How the pieces connect

`app/config.py` has no bearing here — this is purely an ordering issue inside a single
`AsyncSession` flush. Because `MealLog` and `File` are linked only by a raw FK column (per the
`# ponytail: no relationships — routes query directly` convention used throughout
`models.py`), any route that deletes both a parent and a child row referencing it must delete
child-before-parent explicitly in code — SQLAlchemy will not infer or reorder this itself
without a configured `relationship()`.

## How to modify this later

- Any future route that deletes a row with FK-referencing children (or that itself has an FK
  to another row also being deleted in the same request) must delete in dependency order by
  hand: children first, then the row they reference. Grep `models.py` for
  `# ponytail: no relationships` before assuming SQLAlchemy will handle ordering — it won't.
- The SQLite test DB still does not enforce foreign keys. If you want tests to catch this
  class of bug, enabling `PRAGMA foreign_keys=ON` in `tests/conftest.py`'s `test_engine`
  fixture will do it — but as of this writing it will also fail
  `test_duplicate_copies_subtree_and_remaps_property_ids` in `tests/test_databases.py`,
  which has the same underlying issue in `duplicate_page`. Fix that ordering bug first if you
  want to turn strict FK enforcement on.
