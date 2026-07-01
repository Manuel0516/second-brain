# Second Brain — UI Style Guide

> Every AI working on this project must read this file before writing any UI code.
> The calendar page and the settings page are the visual gold standard.
> When in doubt: make it look like those two.

Source of truth: `apps/web/src/styles.css`

---

## 1. Design philosophy

- Warm dark-first. The palette is dark charcoal with cream-tinted borders, not cold grey.
- Motion is opinionated. Every surface that appears, moves. Statics feel dead.
- Monospace accents. Labels, section headings, and metadata use JetBrains Mono.
- One accent color. Cyan (`#22d3ee`) is used sparingly — focus states, primary actions,
  active indicators. Never decorative.
- Density without crowding. Compact enough to show information, never so tight it's stressful.

---

## 2. Color tokens

**Never hardcode colors. Always use these CSS custom properties.**

### Surfaces (dark theme)
```css
--bg-base:     #131210   /* page background, sidebar background */
--bg-elevated: #1c1b17   /* cards, popovers, dropdowns */
--bg-raised:   #252420   /* hover states, active rows, input backgrounds in cards */
```

### Borders (cream-tinted, not neutral white)
```css
--border:        rgba(255, 240, 200, 0.07)   /* subtle dividers, card outlines */
--border-strong: rgba(255, 240, 200, 0.11)   /* input fields, strong dividers */
--border-grid:   rgba(255, 240, 200, 0.04)   /* time grid lines, very subtle */
```

### Text
```css
--text-primary:   #f0ede5   /* headings, active labels, input values */
--text-secondary: #a8a49a   /* body text, secondary labels */
--text-tertiary:  #6b6761   /* placeholder, timestamps, metadata */
```

### Accent (cyan)
```css
--accent:             #22d3ee                    /* focus borders, primary buttons, active states */
--accent-tint:        rgba(34, 211, 238, 0.12)   /* focus glow ring, highlight backgrounds */
--accent-tint-border: rgba(34, 211, 238, 0.15)   /* primary button border */
```

### Shadows
```css
--shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.45)    /* small cards, tooltips */
--shadow-md: 0 4px 16px rgba(0, 0, 0, 0.5)    /* modals, popovers, dragged items */
```

### Light theme equivalents
The light theme uses the same token names. Never write `prefers-color-scheme` checks in
component code — always use the tokens and let the theme cascade.

```css
--bg-base:     #f6f4ef
--bg-elevated: #ffffff
--bg-raised:   #fbfaf7
--border:        rgba(20, 18, 30, 0.09)
--border-strong: rgba(20, 18, 30, 0.16)
--text-primary:   #18171c
--text-secondary: #5c5868
--text-tertiary:  #8a8799
--accent:             #0c8aa3
--accent-tint:        rgba(12, 138, 163, 0.1)
--accent-tint-border: rgba(12, 138, 163, 0.2)
```

### Danger color (destructive actions only)
```css
color: #d9573f   /* hardcoded — used only for delete/danger text and error states */
```

---

## 3. Typography

```css
--font-ui:   'Inter', 'Symbols Nerd Font', system-ui, sans-serif
--font-mono: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace
```

**Rules:**
- Body text and UI labels: `var(--font-ui)`, 13px, weight 400.
- Section headings / field labels: `var(--font-mono)`, 10–11px, weight 600,
  `text-transform: uppercase`, `letter-spacing: 0.05–0.06em`.
- Page titles / large headings: `var(--font-ui)`, 24–34px, weight 700, `letter-spacing: -0.025em`.
- Metadata / timestamps: `var(--font-mono)`, 10–12px, `var(--text-tertiary)`.
- Never use font weights other than 400, 500, 600, 700.

### Section label pattern (used everywhere in calendar and settings)
```css
color: var(--text-tertiary);
font: 600 10px var(--font-mono);
text-transform: uppercase;
letter-spacing: 0.05em;
```

---

## 4. Border radius tokens

**Always use these tokens. Never write raw pixel values for border-radius.**

```css
--r-sm: 5px    /* small buttons, tags, checkboxes, tiny chips */
--r-md: 8px    /* inputs, rows, medium buttons, icon buttons */
--r-lg: 12px   /* cards, popovers, modals, large containers */
--r-xl: 14px   /* large cards, the event editor card */
```

Exception: `border-radius: 99px` for pill shapes (tags, scrollbar thumbs). `border-radius: 50%`
for circular elements.

---

## 5. Spacing

No spacing scale token — use these consistent values:

| Use | Value |
|-----|-------|
| Between items in a list | 2px gap |
| Between form fields | 6–10px gap |
| Card internal padding | 14px |
| Section heading margin-bottom | 10–12px |
| Sidebar padding | 20px 14px |
| Canvas page padding | 40px 0 96px |
| Icon button size (small) | 26×26px |
| Icon button size (medium) | 30×32px |
| Input min-height | 38px |
| Touch target min-height | 44px (mobile) |

---

## 6. Animations and motion

**Every surface that appears must animate. Statics feel dead.**

### Available keyframes (defined in `styles.css`)
```
popIn      — scale 0.9→1 + fade, 120ms ease-out — popovers, dropdowns, tooltips
springIn   — elastic scale 0.82→1.04→0.98→1 — modals, large overlays
springUp   — translateY 12px + scale 0.985 → ease into 0 — staggered card entrances
fadeUp     — translateY 10px→0 + fade — list items, page sections
fadeDown   — translateY -8px→0 + fade — dropdowns opening downward
pageEnter  — translateY 5px→0 + fade — page-level transitions
slideInL   — translateX -14px→0 + fade — left panel entrance
slideInR   — translateX 22px→0 + fade — right panel entrance
railPop    — scale 1→0.82→1.12→1 — rail icon tap feedback
skeletonPulse — opacity 0.45→0.85 — loading skeleton shimmer
```

