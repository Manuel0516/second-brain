# Second Brain UX audit

Status: findings UX-001 through UX-010 implemented (static + unit-test verified); live browser
validation still pending — see "Live completion checklist" for exactly what was and wasn't
possible to verify in this session.

Date: 2026-07-24

## Method and limitation

This audit reviewed the user-facing React structure, interaction handlers, responsive CSS,
accessibility markup, and existing tests for Login, Calendar, Notes, Fitness, Food, and
Settings. Calendar and Settings were used as the established quality baseline.

The required in-app browser control was not available in this session after the mandated
tool-discovery attempts. The selectable Monochrome style was also still being implemented
concurrently while this audit was written. Therefore:

- Findings marked **confirmed** follow directly from executable source paths and do not
  depend on subjective visual judgment.
- Responsive findings cite exact CSS dimensions and breakpoints.
- Live keyboard, screen-reader, touch, and Neon/Monochrome visual validation remains a
  required final pass; it is not represented here as completed.
- No production code, dependency, migration, or VPS state was changed by this audit.

Temporary screenshots were not created or committed.

## Coverage

| Area               | States reviewed statically                                                    | Responsive source reviewed | Live validation |
| ------------------ | ----------------------------------------------------------------------------- | -------------------------: | --------------: |
| Login/auth loading | default, error, loading, success, TOTP                                        |       global/mobile sizing |         pending |
| Calendar           | shell, sidebar, event editor, recurrence/link search, note pane               |            800/640px rules |         pending |
| Notes              | shell, overview, tree, page/editor, toolbars/popovers, save/error states      |            800/640px rules |         pending |
| Fitness            | overview, stats/goals, history/edit, wizard, live session, past log, metrics  |                720px rules |         pending |
| Food               | overview, stats, history/delete, meal modal, photo/upload/camera/error states |                720px rules |         pending |
| Settings           | shell, loading, all configured sections, admin, integrations                  |         shell mobile rules |         pending |

Calendar and Notes contain substantially stronger accessible names, responsive containment,
and explicit status/error semantics than the confirmed problem areas below. They still need
the live pass for focus order, nested popovers, long-content overflow, touch gestures, and
both visual styles.

## Findings

### UX-001 — TOTP login cannot complete

- **Priority:** P0
- **Status:** confirmed
- **Surface:** `/login`, password-to-TOTP transition, every viewport/style
- **Reproduction:** Sign in with a valid account that has TOTP enabled. After the API
  returns `TOTP code required`, enter a valid six-digit code and submit.
- **Current behavior:** `Login.tsx` clears the password when switching to the TOTP step.
  The second call still sends `{email, password, totp_code}` to the same login endpoint, so
  it submits an empty password. The API verifies the password before TOTP and rejects the
  request.
- **Impact:** A user with 2FA enabled is locked out of the application.
- **Expected behavior:** Retain the password in component memory through the TOTP challenge,
  focus the TOTP input, submit all three credentials, and clear secrets when login completes
  or the component unmounts. Never persist credentials to browser storage.
- **Acceptance:** A valid password and code authenticate; an invalid code preserves the
  password and permits retry; errors are announced; password/TOTP values are cleared after
  success.
- **Owner:** authentication frontend; see `PLAN-auth-2fa-ux-fix.md`.

### UX-002 — Fitness History mixes explicit Save/Cancel with immediate set persistence

- **Priority:** P1
- **Status:** confirmed
- **Surface:** `/fitness?tab=history`, completed-session editor
- **Reproduction:** Edit a session, change reps/weight/feeling/set note and blur or click a
  feeling, then press **Cancel**.
- **Current behavior:** Set fields persist individually on blur/click, while session
  date/type/note wait for **Save workout**. **Cancel** closes the editor but does not undo
  the already-saved set edits.
- **Impact:** The interface promises a discard action it cannot honor and makes it unclear
  which values are saved.
- **Expected behavior:** Use one persistence model. The minimal model is autosave for both
  session and set fields, explicit saving/saved/error feedback, and a **Done** action rather
  than a false **Cancel** action.
- **Acceptance:** All editable values follow the same stated persistence model; leaving the
  editor never silently discards or unexpectedly preserves only part of a workout.
- **Owner:** Fitness history; see `PLAN-fitness-history-editing-ux.md`.

### UX-003 — Completed Fitness sessions delete without confirmation

- **Priority:** P1
- **Status:** confirmed
- **Surface:** `/fitness?tab=history`, session summary
- **Reproduction:** Press **Delete** on a completed session.
- **Current behavior:** The delete request starts immediately. Food history and other
  destructive areas already use `ConfirmDialog`.
