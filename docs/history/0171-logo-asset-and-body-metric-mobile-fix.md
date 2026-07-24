# 0171 — Logo asset and mobile body metric form fix

Date: 2026-07-24
Status: accepted

## What changed

The monochrome logo asset was renamed to the web-safe `logo-white.png` name and all shared
appearance mappings and active documentation were updated. The Body Metrics form now allows
date and weight inputs to shrink within their grid tracks and stacks them at narrow phone
widths, preventing iOS date-input sizing from making the fields overlap.

## Why

The white logo was unreliable on the user’s phone, and the native iOS date input could exceed
its grid track and collide with the weight field even though the Firefox device preview looked
correct.

## Files touched

- `apps/web/public/logo-white.png` — renamed monochrome logo asset.
- `apps/web/src/lib/appearance.ts` — points monochrome logo selection to the renamed asset.
- `apps/web/src/lib/appearance.test.ts` — verifies the renamed asset path.
- `apps/web/src/modules/fitness/fitness.css` — constrains Body Metrics inputs and stacks the
  form at narrow phone widths.
- `docs/design/STYLE_GUIDE.md` — updates the active monochrome logo reference.
- `docs/work/PLAN-visual-style-system.md` — updates the active visual-style plan reference.

## How the pieces connect

`AppRail` and `Login` both call `logoAssetFor`, so one corrected public path fixes the
monochrome logo in both locations. `BodyMetricForm` keeps its inline visual tokens and submit
logic; the shared `.fit-metric-form-grid` rules constrain its children without changing the
API payload or date/weight conversion.

## How to modify this later

Keep public asset names lowercase and update `logoAssetFor` plus its test together. If the
Body Metrics fields change again, preserve `min-width: 0` on the grid items and test a real
iOS viewport, because native date controls can have a larger intrinsic width than desktop
browser emulation.
