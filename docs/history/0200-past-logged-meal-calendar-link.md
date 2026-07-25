# 0200 — Past logged meals stay linked to calendar occurrences

Date: 2026-07-25
Status: accepted

## What changed
Calendar event links now identify a meal by its canonical meal `date`, rather than preferring
the later `logged_at` action timestamp. Logging a planned meal after its calendar occurrence
therefore leaves it visible in that occurrence's Linked panel.

The recurring-event regression test now logs the scoped meal and verifies that the same meal
link remains visible for the original occurrence date.

## Why
Logging a meal after its planned calendar time set `logged_at` to the current time. The
recurring event link filter then compared that action date with the occurrence date and hid
the still-existing link, making the calendar integration appear broken.

## Files touched
- `apps/api/app/routes/notes.py` — uses the meal's canonical `date` for its linked-node title
  and occurrence-filter date, falling back to `logged_at` only for incomplete legacy data.
- `apps/api/tests/test_calendar.py` — verifies that changing an occurrence-linked meal from
  planned to logged does not move or hide its calendar link.

## How the pieces connect
Calendar-created meals store the event occurrence in both `date` and `scheduled_at`. The food
API separately sets `logged_at` when the user records the meal. The event editor requests
links scoped to the opened recurring occurrence via `GET /events/{id}/links?on=YYYY-MM-DD`;
the notes route resolves each meal's canonical `date` for that comparison, so the generic
`Link` row remains visible regardless of when the logging action happened.

## How to modify this later
Keep `MealLog.date` as the day the meal belongs to and `MealLog.logged_at` as the audit
timestamp for the logging action. If link scoping changes, update `_node_details` and
`test_event_links_scoped_to_occurrence_date` together so linked-node titles and occurrence
filtering continue to use the same canonical day.
