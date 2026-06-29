# FIX-4 (revised) — Calendar identity: corner glow

---

## Problem

Events have their own color but no clear indicator of which calendar they
belong to. A hard dot doesn't blend with the warm dark UI. The previous
right-edge gradient was too subtle and tied the event color to the calendar
color.

---

## Chosen approach: radial glow from the top-right corner

A soft radial gradient emanates from the top-right corner of the event chip,
using the calendar color at ~35 % opacity fading to transparent. No hard
shape — the color bleeds naturally into whatever the event background is, like
a subtle light source.

This matches the design language: warm, soft, no sharp decorative elements.

```
┌─────────────────────╮░░
│ Event title          ░░░
│ 10:00 – 11:00       ░░░
└─────────────────────╯░
  (glow fades out →)
```

### Spec

| Property | Value |
|---|---|
| Element | `::before` pseudo-element |
| Position | `top: 0; right: 0` |
| Size | `48px × 48px` — covers the corner, fades before reaching text |
| Shape | `radial-gradient(circle at top right, ...)` |
| Color stop 0 % | `var(--cal-color)` at 35 % opacity |
| Color stop 65 % | transparent |
| Border radius | `0 5px 0 0` — follows the event chip corner |
| Opacity on past events | reduce to 18 % at stop 0 |
| Selected state | hide (solid fill takes over) |

---

## Implementation

### 1. Remove `::after` (right-edge gradient)

Delete the `.calendar-event::after` block in `apps/web/src/styles.css`
(currently lines 972–983).

### 2. Add corner glow via `::before`

```css
.calendar-event::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 48px;
  height: 48px;
  border-radius: 0 5px 0 0;
  background: radial-gradient(
    circle at top right,
    color-mix(in srgb, var(--cal-color, #888) 35%, transparent) 0%,
    transparent 65%
  );
  pointer-events: none;
}
```

### 3. Dimmed on past events

```css
.calendar-event.past:not(.selected)::before {
  background: radial-gradient(
    circle at top right,
    color-mix(in srgb, var(--cal-color, #888) 18%, transparent) 0%,
    transparent 65%
  );
}
```

### 4. Hide on selected (solid fill makes it redundant)

```css
.calendar-event.selected::before {
  display: none;
}
```

---

## Files touched

| File | Change |
|---|---|
| `apps/web/src/styles.css` | Remove `::after` block; add `::before` corner glow; dim on past; hide on selected |

No JS or TSX changes. `--cal-color` is already injected inline on each event.

---

## Verification checklist

- [ ] Each event shows a soft color glow in the top-right corner matching its
      calendar color, regardless of the event's own body color.
- [ ] The glow fades smoothly — no hard edge visible.
- [ ] Past/dimmed events have a noticeably lighter glow.
- [ ] Selected events show no glow (solid fill only).
- [ ] Tiny/compact events still look clean — the 48 px glow doesn't overwhelm
      a short chip (if it does, reduce to 36 px).
- [ ] Dark and light themes both look clean.
- [ ] `npm run check` passes with no new errors.
