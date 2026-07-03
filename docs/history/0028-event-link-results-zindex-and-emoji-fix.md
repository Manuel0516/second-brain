# 0028 — Event link results z-index and emoji fix

Date: 2026-07-03
Status: accepted

## What changed
- Added `position: relative; z-index: 1;` to `.connection-card.active` so the active card (with its open dropdown) rises above subsequent inactive connection cards.
- Increased `z-index` of `.event-link-results` from `5` to `50`.
- Removed the `▧` fallback emoji from note search results in the Connections > Notes section, matching the conditional icon rendering already used in the Linked card section.
- Applied the same conditional icon rendering to `pendingNoteLinks` items.

## Why
- The `connectionOpen` animation on `.connection-options` uses `transform` with `animation-fill-mode: both`, which permanently creates a stacking context (because `transform: translateY(0)` ≠ `none`). The `.event-link-results` dropdown lives inside this stacking context, so its `z-index` was trapped — sibling `.connection-card` elements painted on top by DOM order regardless. The fix lifts `.connection-card.active` above its siblings with its own stacking context.
- Notes without an emoji icon were showing a placeholder `▧` character, creating unwanted visual space. The intended behaviour — already present in the Linked card section — is to show only the title shifted left when no icon exists.

## Files touched
- `apps/web/src/styles.css` — added `position: relative; z-index: 1;` to `.connection-card.active`; changed `.event-link-results` z-index from `5` to `50`.
- `apps/web/src/modules/calendar/EventEditor.tsx` — removed `▧` fallback in two places:
  1. The `event-link-results` inside Connections > Notes (changed `{result.icon || '▧'}` to conditional render like the Linked card).
  2. The `pendingNoteLinks` display (same change).

## How the pieces connect
The event editor has two places that render note search results:
1. The **Linked** card (edit mode) — already used conditional icon rendering.
2. The **Connections > Notes** card (create mode) — used a `▧` fallback, now fixed.

The `.event-link-results` dropdown is absolutely positioned inside `.event-link-search` (which has `position: relative`). Both the Linked card and Connections card share the same CSS class for these results.

## How to modify this later
- The `connectionOpen` animation's `transform` creates a permanent stacking context on `.connection-options`. If future dropdowns are added inside connection cards, either lift the card itself (like `.connection-card.active` does) or change the animation to avoid `transform` (e.g. animate `margin-top` + `opacity` only).
- The `event-linked-item` grid layout (`grid-template-columns: auto 1fr auto`) may need revisiting if items without icons cause layout shifts in the linked items list.
