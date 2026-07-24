# Plan: Whole-app UX audit and phased remediation backlog

> Audience: auditing AI or designer/developer. This plan authorizes investigation
> and documentation only. It does not authorize production-code changes. Run it
> separately from `PLAN-visual-style-system.md`; do not expand the visual-style
> implementation with findings from this audit.

Status: ready after the selectable visual-style system is implemented

Date: 2026-07-24

---

## 1. Goal and deliverables

Perform an evidence-based UX audit of the entire Second Brain app, with Fitness
as the first and deepest review. The audit must identify problems in:

- Typography and information hierarchy.
- Density, spacing, sizing, and shape.
- Interaction behavior and state transitions.
- Feedback, error recovery, and destructive actions.
- Keyboard, focus, touch, and accessibility behavior.
- Desktop, tablet, and mobile responsiveness.

The audit itself must not change production code. Its required output is:

1. `docs/work/UX-AUDIT.md` containing findings, evidence, severity, and
   acceptance criteria.
2. A prioritized phased backlog inside that audit.
3. Separate decision-complete implementation plan files for approved-sized
   batches, with Fitness first.

Do not create one blanket "fix all UX" implementation plan. Keep later batches
bounded and independently verifiable.

## 2. Required preparation

Follow `AGENTS.md` and begin with `docs/CONTEXT.md`. Read
`docs/design/STYLE_GUIDE.md` in full. For each module, read only its mapped
product spec immediately before auditing that module.

Use the Calendar and Settings pages as the current visual and interaction gold
standards. Audit against the selectable Neon and Monochrome styles after the
visual-style plan is implemented; a problem must not be reported merely because
the reviewer personally prefers one style.

Identify the exact route and component files with `rg` before reading them.
When a module requires more than eight files, summarize and justify the expanded
inspection scope before proceeding. Do not read generated output, dependencies,
lockfiles, logs, `.env`, or data dumps.

Use representative local/dev data only. Do not deploy, alter VPS data, publish
screenshots, or commit temporary artifacts.

## 3. Route and state coverage

Audit all user-facing areas:

- Authentication/loading and Login.
- Calendar canvas, sidebar, event creation/editing, recurrence, linking, search,
  and responsive behavior.
- Notes tree, page/editor, blocks, toolbar, linking, covers, side pane, empty
  states, and responsive behavior.
- Fitness Overview, Stats & Goals, History, live session, session wizard,
  past-session logging, body metrics, exercise statistics, and settings.
- Food Overview, Stats, History, meal logging, image/camera flows, sidebars, and
  settings.
- Settings shell and General, Calendar, Fitness, Food, Notes, and Admin sections.

For each relevant surface, inspect:

- Empty, populated, loading, and error states.
- First use and repeated use.
- View, create, edit, save, cancel, and delete flows.
- Menus, popovers, modals, drawers, and nested overlays.
- Long labels, long content, missing optional data, and dense data.
- Keyboard-only navigation and visible focus.
- Touch operation and on-screen keyboard effects.

Use these fixed viewports:

- Desktop: `1440 × 900`.
- Tablet: `768 × 1024`.
- Mobile: `390 × 844`.

Additional widths may be used only to reproduce a breakpoint-specific issue.

## 4. Audit method and evidence standard

For every finding, record:

- Unique ID and short title.
- Module, route, component/surface, viewport, and visual style/color mode.
- Reproduction steps and required data state.
- Current behavior.
- Why it creates friction, ambiguity, inconsistency, or an accessibility issue.
- Expected behavior stated without prescribing unnecessary architecture.
- Severity:
  - `P0` — prevents task completion or risks data loss.
  - `P1` — major recurring workflow or accessibility failure.
  - `P2` — meaningful friction, inconsistency, or responsive defect.
  - `P3` — polish issue with low task impact.
- Concrete acceptance criteria.
- Likely owning subsystem and related findings.

Do not log vague findings such as "feels off," "too big," or "make cleaner."
Translate each observation into measurable evidence: font role and size,
hierarchy collision, extra action count, unclear label, missing state feedback,
overflow, target size, focus order, or inconsistent behavior.

