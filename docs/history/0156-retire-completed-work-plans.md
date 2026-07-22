# 0156 — Retire completed work plans into permanent history

Date: 2026-07-22
Status: accepted

## What changed

Removed completed implementation plans from `docs/work/plans/` after confirming their shipped behavior is already documented in permanent history. This retires the component architecture, Food page, Notes module, account sharing, and multi-photo meal-log plans. The in-progress Fitness/Food roadmap remains in the work folder.

The stale history-index link for entry 0154 was also corrected to point to its actual file.

## Why

The work folder should describe active work, not duplicate accepted implementation records. Keeping completed plans beside in-progress plans made the project state ambiguous and left multiple sources of truth for behavior that has already shipped.

## Files touched

- `docs/work/plans/COMPONENT_ARCHITECTURE_PLAN.md` — removed; implementation is recorded by histories 0009 and 0048.
- `docs/work/plans/FOOD_PAGE_PLAN.md` — removed; the module and follow-up fixes are recorded by histories 0116–0127.
- `docs/work/plans/NOTES_MODULE_PLAN.md` — removed; the completed Notes phases are recorded by histories 0010–0037.
- `docs/work/plans/SHARED_SYSTEM.md` — removed; PDF export, account sharing, and collaboration work are recorded by histories 0145–0146.
- `docs/work/plans/MULTI_PHOTO_MEAL_LOG_PLAN.md` — removed; implementation is recorded by history 0148.
- `docs/work/plans/MULTI_PHOTO_MEAL_LOG_UX_HANDOFF.md` — removed; the completed visual pass is recorded by history 0151.
- `docs/work/NOW.md` — replaced completed-plan references with permanent history references.
- `docs/history/CHANGELOG.md` — indexed this archive entry and corrected the 0154 link.

## How the pieces connect

`docs/work/plans/` now retains only work that is still active or intentionally upcoming. The history index links this retirement record, while the referenced implementation entries remain the authoritative explanation of the shipped code, migrations, tests, and UX decisions.

## How to modify this later

Create new plans only for unfinished work. When a plan is fully implemented, confirm that its code changes have accepted history entries, add any unique lasting context to history, remove the plan, update `docs/work/NOW.md`, and verify that no current documentation still depends on the removed file.
