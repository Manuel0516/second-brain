# Plans

Upcoming and in-progress work. Each plan is self-contained: root cause or
motivation, implementation approach, and a verification checklist. Completed
plans are retired here and logged as ADRs in `docs/decisions/`.

Run `npm run check` (web) and `npm run check:api` (api) before marking any
task done. Reuse existing design tokens and components in
`apps/web/src/styles.css` — no new visual language.

| Plan | Scope | Status |
|---|---|---|
| [FIXES.md](FIXES.md) | Bug fixes and polish tracked during active use: multi-day drag resize, overlapping event layout, mobile touch gestures, event visual polish. | tracked |
| [FIXES_PLAN.md](FIXES_PLAN.md) | Implementation plan for FIXES.md: root-cause analysis, fix approach, and verification checklist for FIX-1 through FIX-4. | ready to implement |
| [MOBILE-TOUCH-PLAN.md](MOBILE-TOUCH-PLAN.md) | Full rework of mobile touch: 1-finger scroll (native), horizontal swipe to navigate days, 1s long-press to create/edit, pinch to resize grid. Replaces FIX-3. | ready to implement |
| [FIX-4-EVENT-CALENDAR-COLOR.md](FIX-4-EVENT-CALENDAR-COLOR.md) | Revised FIX-4: tinted background approach for calendar color identity (replaces right-edge gradient). CSS-only, no JS changes. | ready to implement |
