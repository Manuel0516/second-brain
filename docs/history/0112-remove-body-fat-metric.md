# 0112 — Remove body fat % metric, weight-only body metrics

Date: 2026-07-06
Status: accepted

## What changed

Removed `body_fat_pct` entirely from the Fitness module — database column,
API schemas, and every frontend surface that read or wrote it. Body metrics
now track weight only. This included dropping the dead "Body fat %" option
from the goal-metric picker (it never had working progress computation —
only `metric_key == "weight"` goals ever computed `current_value`), the BF %
input on the "Log Body Metrics" form, its display in the body-metric log
list and the sidebar's "last metric" summary, and the Overview tab's
metric-cycling chart (which now just shows body weight, no cycle arrows
since there's only one metric left).

## Why

User request: "remove the body fat metric from the log body metrics and
from the entire app in general I just want the weight as a body metric for
now."

## Files touched

- `apps/api/alembic/versions/021_drop_body_fat_pct.py` — new migration,
  drops `body_metrics.body_fat_pct` (down_revision `020`). Applied to the
  dev DB via `alembic upgrade head`.
- `apps/api/app/models.py` — removed `body_fat_pct` column from the
  `BodyMetric` model.
- `apps/api/app/routes/fitness.py` — removed `body_fat_pct` from
  `BodyMetricCreate`/`BodyMetricPatch`/`BodyMetricResponse`, from the
  `create_body_metric` constructor call, and from the `metric_list` dict
  comprehension in the `/fitness/stats/body-weight` endpoint.
- `apps/web/src/modules/fitness/api.ts` — removed `body_fat_pct` from the
  `BodyMetric` interface, `createBodyMetric`'s payload type, and
  `BodyWeightStats.metrics`.
- `apps/web/src/modules/fitness/BodyMetricForm.tsx` — removed the `bodyFat`
  state, its field in the create payload, and the "BF %" input.
- `apps/web/src/modules/fitness/fitness.css` — `.fit-metric-form-grid`
  narrowed from 4 columns (`1fr 1fr 1fr auto`) to 3 (`1fr 1fr auto`) now
  that the form only has date/weight/submit.
- `apps/web/src/modules/fitness/BodyMetricLog.tsx` — removed the
  `· {body_fat_pct}%` suffix from each log row.
- `apps/web/src/modules/fitness/Fitness.tsx` — removed the body-fat suffix
  from the sidebar's "last body metric" summary card.
- `apps/web/src/modules/fitness/Overview.tsx` — deleted `METRIC_KEYS`/
  `METRIC_LABELS` and the `metricIdx`/`cycleMetric` cycling (there's only
  one metric now); the body-weight trend card is hardcoded to weight, no
  prev/next arrows.
- `apps/web/src/modules/fitness/GoalsSection.tsx` — removed the "Metric"
  select (weight/body_fat) from the body-metric goal form; body-metric goals
  are implicitly weight goals now (`metricKey` state still defaults to and
  stays `'weight'`).
- `apps/web/src/modules/fitness/__smoke.test.tsx` — removed `body_fat_pct`
  from the body-metrics test fixture.
- `docs/architecture/DATABASE.md` — updated the `body_metrics` table
  description and column list; added migration `021` to the history table.

## How the pieces connect

`BodyMetric` flows from the DB model through the Pydantic response schema to
the frontend `BodyMetric` interface — all three needed the field removed in
lockstep or the API/frontend contract would drift. The goal system's
`metric_key` field on `body_metric`-type goals is unrelated to the removed
column (it's just a string tag used to label the goal); it still defaults to
`'weight'`, so existing/new body-metric goals continue working unchanged.

## How to modify this later

To bring back a second body metric (body fat % or otherwise), add the
column back via a new migration (see `021`'s `downgrade()` for the shape),
re-add it to the three Pydantic models in `fitness.py`, the `BodyMetric`/
`BodyWeightStats` types in `api.ts`, and re-introduce a metric-selector in
`Overview.tsx` (the removed `METRIC_KEYS`/`cycleMetric` pattern is a
reasonable template) plus the metric-picker `<select>` in
`GoalsSection.tsx`'s body-metric form. If the new metric should actually
affect goal progress, also add a branch for it in the goal `current_value`
computation in `fitness.py` (~line 328) — the old `body_fat` option never
had one, which is why it was safe to delete outright.