### Standard patterns
```css
/* Popovers, menus, dropdowns */
animation: popIn 120ms ease-out both;

/* Cards appearing on page load */
animation: springUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;

/* Staggered card list (add --enter-delay on each item) */
.enter { animation: springUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
```

### Button micro-interactions
Every button gets lift on hover and press feedback — this is global in `styles.css`:
```css
button:not(:disabled):hover  { transform: translateY(-1px); }
button:active                { transform: scale(0.93) !important; }
```
Do not override these unless the button has a layout reason to stay fixed.

### Transition timing
- Hover state changes: `0.14s ease`
- Focus state changes: `0.15s`
- Color/background swaps: `0.14s–0.15s ease`
- Spring/bounce animations: `cubic-bezier(0.16, 1, 0.3, 1)` (Expo out)
- Always animate: `background`, `color`, `border-color`, `box-shadow`, `opacity`, `transform`
- Always include `prefers-reduced-motion` for any animation longer than 200ms.

---

## 7. Component patterns

### Card (the main container pattern — `.cal-card` is the reference)
```css
padding: 14px;
border: 1px solid var(--border-strong);
border-radius: var(--r-lg);
background: var(--bg-elevated);
box-shadow: var(--shadow-md);
animation: popIn 120ms ease-out both;  /* if it appears dynamically */
display: grid;
gap: 12px;
```

### Form field (`.cal-field` pattern)
```css
/* Label */
color: var(--text-tertiary);
font: 600 10px var(--font-mono);
text-transform: uppercase;
letter-spacing: 0.05em;

/* Input */
min-height: 38px;
border: 1px solid var(--border-strong);
border-radius: var(--r-md);
background: var(--bg-base);
color: var(--text-primary);
font: 400 13px var(--font-ui);
padding: 8px 10px;
transition: border-color 0.15s, box-shadow 0.15s;

/* Input focus */
outline: none;
border-color: var(--accent);
box-shadow: 0 0 0 3px var(--accent-tint);
```

### Sidebar row (`.calendar-row` / `.notes-tree-row` pattern)
```css
min-height: 32–40px;
border-radius: var(--r-md);
transition: background 0.14s ease, color 0.14s ease;

/* Hover */
background: rgba(255, 240, 200, 0.04);

/* Selected */
background: var(--bg-raised);
box-shadow: inset 2px 0 var(--accent);  /* left accent bar */
```

### Icon button (small action button in rows/headers)
```css
width: 26–30px;
height: 26–30px;
display: grid;
place-items: center;
border: 0;
border-radius: var(--r-sm);   /* or var(--r-md) for slightly larger */
background: transparent;
color: var(--text-tertiary);
cursor: pointer;
transition: background 0.14s ease, color 0.14s ease;

/* Hover */
background: var(--bg-raised);
color: var(--text-primary);
```

### Primary action button
```css
background: var(--accent-tint);
border: 1px solid var(--accent-tint-border);
border-radius: var(--r-md);
color: var(--accent);
font-weight: 600;
font-size: 12.5–13px;
```

### Destructive action button
```css
background: transparent;
border-color: transparent;
color: #d9573f;
```

### Popover / floating menu
```css
position: absolute;
border: 1px solid var(--border-strong);
border-radius: var(--r-lg);
background: var(--bg-elevated);
box-shadow: var(--shadow-md);
animation: popIn 120ms ease-out both;
```

### Section heading (sidebar / settings sections)
```css
color: var(--text-tertiary);
font: 600 11px var(--font-mono);
text-transform: uppercase;
letter-spacing: 0.06em;
```

### Skeleton loader
```css
background: var(--bg-raised);
border-radius: var(--r-sm);
animation: skeletonPulse 1.2s ease-in-out infinite;
```

---

## 8. Layout shell

The app uses a consistent three-zone layout: **rail → sidebar → canvas**.

```
┌──────┬───────────────┬──────────────────────────┐
│ Rail │    Sidebar    │         Canvas           │
│ 60px │    230px      │       flex: 1            │
└──────┴───────────────┴──────────────────────────┘
```

- **Rail**: narrow left strip with page icons. `width: 60px`, `background: var(--bg-base)`,
  `border-right: 1px solid var(--border)`.
- **Sidebar**: contextual list (calendars, notes tree, settings nav). `width: 230px`,
  `background: var(--bg-base)`, `border-right: 1px solid var(--border)`.
- **Canvas**: main content area. `flex: 1`, `overflow: auto`, `background: var(--bg-base)`.

New modules must use this shell. Do not invent new layout patterns.

---

## 9. Scrollbar

Globally styled in `styles.css`. Do not override.
```css
::-webkit-scrollbar        { width: 4px; height: 4px; }
::-webkit-scrollbar-thumb  { background: rgba(255, 240, 200, 0.12); border-radius: 99px; }
::-webkit-scrollbar-track  { background: transparent; }
```

---

## 10. What to never do

- Never hardcode `#hex`, `rgb()`, or pixel radius values outside `styles.css` tokens.
- Never add a new color. Use `--accent`, surface tokens, and `#d9573f` for danger only.
- Never add a new animation without an equivalent `prefers-reduced-motion` exemption.
- Never use `z-index` values above 200 without documenting why.
- Never use `!important` except inside `.theme-transition` (already in `styles.css`).
- Never create a new layout pattern — extend the rail→sidebar→canvas shell.
- Never make a button that does not animate on hover and active (global rule in `styles.css`).
- Never use inline styles for theming — always CSS classes with token variables.
