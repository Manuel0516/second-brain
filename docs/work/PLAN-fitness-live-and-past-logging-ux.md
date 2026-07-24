# Plan: Unify Fitness live and past-session logging UX

Status: ready after Fitness History editing

Date: 2026-07-24

## Summary

Resolve UX-004 and UX-005 by giving live logging and past-session logging the same
information order and mobile interaction quality. Keep their distinct workflows—live
logging remains fast/in-progress, past logging remains a modal draft—but make a set read and
behave consistently.

No backend, schema, or public API changes are required.

## Information hierarchy

Use this order everywhere:

1. Set number.
2. Primary values and visible units (`weight + reps` or `distance + time`).
3. Feeling.
4. Optional set note.
5. Remove action.

Apply existing typography roles:

- Session/modal title: existing page/modal heading role, no larger than 18px.
- Exercise name: 13–14px semibold.
- Field labels/units: 10–11px mono.
- Display metadata: 10–12px.
- Desktop inputs: 13px.
- Mobile numeric/text inputs: 16px to prevent iOS zoom.

Do not make values smaller to achieve density. Reduce noise through shared ordering,
single-use labels, and spacing.

## Live session

- Correct the mobile selector so rendered `.fit-live-tools` note/remove controls are at
  least `44×44px`.
- Make every feeling target at least `44×44px` on coarse/mobile pointers while keeping the
  visible dot compact.
- Add a visible compact **Low → High** or equivalent feeling legend once per exercise on
  touch layouts; keep per-button accessible labels and `aria-pressed`.
- Preserve the compact desktop grid.
- On mobile, keep visible field meaning when the header row hides: use concise unit labels
  associated with inputs rather than relying on position alone.
- Separate note and destructive remove controls sufficiently to prevent accidental taps.
- Keep completed-set locking and rest-timer behavior unchanged.
- Do not add confirmation for removing an unsaved live set; make the destructive action
  visually clear and preserve the rest of the session in local storage.

## Past-session modal

- Reuse `Segmented` for exclusive session type instead of unmarked pills.
- Match live logging's set order and labels.
- Keep draft removal immediate because the workout has not yet been saved.
- Use 44px mobile actions and 16px mobile inputs.
- Preserve strength/cardio-specific values, category selection, exercise search, and the
  existing one-request-per-created-record save behavior.
- Dirty dismissal and modal focus are intentionally handled by
  `PLAN-dialog-focus-and-dirty-dismissal.md`; do not duplicate that work here.

## Files and tests

Expected production ownership:

- `LiveSession.tsx`
- `LogPastModal.tsx`
- Relevant live/log-past sections of `fitness.css`

Extend `LiveSession.test.tsx` and add a focused `LogPastModal.test.tsx` covering:

- Strength and cardio field ordering/names.
- Feeling checked state and mobile-visible legend markup.
- Note/remove accessible names.
- Session type radio semantics.
- Add/remove set behavior and retained draft values.

Manual acceptance at `1440×900`, `768×1024`, and `390×844`:

- Complete strength and cardio workouts with notes and feelings.
- Log the same workouts as past sessions and compare field order.
- Verify all mobile targets and on-screen keyboard behavior.
- Verify no iOS input zoom.
- Run root `npm run check`.
- Add the required production history entry and changelog row.