- **Impact:** A single mistaken click permanently removes a workout and its sets.
- **Expected behavior:** Reuse the existing confirmation dialog, identify the workout/date,
  and keep the row intact if deletion fails.
- **Acceptance:** First click opens confirmation; Cancel changes nothing; Confirm deletes
  once; failure closes no data and presents an actionable error.
- **Owner:** Fitness history; see `PLAN-fitness-history-editing-ux.md`.

### UX-004 — Fitness live-session touch controls are below the mobile target minimum

- **Priority:** P1
- **Status:** confirmed
- **Surface:** live workout at widths `<=720px`
- **Reproduction:** Open a live session on a 390px viewport and operate feeling, note, and
  remove-set controls.
- **Current behavior:** `.fit-live-icon-btn` is `24×24px`; mobile feeling buttons are
  `32×32px`. The mobile `44px` rule targets obsolete `.fit-live-set-tools` descendants,
  while the rendered container is `.fit-live-tools`, so it does not enlarge these buttons.
- **Impact:** Frequent workout controls are hard to hit while moving and place destructive
  remove next to note in a very small target area.
- **Expected behavior:** At coarse/mobile breakpoints every interactive target is at least
  `44×44px`, without making numeric input text smaller than the iOS-safe `16px`.
- **Acceptance:** Computed touch targets meet `44px`; note/remove remain visually secondary;
  feeling choices remain understandable without hover-only tooltips.
- **Owner:** Fitness live logging; see `PLAN-fitness-live-and-past-logging-ux.md`.

### UX-005 — Fitness exposes three different logging/editing hierarchies

- **Priority:** P2
- **Status:** confirmed structural inconsistency; visual calibration pending
- **Surface:** live workout, Log past workout, and History edit
- **Reproduction:** Compare one strength exercise with several sets across the three flows.
- **Current behavior:** Live logging uses a compact grid and hidden mobile headers; past
  logging uses large wrapped set cards; History editing adds feeling and note rows with a
  third ordering model. Labels, unit placement, action placement, and save behavior change
  between flows.
- **Impact:** Users must relearn the same set-entry concept, and vertically repeated labels
  make historical/past-log information feel larger and noisier than its importance.
- **Expected behavior:** Use one information order: set number → primary values/units →
  feeling → note → destructive action. Session and exercise headings remain stronger than
  set values; metadata remains smaller. Mobile numeric inputs stay `16px` to prevent iOS
  zoom, while surrounding display labels remain 10–13px.
- **Acceptance:** The same exercise/set is recognizable across all three flows; headings,
  metadata, values, and actions have documented roles; mobile does not rely on missing
  headers to explain fields.
- **Owner:** Fitness logging; see `PLAN-fitness-live-and-past-logging-ux.md`.

### UX-006 — Modal dialogs do not manage focus or guard dirty dismissal

- **Priority:** P1
- **Status:** confirmed
- **Surface:** shared confirmation dialog, Fitness past-log modal, Food meal-log modal
- **Reproduction:** Open with keyboard, press Tab repeatedly, press Escape, or click the
  backdrop after entering data/uploading photos.
- **Current behavior:** Dialogs declare `aria-modal` but do not move focus into the dialog,
  trap focus, restore trigger focus, or consistently provide labelled title/description.
  Fitness and Food close on Escape/backdrop. Food may already have uploaded photos and both
  forms can contain substantial unsaved input, yet dismissal has no dirty confirmation.
- **Impact:** Keyboard users can interact behind a modal; focus location is lost; accidental
  backdrop/Escape dismissal can discard work.
- **Expected behavior:** Shared focus lifecycle, labelled dialog semantics, body-scroll
  containment, focus restoration, and a dirty-state confirmation before dismissing entered
  work. Busy upload/analyze/save states must not dismiss.
- **Acceptance:** Focus starts inside and cannot escape; Escape/backdrop closes only clean
  idle forms; dirty forms ask for confirmation; successful save closes normally and returns
  focus to the opener.
- **Owner:** shared dialogs plus Fitness/Food adapters; see
  `PLAN-dialog-focus-and-dirty-dismissal.md`.

### UX-007 — Segmented controls lack radio-group keyboard behavior

- **Priority:** P2
- **Status:** confirmed
- **Surface:** Fitness tabs/categories and Settings segmented choices
- **Reproduction:** Focus a segmented control and use arrow keys.
- **Current behavior:** Each radio button remains a separate Tab stop and the shared
  `Segmented` component has no ArrowLeft/ArrowRight/Home/End behavior or roving `tabIndex`.
  Food/Fitness hand-built type pills also do not expose checked/pressed state.
