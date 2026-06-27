# Fitness Module — Deep Dive

## 1. Core Data Model

```
Exercise                          # catalog, reusable across sessions
  id, name ("Pull-up","Bench Press"), category: "strength"|"cardio"|"mobility"
  unit: "reps"|"kg"|"km"|"min"|"reps+weight"

WorkoutSession
  id, date, type ("Push day","Pull day","Run"), notes (jsonb block content — same engine as Notes)
  linked_event_id  FK -> CalendarEvent | null    # auto-created on Fitness calendar (created_by: system:fitness)

SetEntry
  id, workout_session_id FK, exercise_id FK
  set_number, reps, weight, rpe (perceived effort, 1-10) | null, notes

BodyMetric
  id, date, weight, body_fat_pct | null, other measurements (jsonb, extensible — waist, arms, etc.)

Goal                                # powers progress bars
  id, target_type: "exercise_max" | "exercise_reps" | "body_metric"
  exercise_id | null, metric_key | null   # e.g. "weight", "pull_up_reps"
  target_value, target_date | null
  current_value   # computed from latest SetEntry/BodyMetric, not stored redundantly
```

**Progress bars as a reusable concept, not a one-off widget**: `Goal` is generic enough that
the same "progress" block type can be embedded in a Notes page too (per `NOTES_MODULE.md`'s
block system) — e.g. a "2026 Goals" page with live progress bars for pull-ups, deadlift,
body weight, all pulling from the same `Goal` records rather than being hand-updated text.

## 2. Statistics

All derived from `SetEntry`/`BodyMetric`, not separately maintained:
- **Personal records**: max weight at a given rep count per exercise, estimated 1RM
  (Epley/Brzycki formula) for barbell lifts.
- **Volume tracking**: total volume (sets × reps × weight) per session/week/month, charted
  over time — the actual "am I progressing" signal more than any single PR.
- **Exercise progression**: a line chart per exercise (e.g. pull-up reps over the last 6
  months) — exactly your stated example.
- **Body weight trend**: simple time series, with optional moving average to smooth
  day-to-day water-weight noise.

## 3. The Mi Band 9 — what's actually feasible right now

Worth being direct about this rather than assuming the obvious path still works: **Google
Fit's API (the bridge Mi Fitness has historically used to hand off data to third parties) is
being fully shut down by Google at the end of 2026** — new developer sign-ups already closed
back in May 2024. Building a fresh integration against it today means building toward a wall
that's already visible.

Four real paths, in order of how much they're worth pursuing first:

1. **Manual export / periodic CSV** (start here either way). Mi Fitness lets you view and
   export step/sleep/heart-rate history. Reuses the exact `ImportTemplate` system already
   designed for Finance (§9 of `FINANCE_MODULE.md`) — same mapping-once, dedupe-by-fingerprint
   mechanism, applied to a different data shape. Not automatic, but correct and zero
   dependency on a migration that's actively in motion.
2. **Apple Health, if you're on iPhone** — Mi Fitness has mature, official, bidirectional
   sync with Apple Health (Profile → Third-party data → Health), and this one's actually
   battle-tested, unlike the Google side which is mid-migration. The constraint is the same
   shape though: **HealthKit has always been on-device only** — Apple has never offered a
   cloud API for arbitrary third-party server access to it, by design. The practical path is
   Apple Health's built-in **"Export All Health Data"** feature (produces a zip with a full
   XML history) — periodically exported and imported through the same import pipeline as #1,
   just parsing XML instead of CSV.
3. **Health Connect + a thin Android companion**, if you're on Android. Same on-device-only
   constraint as HealthKit — the only way to get it onto our server is a small native Android
   app/service whose one job is to read Health Connect records and `POST` them to our API
   periodically. Real scope (a tiny Android app, not just a config toggle), but the most
   "automatic" path if this is your platform.
4. **Gadgetbridge** (open-source, talks to the Mi Band directly over Bluetooth, bypassing
   Xiaomi's cloud and any platform migration churn entirely). Worth checking their current
   device-support status for the Mi Band 9 specifically before relying on it.

**Confirmed: iPhone** — so the real build target is #1 + #2 (manual CSV import, extended to
parse Apple Health's "Export All Health Data" XML), not the Android/Health Connect path.
#3 stays documented above for completeness/future-proofing only, in case that ever changes.

My recommendation either way: build the manual import path (#1, extended to also parse
Apple's export XML if relevant) first since it's a near-zero-risk reuse of something already
designed, and revisit the native-companion route when we get to actually implementing this
module.

```
WearableMetric
  id, date, type: "steps" | "sleep_minutes" | "sleep_quality" | "resting_hr" | "hr_avg"
  value, source: "csv_import" | "health_connect" | "manual"
```
Kept as its own table rather than merged into `BodyMetric` — wearable data arrives in bulk,
daily, automatically (once a sync path exists), while `BodyMetric` is something you log
yourself a few times a week. Different cadence, different trust level, worth not conflating.

## 4. Calendar Integration

Logging a `WorkoutSession` auto-creates (or links to) a Fitness-calendar event — same
`created_by: system:fitness` pattern already established. Sleep/steps from `WearableMetric`
don't get individual calendar events (way too granular/noisy for that), but a daily summary
could optionally appear as an all-day event label if you want it visible at a glance.

## 5. API Surface (sketch)

```
GET/POST  /fitness/sessions
GET/POST  /fitness/sessions/{id}/sets
GET/POST  /fitness/body-metrics
GET/POST  /fitness/goals
GET       /fitness/stats/exercise/{id}        # PR history, volume, progression chart data
GET       /fitness/stats/body-weight
POST      /fitness/wearable-import            # reuses ImportTemplate
```
