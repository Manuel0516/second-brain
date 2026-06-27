# Design System — v2 (Zero-Five, applied calm)

Supersedes the ad-hoc palette in the first mockup. Built on your real Zero-Five tokens, not
invented from scratch — the brief is "your brand, executed with restraint," not a new brand.

## 1. What we're keeping from Zero-Five as-is
- **Inter** for UI/display, **JetBrains Mono** for labels/data/timestamps — already a clean,
  restrained pairing, no changes needed.
- **Spacing scale** (4px base) and **radius scale** (2–12px) — your tokens are already close
  to Claude UI's actual numbers. Reused directly.
- **Motion**: fast (120–200ms), subtle, no bounce — reused directly.
- **Shadow discipline**: shadows reserved for overlays/modals/panels only, never on static
  cards — this was already in your guidelines, just under-applied because the Neon Planet
  logo's glow effect made the whole system feel louder than the tokens actually are.

## 2. What we're changing
- **Dropping glow/blur from UI chrome.** The Neon Planet mark stays as a brand asset (splash
  screen, marketing, README) but never appears as a glowing element inside the product itself.
- **Adding a real light mode.** Zero-Five is dark-first for a developer-studio site; a tool
  you live inside all day needs to be comfortable at 2pm with sun through a window, not just
  at night.
- **Color is reserved for meaning.** The electric cyan accent is for interactive states only
  (primary buttons, active nav, focus rings, links) — never a background wash. Calendar
  category colors are a *separate* palette (§4), used only for events/tags, never for chrome.

## 3. Theme Tokens

### Dark (your existing tokens, applied more sparingly)
```
--bg-base:      #111114
--bg-elevated:  #18181C
--bg-raised:    #28272D
--border:       rgba(255,255,255,0.08)
--text-primary: #F0EFF8
--text-secondary: #AAA8BB
--text-tertiary:  #6B6880
--accent:       #22D3EE
--accent-text-on-light: #0C8AA3   /* deepened, for accent text needing contrast on light bg */
```

### Light (new — derived to match, not invented separately)
```
--bg-base:      #F6F4EF
--bg-elevated:  #FFFFFF
--bg-raised:    #FBFAF7
--border:       rgba(20,18,30,0.09)
--text-primary: #18171C
--text-secondary: #5C5868
--text-tertiary:  #8A8799        /* reused directly from your neutral-400 — works on both */
--accent:       #0C8AA3          /* deepened cyan for contrast; raw #22D3EE used for icons/borders only */
```

Both themes share: same Inter/JetBrains Mono stack, same spacing/radius/motion tokens, same
shadow-only-on-overlays rule.

## 4. Calendar Category Palette (separate layer — events & tags only)

Picked to stay visually distinct from the cyan accent (no teal/cyan-adjacent hues, so an event
chip is never confused with an interactive control):

| Category (example) | Color | Hex |
|---|---|---|
| Work | Cobalt | `#3B6FE0` |
| Fitness | Verdant | `#2E9E6E` |
| Finance | Amber | `#D6932B` |
| Personal | Plum | `#8B5CF6` |
| Deadlines | Coral | `#D9573F` |
| Food | Rose | `#E0529A` |

Events render as a soft tint background + colored left border (per the first mockup) — never
a full saturated fill. This is the "more colorful than Notion Calendar" requirement, fully
contained to the calendar/tag layer, never bleeding into buttons, nav, or panels.

## 5. Logo Usage
- **Primary in-product mark**: the "05" flat SVG (`logo-mark.svg`) — already vector, themes
  cleanly (swap the "0" color between dark/light text token, keep "5" in accent).
- **Dragon yin-yang**: reserved for now — needs a proper transparent vector export before it
  can render crisply at small sizes (currently a textured JPEG). Worth doing if you want it as
  the primary mark; it's a stronger, more personal signature than "05."
- **Neon Planet (glow)**: brand/marketing use only (splash screen, README), not in the app UI.

## 6. Responsive Breakpoints

| Breakpoint | Range | Layout |
|---|---|---|
| Desktop | ≥1024px | Icon rail + contextual sidebar + main canvas + slide-over detail panel |
| Tablet | 640–1023px | Sidebar collapses to an overlay drawer (toggled by a menu button); main canvas full width |
| Mobile | <640px | Rail + sidebar replaced by a bottom tab bar (Calendar/Notes/Finance/Fitness/Food); calendar switches from week-grid to a vertical agenda list; detail panel becomes a bottom sheet instead of a side panel |

Touch targets ≥44px on mobile/tablet. The week-grid calendar view is genuinely hard to use
well on a phone — the agenda/list view becomes the *default* under 640px rather than a
cramped shrunk grid.