- **Impact:** Keyboard interaction differs from the radio-group semantics announced to
  assistive technology.
- **Expected behavior:** One tab stop per group; arrows move and select; Home/End select
  boundaries; checked state is programmatic. Hand-built exclusive pills reuse `Segmented`
  where their shape matches.
- **Acceptance:** Shared keyboard tests cover wrap/boundary behavior and all exclusive
  selection groups expose state.
- **Owner:** shared controls; see `PLAN-shared-controls-and-settings-feedback.md`.

### UX-008 — Important Settings feedback is visual-only

- **Priority:** P2
- **Status:** confirmed
- **Surface:** General and Admin settings save/error feedback
- **Reproduction:** Save profile/password or trigger an admin/settings error with a screen
  reader.
- **Current behavior:** Several messages are plain colored `div`/`p` elements without
  `role="status"`, `role="alert"`, or an `aria-live` region.
- **Impact:** The state change may not be announced, leaving non-visual users unsure whether
  an operation succeeded.
- **Expected behavior:** Non-blocking success uses `role="status"`; errors use
  `role="alert"`; messages remain visible text and do not rely only on color.
- **Acceptance:** Focus need not move to feedback; assistive technology receives exactly one
  announcement per operation.
- **Owner:** Settings UI; see `PLAN-shared-controls-and-settings-feedback.md`.

### UX-009 — Settings state refetches and reapplies defaults on every module route

- **Priority:** P2
- **Status:** confirmed
- **Surface:** navigation among Calendar, Notes, Fitness, Food, and Settings
- **Reproduction:** Navigate between protected top-level routes while watching
  `GET /api/settings` and initial context values.
- **Current behavior:** Every route mounts its own `SettingsProvider`. Navigation unmounts
  the previous provider, resets to frontend defaults, and fetches settings again.
- **Impact:** Repeated network work and a window where modules render default units/theme/
  preferences can cause visible or behavioral flicker, especially on slower connections.
- **Expected behavior:** One provider spans the authenticated route lifetime and fetches
  once per authenticated app session.
- **Acceptance:** Protected-route navigation preserves the same settings context instance;
  login remains outside the authenticated fetch; logout discards the provider; failed fetch
  behavior remains unchanged.
- **Owner:** app routing/state; see `PLAN-settings-state-lifecycle.md`.

### UX-010 — Fitness goal reordering is pointer-only

- **Priority:** P2
- **Status:** confirmed
- **Surface:** Fitness sidebar goals
- **Reproduction:** Attempt to focus and reorder a goal without a pointer.
- **Current behavior:** A `div` has pointer drag handlers and an `aria-label`, but no
  interactive role, `tabIndex`, keyboard commands, or reorder announcement.
- **Impact:** Keyboard and switch-input users cannot perform an available action.
- **Expected behavior:** Provide explicit keyboard reorder controls or a focusable handle
  with documented keys and status announcement. Pointer drag may remain.
- **Acceptance:** Every goal can be moved with keyboard alone and its new position is
  announced; a click without drag does not reorder.
- **Owner:** deferred Fitness goals accessibility batch after session work.

### UX-011 — Settings number fields look native and save unstable intermediate values

- **Priority:** P2
- **Status:** confirmed
- **Surface:** Food and Fitness settings, especially daily nutrition targets
- **Reproduction:** Edit a multi-digit Food target, clear an optional target, or compare the
  number fields with the app's other inputs.
- **Current behavior:** Settings number fields retain browser-native spinner chrome while
  Fitness logging explicitly removes it. Every `onChange` immediately PATCHes the backend,
  so typing `2000` sends the intermediate values `2`, `20`, `200`, and `2000`. Clearing a
  required number can briefly send an invalid value and trigger a settings rollback while
  the user is still editing. Eight Food limits are also presented as one undifferentiated
  full-width vertical stack.
- **Impact:** The fields look inconsistent, can flicker/revert during normal typing, and
  make related macro/unit targets harder to scan.
- **Expected behavior:** Use a compact shared Settings number-field treatment with no native
  spinner chrome, local text drafts, commit on blur/Enter, Escape-to-reset, visible units,
  and responsive grouping of related Food targets.
- **Acceptance:** One intentional edit produces one PATCH; invalid intermediate text is
  never sent; blank remains supported only for nullable settings; desktop groups related
  targets without making mobile inputs smaller than `16px` or touch targets smaller than
  `44px`.
- **Owner:** Settings controls; included in
  `PLAN-shared-controls-and-settings-feedback.md`.

