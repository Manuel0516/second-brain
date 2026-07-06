# 0115 — Food module scaffold + fitness close-out docs

Date: 2026-07-06
Status: accepted

## What changed

Fitness (F1–F3 plus settings, goal reordering, and mobile polish) is closed
out as done across the docs, and the Food module gets its minimal scaffold
so implementation can start directly from Phase G1 next session:

- Backend: `apps/api/app/routes/food.py` — empty `APIRouter(prefix="/api/food")`,
  registered in `main.py`. No endpoints yet.
- Frontend: `AppRail.tsx` — disabled "Food" rail button (`IconFood` +
  `RailBtn`, same non-interactive pattern already used for "Finance") between
  Fitness and the settings button.
- Docs: `docs/ROADMAP.md` (Milestone 4 status + checklist), `docs/work/NOW.md`
  (Fitness moved from "up next" into a closed "Active work" entry, Food is
  now priority 1), `docs/work/plans/FITNESS_FOOD_MODULE_PLAN.md` (status
  header + Phase-breakdown intro rewritten — F1/F2/F3 done, G1/G2 next).

## Why

User request: fitness work is finished for now, close it out in the docs,
and get the repo ready to start on the Food page next.

## Files touched

- `apps/api/app/routes/food.py` — new, empty router stub.
- `apps/api/app/main.py` — imports and registers `food.router`.
- `apps/web/src/components/AppRail.tsx` — added `IconFood` + disabled "Food"
  rail entry.
- `docs/ROADMAP.md` — Milestone 4 status updated, fitness/food checklist
  items added.
- `docs/work/NOW.md` — Fitness close-out entry, Food scaffold entry, "Up
  next" reordered.
- `docs/work/plans/FITNESS_FOOD_MODULE_PLAN.md` — status header and Phase
  breakdown intro updated to reflect F1–F3 done, G1/G2 active.
- `docs/history/0114-goal-card-no-select-on-drag.md` — added (previously
  uncommitted-to-history change from commit `7d77304`).
- `docs/history/CHANGELOG.md` — 0114 and 0115 rows added.

## How the pieces connect

The Food rail button and API router follow the exact same shape Fitness used
before it had real routes — `RailBtn` with no `onClick`/`active` (matching
Finance's still-disabled entry), and an `APIRouter` registered in `main.py`
with zero routes, ready for Phase G1 to fill in
(`GET/POST /api/food/logs`, `/water`, `/targets`, `/summary`).

## How to modify this later

Building Phase G1: add the `food_logs`/`water_logs`/`nutrition_targets`
migration (next number after `021`), fill in `food.py`'s endpoints per
`docs/product/FOOD_MODULE.md` §1 and the plan's Phase G1 section, then flip
the rail button to `active`/`onClick` and the `/settings/food` nav entry's
`disabled: true` (`SettingsLayout.tsx`) once the page exists.
