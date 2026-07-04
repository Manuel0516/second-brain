# 0052 — Fitness/Food module prep + duplicate-file follow-up

Date: 2026-07-04
Status: accepted

## What changed
1. Removed two more stray `" 2"` duplicate files (same macOS "keep both copies"
   pattern as history 0047, apparently reintroduced by a later sync/save):
   `apps/api/app/storage 2.py` and `apps/api/app/routes/files 2.py`. Both were
   byte-identical to their originals and unreferenced by any import.
2. Added `docs/work/plans/FITNESS_FOOD_MODULE_PLAN.md` — a self-contained build
   plan for Roadmap Milestone 4 (Fitness + Food), written in the same phased
   format as `NOTES_MODULE_PLAN.md`. It reconciles the FK sketches in
   `FITNESS_MODULE.md`/`FOOD_MODULE.md` with this project's actual generic
   `Link`-table convention (`DATABASE.md`), breaks the work into phases
   (Fitness core → goals/stats → Food core → Recipes-as-Notes-database →
   calendar wiring), and explicitly defers wearable import (blocked on
   Finance's not-yet-built `ImportTemplate`) and AI food capture (Phase 5).
3. Reprioritized `docs/work/NOW.md`'s "Up next" list: Fitness + Food now leads,
   ahead of Finance, per explicit user request. Finance, TOTP UI, Google
   Calendar sync, and the remaining Notes deferrals all moved down one slot.
4. Removed `docs/work/plans/NOTES_MEDIA_AND_LAYOUT_PLAN.md` (Plan E). It was
   marked COMPLETE as of 2026-07-03 and every detail (including the deltas
   from the plan as originally written) is already captured in history
   entries 0030–0033, making the standalone plan file redundant. Updated the
   one remaining pointer to it in `NOTES_MODULE_PLAN.md` ("Next work is Plan
   E...") to reference the history entries directly instead of a file that no
   longer exists.

## Why
User asked to close documentation on the just-finished Notes/animation work
and prepare the project for "a huge update": building the gym and food pages
next, ahead of Finance's roadmap position. Once everything was captured in
history, the now-redundant Notes media/layout plan file was removed too,
continuing the same close-out pattern used for `COMPONENT_ARCHITECTURE_PLAN.md`
(history 0048).

## Files touched
- `apps/api/app/storage 2.py` — deleted (dead duplicate).
- `apps/api/app/routes/files 2.py` — deleted (dead duplicate).
- `docs/work/plans/FITNESS_FOOD_MODULE_PLAN.md` — new build plan.
- `docs/work/NOW.md` — priority reorder.
- `docs/work/plans/NOTES_MEDIA_AND_LAYOUT_PLAN.md` — deleted.
- `docs/work/plans/NOTES_MODULE_PLAN.md` — updated dangling reference to point
  at history 0030–0033 instead of the deleted file.

## How the pieces connect
No production code changed. This is pure prep and documentation housekeeping:
a plan doc for the next feature body of work, a repeat of the 0047 cleanup
that a later save reintroduced, and removal of a plan file whose content is
now fully redundant with history. `docs/work/plans/` holds only plans that are
either active (`FITNESS_FOOD_MODULE_PLAN.md`) or closed-but-kept-for-context
(`NOTES_MODULE_PLAN.md`, `COMPONENT_ARCHITECTURE_PLAN.md`).

## How to modify this later
Start implementation at Phase F1 in `FITNESS_FOOD_MODULE_PLAN.md`. If the
`" 2"` file pattern shows up again, it's worth checking whatever editor/sync
tool keeps producing "keep both copies" conflicts (iCloud Drive/Dropbox on
macOS is the usual source) rather than cleaning it up a third time. If another
completed plan file is ever removed, grep the whole `docs/` tree for its
filename first so no other document is left pointing at a dead file.
