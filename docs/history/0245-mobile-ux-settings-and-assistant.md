# 0245 — Mobile UX pass: AI settings responsiveness + assistant panel polish

Date: 2026-08-15
Status: accepted

## What changed

Verified everything below against the real running dev app in a headless browser at a 375px
phone viewport (Playwright, already a dependency from 0237) — not just read from CSS, since
several of these turned out to be actual layout bugs invisible from the source alone.

**AI settings page, mobile:**
- Found the real bug behind "text boxes too big/weird": the `max-width: 640px` block set
  `.ai-skill-card textarea { min-height: 44px }` — the same rule used to guarantee a 44px
  *minimum* touch target on `<input>` fields — but since the textarea's desktop rule
  (`min-height: 140px`) is a *smaller* number applied *earlier* in the cascade, the later,
  same-specificity mobile rule won and **shrank** the textarea from 140px down to 44px on
  phones, showing ~2 lines of a skill's content instead of ~8 and forcing users to scroll
  inside a tiny box to read anything. Split it into its own rule at `160px` (taller than
  desktop, to compensate for narrower line-wrapping) instead of inheriting the input minimum.
- `.ai-skill-card .cal-field input` (the skill name field) was bold at the 16px
  touch-zoom-prevention size, reading as heavy/oversized next to the monospace textarea below
  it — switched to monospace, weight 500.
- `Model & autonomy`: Provider and Autonomy are both short dropdown values that were each
  claiming a full-width row — grouped into a new `.settings-field-row` (2-column grid on
  `max-width: 640px`, single column/unchanged on desktop) so they sit side by side on phones,
  cutting a full row of scroll height from the card.
- `.settings-card-save` (Save/Reindex/Export/Import) was 34px tall — below the style guide's
  own documented 44px mobile touch-target minimum — bumped to 44px on `max-width: 640px` only.

**Assistant chat panel:**
- The tool-result chip (shown for every tool call, including a loaded skill's full markdown)
  used `max-height: 88px; overflow: auto` inside a pill shape — for short results a pill, for
  long ones (a skill's content, truncated server-side to 500 characters) a tall scrollable box
  with pill corners, which is the "weird scroll" behavior reported. Changed to a single line
  with `text-overflow: ellipsis`, and added a native `title` attribute with the full text so
  hovering/long-pressing still surfaces it without needing an expand affordance.
- The panel's back/close/new-conversation controls were raw text glyphs ("‹", "×", "+")  — the
  one visibly inconsistent spot against the rest of the app, which uses proper `stroke`-based
  SVG icons everywhere else (confirmed against the calendar toolbar's Previous/Next/New-event
  icons, the actual reference implementation). Replaced with matching SVG icons at the same
  `viewBox="0 0 20 20"`, `strokeWidth 2`, `strokeLinecap/Linejoin round` convention.
- The conversations list header's "Assistant" / "Conversations" two-line title sat off-center
  between the close and new-conversation buttons (shrink-to-fit box, left-aligned text) —
  given `flex: 1` and `text-align: center` so it's centered as a block between the two
  equal-width (44px) buttons, both lines centered.
- The chat header's "AI Assistant" / "Ready" two-line title had loose default text-flow
  spacing between the lines, reading as two separate pieces of text rather than one coherent
  title+status block — tightened via an explicit `display: grid; gap: 1px` wrapper with
  `line-height: 1.2` on both lines.

## Why

User request, iterated over several rounds while watching the live result: AI settings page
not actually responsive on phone (oversized/scrolly input and text boxes), the chat's
tool-result chip's scrollable-box behavior when a skill's content is long, and general mobile
polish on the assistant panel's top bars specifically, following up with two more precise
asks (center the list header's title, tighten the chat header's title/status line spacing)
once they saw the in-progress result.

## Files touched

- `apps/web/src/styles.css` — `.settings-field-row` (base + mobile grid), the
  `.ai-skill-card textarea` mobile min-height split-out, `.ai-skill-card .cal-field input`
  font change, `.settings-card-save` mobile min-height.
- `apps/web/src/modules/settings/AISettings.tsx` — wrapped Provider+Autonomy in
  `.settings-field-row`; moved Model above them (Autonomy no longer sits between Model and
  the conditional Local-endpoint field).
- `apps/web/src/modules/assistant/assistant.css` — tool-chip truncation
  (`.assistant-tool-chip-summary`), header icon sizing rules, list-header title centering,
  chat-header title/status line spacing.
- `apps/web/src/modules/assistant/AssistantPanel.tsx` — `BackChevronIcon`/`PlusIcon`/
  `CloseIcon` components (same convention as the existing `SparkleIcon`/`CameraIcon`);
  swapped the four header glyph buttons to use them; tool chip's summary `<span>` gained the
  truncation class and a `title` attribute.
- `apps/web/src/modules/assistant/AssistantPanel.test.tsx` — new test asserting a long tool
  result renders with the truncation class and the full text available via `title`.

## How the pieces connect

Both fixes were found and verified the same way: log into the real dev app (a throwaway
`is_test_account=true` user, created directly in the dev Postgres container and deleted
afterward — not the real seeded account, and not a forged JWT, since that turned out to be
pointed at a different, stale database and produced a confusing false negative before the
actual dev-stack database was identified), drive it with Playwright at a 375×812 viewport, and
screenshot before/after each change. The `.ai-skill-card textarea` bug specifically would not
have been found by reading the CSS in isolation — the cascade interaction (a later,
same-specificity mobile rule silently shrinking rather than growing the element) only shows up
when you look at the two rules together against actual rendered content.

## How to modify this later

- `.settings-field-row` is a generic 2-column-on-mobile wrapper, not AI-settings-specific —
  reuse it anywhere else a pair of short-value fields is stacking unnecessarily on phones.
- The `max-width: 640px` block in `styles.css` is themed as "AI assistant page" mobile
  overrides but several rules there (`.settings-card-save`, `.settings-field-row`) now apply
  more broadly across any settings page using those classes — that's intentional, not scope
  creep, since the underlying components are shared.
- If another skill-content textarea size complaint comes up, the number to change is the new
  dedicated `.ai-skill-card textarea { min-height: 160px }` mobile rule — don't reintroduce a
  shared rule with `.cal-field input`, that's exactly what caused this bug.