## Prioritized backlog

1. **P0 authentication:** implemented — `PLAN-auth-2fa-ux-fix.md`,
   `docs/history/0161-totp-login-password-retention-fix.md`.
2. **Session continuity:** implemented in a prior session —
   `docs/history/0160-day-long-auth-session-continuity.md`.
3. **Fitness history integrity:** implemented — `PLAN-fitness-history-editing-ux.md`,
   `docs/history/0162-fitness-history-autosave-and-delete-confirmation.md`.
4. **Fitness logging hierarchy/touch:** implemented —
   `PLAN-fitness-live-and-past-logging-ux.md`,
   `docs/history/0163-fitness-live-and-past-logging-hierarchy.md`.
5. **Dialog safety and accessibility:** implemented —
   `PLAN-dialog-focus-and-dirty-dismissal.md`,
   `docs/history/0164-dialog-focus-and-dirty-dismissal.md`.
6. **Shared controls, Settings number fields, and feedback:** implemented —
   `PLAN-shared-controls-and-settings-feedback.md`,
   `docs/history/0165-shared-controls-and-settings-feedback.md`.
7. **Settings context lifecycle:** was already implemented in the same prior session as item 2;
   this session added the regression test coverage the plan required —
   `PLAN-settings-state-lifecycle.md`, `docs/history/0166-settings-provider-lifecycle-test-coverage.md`.
8. **Fitness goal keyboard reorder:** implemented — `PLAN-fitness-goal-keyboard-reorder.md`,
   `docs/history/0167-fitness-goal-keyboard-reorder.md`.
9. **Live completion pass:** attempted this session; see "Live completion checklist" below for
   exactly what could and could not be verified without a browser.

## Live completion checklist

**Attempted 2026-07-24.** No in-app browser session was available in this environment (the
Claude in Chrome extension is not connected, and no other browser-automation tool was
available) — the same limitation the original audit hit. Per the task's own instruction, the
items below are reported honestly as unverified rather than marked complete.

What **was** verified this session (static/automated, not a substitute for the items below):
- `npm run build` (`tsc -b && vite build`) succeeds with the full set of UX-001–UX-010 changes
  applied, across every module touched.
- The full Vitest suite (144 tests, 28 files) passes, including new focused tests for each
  fixed item's specific acceptance criteria (TOTP retry, autosave/delete-confirm, live/past-log
  field parity, dialog focus trap + dirty dismissal, `Segmented` keyboard nav, settings number
  field commit/Escape/resync, single `SettingsProvider` lifecycle, goal keyboard reorder).
- All CSS added or changed by this session's fixes uses only existing `var(--token)` values —
  no new hardcoded colors were introduced (checked by diffing the changed CSS/inline-style
  lines against the token pattern).
- Breakpoint math for the three required viewports: `1440px` clears every breakpoint (desktop
  layout everywhere); `390px` is below every breakpoint (mobile layout everywhere) — both are
  internally consistent. `768px` sits **between** the app-shell breakpoint (`800px`, which
  switches `AppRail` to a mobile drawer) and the Fitness/Food (`720px`) and Settings/Calendar/
  Notes (`640px`) content breakpoints. At `768px` the app renders a mobile nav drawer alongside
  still-desktop-density Fitness/Food/Settings content — a real, reproducible hybrid state
  visible directly in the CSS, pre-existing (not introduced by any change in this session) and
  not something any of the eight implemented plans touched. It is flagged here, not fixed, and
  is the single most likely finding a live `768×1024` pass would confirm.

What remains genuinely unverified — still required before this audit can move to `complete`:
- Every coverage row exercised at all three fixed viewports, with a real browser rendering the
  actual computed layout (not just the breakpoint math above).
- Both visual styles (Neon/Monochrome) and explicit Light/Dark checked visually — the switching
  mechanism was implemented and unit-tested in a prior session
  (`docs/history/0159-neon-monochrome-visual-style.md`) but never visually confirmed across all
  six areas.
- Keyboard focus order, focus visibility, modal containment (including the new dialog focus
  trap), and popover dismissal observed directly in a real browser/AT combination — the jsdom
  tests added this session exercise the same code paths but jsdom's focus/tab-order model is
  not a substitute for a real browser.
- Touch behavior on an actual mobile/coarse pointer, including on-screen keyboard layout
  interaction with the newly-44px touch targets.
- Empty, populated, loading, error, save, cancel, and delete states observed with representative
  local data (this environment has no seeded database or running backend to generate that
  data).

Any future session with browser access should start with the `768px` hybrid-layout finding
above, then work through the coverage table.
