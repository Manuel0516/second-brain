# 0208 — Live-session add-exercise UX and per-exercise remove

Date: 2026-08-12
Status: accepted

## What changed

Reworked the "add exercise" panel in the live workout session and added a way to remove a
whole exercise mid-session:

- The `.fit-add-exercise` panel was accidentally styled as a single horizontal flex row
  (`display: flex; align-items: center`) even though its JSX contains four stacked sections
  (search/add/cancel row, candidate grid, "+ Create" button, category picker). It now gets
  its own card-style container (`.fit-add-exercise` — grid, gap, padding, border, `popIn`
  entrance animation per the style guide's "every surface that appears must animate" rule)
  with the search/add/cancel row split into a `.fit-add-exercise-row` class.
- Removed the "+ Create "X"" button. The search input already mirrors its value into
  `exerciseName` on every keystroke, so the "Add" button was already enabled with the typed
  name — the Create button re-set the same value and did nothing functionally different. It
  was dead UI clutter.
- Tapping a candidate exercise card now adds it immediately (one tap) instead of only
  highlighting it and requiring a second tap on a separate "Add" button. `addExercise` now
  takes explicit `(name, category)` args so both the form submit (freeform typed name) and
  card taps (existing exercise) can call it directly. This matters mid-workout — fewer taps
  with sweaty hands/tired arms.
- Replaced inline layout `style={{...}}` attributes in the add-exercise form with real CSS
  classes, per the style guide's "never use inline styles for theming" rule.
- Added a dim "×" remove button to the left of "+ Set" in each live exercise card header,
  wrapped in a new `.fit-live-exercise-actions` flex container. It reuses the existing
  `.fit-remove-button` pattern (dim `--text-tertiary` by default, turns danger-red on hover)
  already used for set-level and goal-level deletes elsewhere in the module — no new CSS
  token or color introduced. No confirmation dialog, matching the existing swipe-to-delete
  set pattern in the same view.
- Added a mobile (`max-width: 720px`) rule so the search/Add/Cancel row wraps with full-width,
  44px-tall buttons instead of squeezing into one line.
- `mergeExerciseCandidates` (shared by both the live-session picker and `SessionWizard.tsx`)
  used to list every DB exercise first in whatever order the API returned them, then append
  the session type's curated defaults — so with a mixed-category DB, session-relevant
  exercises could end up buried and it read as "strength-only" whenever the visible-without-
  scrolling exercises all happened to be strength. It now buckets DB exercises by whether
  their category matches the session type's usual category (`cardio` for a Cardio session,
  `strength` otherwise), lists that matching bucket plus the type's curated defaults first,
  and appends every other exercise — any category — below. Nothing is hidden anymore, just
  reordered.
- Moved the category `Segmented` picker in the live-session add-exercise form from below the
  candidate grid to directly under the search row, so picking a category for a brand-new
  (not-yet-in-the-library) exercise name doesn't require scrolling past the whole grid first.
  The Add/Cancel buttons moved with it, below the category picker, so the panel now reads as
  one linear flow: search → category → confirm → browse candidates.

## Why

User request: review the add-exercise UX during a live gym session for style-guide
compliance and general polish, add a way to remove an entire exercise from an in-progress
session (previously only individual sets could be removed, via swipe), fix the exercise
picker so it surfaces all categories with session-relevant ones first instead of reading as
strength-only, and move the category picker next to where a new exercise name is typed.

## Files touched

- `apps/web/src/modules/fitness/LiveSession.tsx` — added `removeExercise`; refactored
  `addExercise(name, category)`; wired the new remove button into the exercise header; made
  candidate cards tap-to-add; dropped the dead "+ Create" button and inline layout styles;
  moved the category picker above the candidate grid.
- `apps/web/src/modules/fitness/fitness.css` — split `.fit-add-exercise` into its own
  card/entrance-animation rule instead of sharing the generic flex-row selector; added
  `.fit-add-exercise-row`, `.fit-live-exercise-actions`, and a mobile wrap rule for the
  search/Add/Cancel row; added `.fit-add-exercise` to the `prefers-reduced-motion` exemption
  list.
- `apps/web/src/modules/fitness/exerciseLibrary.tsx` — reordered `mergeExerciseCandidates` to
  bucket session-type-relevant exercises (matching category + curated defaults) first and all
  other known exercises after, instead of hiding non-matching categories behind DB fetch order.

## How the pieces connect

`LiveSession` is the only consumer of `.fit-add-exercise`/`.fit-ex-grid`/`.fit-ex-card` in
this flow (`SessionWizard.tsx` uses the same `fit-ex-card`/`fit-ex-create` classes for its own
pre-session multi-select exercise picker — that flow was left untouched since its UX shape,
select-many-then-confirm, is legitimately different from live one-at-a-time logging).
`addExercise` is called either from the form's `onSubmit` (freeform typed name + the category
Segmented control) or directly from a candidate card's `onClick` (name + category come from
the candidate itself). Both paths funnel into the same `onUpdate` call that appends to
`session.exercises`, so callers don't need to know which path was used.

`mergeExerciseCandidates` lives in `exerciseLibrary.tsx` specifically so the live-session
picker and `SessionWizard.tsx`'s pre-session picker stay on one exercise source — the
ordering fix there applies to both call sites automatically, no wizard-specific change needed.

## How to modify this later

- To add a confirmation step before removing an exercise (e.g. if users report accidental
  taps), wrap the `removeExercise` call in `LiveSession.tsx`'s header button — it's a single
  call site.
- The candidate-card tap-to-add behavior assumes the visible candidate list is trustworthy
  enough to add on a single tap; if that stops being true (e.g. a much longer candidate list),
  reintroduce a select-then-confirm step similar to `SessionWizard.tsx`'s pattern rather than
  reverting to the old two-click-same-panel version (which was broken, not merely different).
- `.fit-ex-card`/`.fit-ex-grid`/`.fit-ex-create` CSS is shared with `SessionWizard.tsx` —
  changes to those selectors affect both the live-session picker and the pre-session wizard.
