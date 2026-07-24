# 0169 — Calendar navigation and live set layout

Date: 2026-07-24
Status: accepted

## What changed

The calendar toolbar now uses the requested two-row distribution on desktop and mobile:
sidebar toggle, previous, date range, next, and Today on the first row; the Day/Week/Month
switch and new-event button on the second. Existing compact sizing was retained: 26px
navigation controls, a 34px add control, a 17px date title, and the same shared 300px
segmented-control proportions used by the Food and Fitness navbars.

Horizontal calendar gestures no longer replay the slide-and-fade load animation after the
cursor changes. Trackpad deltas are measured against the visible day-column width and
coalesced into one navigation update when the gesture settles. Touch swipes use the same
distance-based day count and give restrained live horizontal feedback before settling.
Arrow-button navigation keeps a shorter directional nudge without fading the calendar.

The Fitness live-session set card now follows an explicit Set, values, Feel, Note, Done
hierarchy. Strength units stay in the column headers instead of repeating inside each input,
note and completion each have a dedicated column, and the persistent remove control is gone.
Dragging a set row left now follows the pointer and snaps open to reveal one destructive `×`
action behind the card; vertical movement remains native page scrolling, while keyboard
focus also reveals the action. The mobile grid keeps all six visible controls on one line
with narrower value fields, a smaller completion control, deliberate spacing, and the
squarer small-radius token, with 32px square value and action controls for compact phone entry;
the neutral row shell prevents the destructive color from bleeding through when closed. The
feeling column is sized to contain its five controls, keeping spacing to reps and comments
consistent. The swipe shell owns a persistent neutral edge overlay so the red action fills
to the border only while revealed, without a closed-state bleed line.
Feeling controls keep their dot-only hover state so the hover treatment does not extend
outside the compact row.

The Log Past mobile editor now uses the same compact Fitness language: reps, weight, feeling,
and removal stay aligned in a compact row, with a smaller full-width note field underneath.

## Why

The previous calendar interaction replayed a load animation after every wheel/swipe gesture,
which made navigation feel like separate day-by-day page jumps. The toolbar controls were
also grouped differently from the supplied reference. The live-set card scattered its note
and action controls at the phone breakpoint and allowed the value boxes to grow too large,
so its visual order no longer matched the intended logging flow.

## Files touched

- `apps/web/src/pages/Calendar.tsx` — reorganized the toolbar, reused the shared segmented
  control, and separated gesture navigation from load-style animation.
- `apps/web/src/modules/calendar/TimeGrid.tsx` — added distance-aware wheel/swipe navigation
  and live gesture feedback.
- `apps/web/src/styles.css` — styled the compact two-row toolbar and calendar gesture motion.
- `apps/web/src/modules/fitness/LiveSession.tsx` — reordered live-set content, kept strength
  units out of the inputs, and added the swipe-to-reveal removal interaction.
- `apps/web/src/modules/fitness/LogPastModal.tsx` — owns the past-session editor whose mobile
  set-card structure is restyled by the shared Fitness stylesheet.
- `apps/web/src/modules/fitness/fitness.css` — refined live-card typography, field sizing,
  single-line six-column mobile layout, destructive reveal layer, and compact Log Past set
  editor layout.
- `apps/web/src/modules/calendar/TimeGrid.interaction.test.tsx` — verifies a wheel burst
  navigates once and clears its live feedback state.
- `apps/web/src/modules/fitness/LiveSession.test.tsx` — verifies action semantics, strength
  inputs without repeated units, and swipe-to-reveal set removal.

## How the pieces connect

`TimeGrid` owns raw pointer and wheel motion, shows the small live offset, converts the
completed gesture into a day delta, and calls `Calendar` once. `Calendar` updates the cursor
without replaying its button animation, which causes the existing event loader to request
the new visible range. Toolbar buttons still use the existing `shift` path. In Fitness,
`LiveSession` preserves the existing set update callbacks and accessible control names; only
the DOM grouping and CSS grid placement changed, so persistence remains unchanged.
`LogPastModal` keeps its existing draft/update callbacks; its mobile set controls are only
reflowed through the scoped `.fit-logpast-modal` rules.

## How to modify this later

Tune calendar gesture sensitivity in the day-width calculation inside `TimeGrid`; keep
gesture preview/reset there so wheel and touch remain consistent. Toolbar distribution lives
in the `.cal-toolbar-*` rules in `styles.css`; the view switch intentionally uses the shared
`Segmented` component and `.calendar-tabs` matches Food/Fitness at 300px. For live sets, keep
the JSX order aligned with the six visible columns. Phone sizing lives in the
`max-width: 720px` rules; preserve its one-line layout and the Note before Done ordering.
The `SET_DELETE_REVEAL` distance in `LiveSession.tsx` must stay equal to the
`.fit-live-swipe-delete` width in `fitness.css` so the row snaps exactly to the action edge.
