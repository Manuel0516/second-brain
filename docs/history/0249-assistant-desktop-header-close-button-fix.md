# 0249 — Fix stray desktop close button in assistant sidebar header

Date: 2026-08-16
Status: accepted

## What changed

The assistant panel's "Conversations" sidebar header showed a redundant `×` close
button in the top-left on desktop, next to the chat pane's own close button on the
top-right. The mobile-only close button (`.assistant-mobile-close`) was meant to be
hidden via `display: none` outside the `max-width: 640px` breakpoint, but the shared
`.assistant-list-header button` rule had higher CSS specificity (one class + one type
selector vs. one class) and always won, forcing the button visible regardless of
viewport.

Fixed the specificity so `.assistant-mobile-close` is correctly hidden on desktop and
shown on phone (matching the existing `.sidebar-close` convention elsewhere in the
app, which has the same comment: "Close button only shows in the mobile overlay
drawer"). Also switched the desktop sidebar header title from centered text (a
leftover of balancing two 44px buttons on either side) to left-aligned, matching the
`.sidebar-title` gold-standard pattern (label left, actions right via
`justify-content: space-between`) now that only one button remains on desktop. The
centered "modal title bar" look is preserved for phone view, where the X and title
sit together again.

## Why

User-reported styling issue: "In Desktop view remove the top left close button in the
chat interface to the left. And make sure the top bar looks good and aesthetically
follows the project guidelines in desktop view and in phone view."

## Files touched

- `apps/web/src/modules/assistant/assistant.css` — bumped `.assistant-mobile-close`'s
  selector to `.assistant-close.assistant-mobile-close` (both in the base
  `display: none` rule and the `max-width: 640px` `display: grid` override) so it wins
  over `.assistant-list-header button`'s specificity in both directions; removed
  `flex: 1; text-align: center` from the base `.assistant-list-header > div` rule and
  reintroduced it only inside the mobile media query.

## How the pieces connect

`AssistantPanel.tsx` renders two headers: the sidebar's `.assistant-list-header`
(title + new-conversation button, plus a close button that's only useful when the
sidebar is the sole visible pane on phone) and the chat pane's
`.assistant-chat-header` (back button + title + always-visible close button). On
desktop both panes render side by side, so the chat header's close button is the only
one that should show — the sidebar's is now correctly suppressed there via CSS alone;
no JSX or component logic changed.

## How to modify this later

Any time a class is meant to override a shared rule for a specific element, check
specificity, not just source order — a two-part selector like `.list-header button`
beats a single class like `.mobile-close` even if the single-class rule appears later
in the file. Grep other `display: none` "mobile-only" toggles in `assistant.css` and
`styles.css` (e.g. `.sidebar-close`, `.assistant-mobile-back`) if extending this
pattern, and keep the base/mobile-override selectors matched in specificity so the
media query override reliably wins on phone.