Screenshots may be used as temporary working evidence, but do not commit them
unless the user explicitly requests a permanent visual record. Reference the
observable UI and reproduction steps in the Markdown so the finding remains
useful without a binary artifact.

## 5. Fitness deep dive

Fitness is the first priority because the known discomfort concerns session-log
information, typography, and behavior. Review the complete journey rather than
isolated CSS:

1. Starting a session or choosing to log a past session.
2. Selecting a session type and exercises.
3. Entering strength and cardio sets.
4. Adding per-set notes and feelings.
5. Adding, reordering, or removing sets/exercises.
6. Saving, cancelling, resuming, and recovering from errors.
7. Reading a completed session in History.
8. Editing or deleting a historical session.
9. Following progress into Stats & Goals.

Explicitly evaluate:

- Whether session title, date, notes, exercise name, set number, values, units,
  feeling, and actions have a clear hierarchy.
- Whether live logging, past logging, and historical editing use consistent
  language and control behavior.
- Whether repeated labels or oversized text create noise.
- Whether important values are scannable without making every value prominent.
- Whether row density is comfortable on desktop but still touch-safe on mobile.
- Whether action placement causes accidental remove/delete behavior.
- Whether adding notes or feelings unexpectedly changes row height or focus.
- Whether save/cancel/close behavior gives clear feedback and preserves data.
- Whether inputs behave correctly with the mobile keyboard.

Do not classify a `16px` mobile form input as oversized without checking whether
it intentionally prevents iOS automatic zoom. Display text and input text must
be assessed separately.

The first remediation plan produced from the audit must be Fitness-focused and
must group root-cause changes rather than list unrelated pixel tweaks.

## 6. Cross-app review criteria

Use the existing design system rather than inventing another:

- Typography roles match the documented UI, mono-label, metadata, and heading
  hierarchy.
- Spacing and radii use established values.
- Controls communicate primary, secondary, and destructive priority.
- Similar actions behave consistently between modules.
- Appearing surfaces use established motion and respect reduced motion.
- Focus treatment is singular and visible.
- Touch targets are at least 44px where required on mobile.
- Content does not clip or overflow at the fixed viewports.
- Loading, empty, success, and error feedback are timely and actionable.
- Destructive actions are deliberate and recoverable where the product permits.
- Color is not the only carrier of state.
- Neon and Monochrome preserve the same hierarchy and interaction semantics.

Prefer deletion, simplification, reuse, and native behavior. Do not recommend a
new abstraction, dependency, design token, or component pattern unless existing
ones demonstrably cannot express the required behavior.

## 7. Backlog and follow-up plan format

Order the backlog by user impact and dependency, not by route order:

1. Task blockers, data-loss risks, and inaccessible interactions.
2. Fitness session logging and history coherence.
3. Repeated cross-app root causes.
4. Module-specific responsive and hierarchy problems.
5. Low-impact polish.

Group findings that share a root cause. Each follow-up implementation plan must:

- Have one clear outcome and explicit in/out boundaries.
- Name public API/type changes, or state that there are none.
- Reuse current components and tokens.
- Identify failure modes and responsive/accessibility behavior.
- Include focused automated tests and manual acceptance scenarios.
- Require root `npm run check`.
- Include the production history entry required by `AGENTS.md`.
- Avoid more than eight implementation files where feasible; justify any larger
  batch before implementation.

The audit may recommend changes to shape, typography, or interaction patterns,
but any genuinely new UI pattern must be checked against the design canvas and
receive explicit user approval before its implementation plan is finalized.

## 8. Audit completion criteria

The audit is complete only when:

- Every route and required state category has been reviewed at the three fixed
  viewports.
- Fitness has the full journey-level deep dive described above.
- Findings are reproducible and prioritized, not subjective notes.
- Duplicate symptoms have been consolidated under root causes.
- Every accepted finding has a measurable acceptance criterion.
- The backlog is phased and identifies dependencies.
- The first Fitness implementation plan is decision-complete.
- No production code, dependency, migration, or VPS state was changed during
  the audit.

