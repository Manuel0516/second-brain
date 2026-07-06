# 0071 — Fitness page load guard

Date: 2026-07-05
Status: accepted

## What changed

Normalized the body-weight statistics response before it reaches the Fitness page. Missing or
malformed `metrics` and `trend` values now fall back to an empty series and no trend instead of
crashing the page.

## Why

The sidebar read `bodyWeightData.metrics.length` whenever a saved body metric existed. A
malformed stats payload left `metrics` undefined and blanked the entire Fitness page.

## Files touched

- `apps/web/src/modules/fitness/api.ts` — validates the body-weight response shape at the API boundary.
- `apps/web/src/modules/fitness/__smoke.test.tsx` — reproduces malformed stats alongside saved metric data and verifies the page stays mounted.
- `apps/web/src/modules/fitness/LiveSession.tsx` — received required Prettier-only formatting.
- `apps/web/src/modules/fitness/LiveSession.test.tsx` — checks the redesigned completion button through its accessible pressed state.
- `apps/api/app/routes/fitness.py` — corrected cardio row annotations found by the required API check.
- `apps/api/app/routes/calendar.py` — specified the existing ProseMirror helper's return type.

## How the pieces connect

Both `Fitness` and `Overview` consume `fetchBodyWeightStats`. Normalizing in that shared helper
keeps both callers aligned with the `BodyWeightStats` TypeScript contract.

## How to modify this later

Extend the response normalization in `fetchBodyWeightStats` if the endpoint adds fields. Keep
malformed-response coverage in the Fitness smoke test so API drift cannot blank the page.
