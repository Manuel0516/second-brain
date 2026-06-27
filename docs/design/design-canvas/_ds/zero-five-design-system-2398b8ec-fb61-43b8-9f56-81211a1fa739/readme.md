# Zero-Five Design System

## About

**Zero-Five** is a creative developer studio building modern tools, libraries, and platforms. We combine artistic vision with engineering precision — our brand is defined by the **Neon Planet** mark (electric cyan gradient) and **dragon yin-yang** (balance of creativity & structure). The system is dark-mode first, built on **Inter** (body/headlines) and **JetBrains Mono Nerd Font** (code/labels), with **electric cyan** (`#22D3EE`) as the primary accent and **green** reserved for success/positive states only.

Real brand assets provided: logos (neon planet, dragon yin-yang), Nerd Font files. This system bridges **creative** (visual identity, brand marks) and **developer** (API docs, components, tooling).

---

## Product Context

Zero-Five is a platform for creative developers. Primary surface: a showcase site featuring tools, libraries, and services. The system extends to documentation sites, API references, component showcases, and community spaces.

---

## Content Fundamentals

**Voice & Tone**
Zero-Five speaks with quiet confidence. No hype, no filler. Every word earns its place.

**Casing**
- Headings: ALL CAPS for brand marks and section labels; Title Case for page headings
- Body copy: Sentence case
- UI labels and metadata: UPPERCASE MONO (via `--font-mono` at small size)

**Pronouns & perspective**
Second person by default ("your sound," "your work"). First person sparingly — and only in intimate contexts ("I create systems…"). No corporate "we."

**Punctuation conventions**
- Em dashes over hyphens in display copy: `ZERO—FIVE`
- Ellipsis as a device for tension, not trailing off
- No Oxford comma (clean, concise phrasing avoids serial lists)

**Emoji**
None. The brand communicates through typography and space, not glyphs.

**Numerals**
Use numerals for everything: "5 releases," "2024," "01 — 12." Space Grotesk's tabular numerals are a core part of the visual identity.

**Specific examples**
> "Selected work, 2019–2024."
> "Zero-Five creates music that occupies the space between structure and improvisation."
> "Listen. 05."

---

## Visual Foundations

### Color
Dark-mode first. The primary background is `#0F1014` — near-black with a cool undertone. Surface hierarchy uses 5 dark levels (`--color-dark-100` through `--color-dark-500`) with subtle contrast. The single accent is **Electric Mint** (`#3EFFC3`): used sparingly for interactive affordances, emphasis, and the brand dash in `ZERO—FIVE`. Semantic colors (red, amber, green, blue) are used only for status/feedback, never decoration.

### Typography
Three typefaces, strictly scoped:
- **Space Grotesk** (display): Headlines, brand marks, hero copy. Distinctive geometric numerals. Set tight with negative tracking at large sizes.
- **DM Sans** (body): Paragraphs, captions, UI copy. Optical-size optimized, highly readable at 15px.
- **JetBrains Mono** (labels/mono): Uppercase UI labels, metadata, timestamps, track listings. Never body text.

### Spacing
4px base unit. Scale lives in `--space-1` (4px) through `--space-48` (192px). Layout uses `--space-20` (80px) vertical section rhythm at mobile; `--space-32` (128px) at desktop.

### Backgrounds & Imagery
No gradients. No textures. Solid dark surfaces with thin `1px` borders. Imagery (when used) should be **desaturated / high-contrast**, cool-toned, and full-bleed — never inside a card container with a shadow.

### Animation & Motion
Transitions are fast (`--dur-fast`: 120ms) and smooth (`--ease-out`). No decorative loops. Entrance animations fade in or translate up (12–16px). Nothing bounces. The spring easing (`--ease-spring`) is reserved for precise moments: a modal open, a tooltip appear.

### Hover & Press States
- Buttons: background color shift (no scale/shadow trick)
- Ghost/icon buttons: `--interactive-ghost-hover` background fill
- Links: accent color on hover
- Cards (interactive): border brightens to `--border-strong`; no lift/shadow animation

### Borders & Cards
Border radius is minimal: `--radius-xs` (2px) to `--radius-lg` (8px). Cards use `--bg-elevated` background + `1px solid var(--border-subtle)` — no outer glow, no heavy shadow. Only modals/overlays use prominent shadow (`--shadow-lg`).

### Transparency & Blur
Glass/blur effects avoided. Overlays use solid dark backgrounds (`--bg-overlay`) with high opacity (0.95+). Semi-transparency only in accent subtle (`--color-accent-subtle`) and ghost button states.

### Corner Radii
Sharp to minimal: interactive elements use `--radius-md` (5px); containers `--radius-lg` (8px); pills `--radius-full`. Never a heavy bubble radius.

### Iconography
→ See ICONOGRAPHY section below.

---

## Iconography

**No proprietary icon system was provided.** Recommended approach: **Phosphor Icons** (https://phosphoricons.com/) — clean, stroke-based, available in Regular/Bold/Duotone weights, CDN-available. Stroke weight matches DM Sans's visual weight at body sizes.

For SVG icons embedded directly: `stroke="currentColor"` with `strokeWidth="1.5"` at 16–24px. Never fill-style icons.

Unicode characters used as minimal marks:
- `—` (em dash) in wordmark: `ZERO—FIVE`
- `·` (interpunct) for separators in mono labels
- `↗` (northeast arrow) for external links

No emoji. No icon fonts (prefer inline SVG).

**Placeholder:** Until a custom icon set is defined, use Phosphor Regular weight from CDN:
```html
<script src="https://unpkg.com/@phosphor-icons/web"></script>
<i class="ph ph-arrow-up-right"></i>
```

---

## File Index

```
styles.css                    ← Global CSS entry point (consumers link this)
tokens/
  fonts.css                   ← Google Fonts @import + font family vars  ⚠ needs real files
  base.css                    ← Box-sizing reset, body defaults
  colors.css                  ← Color primitives + semantic aliases
  typography.css              ← Type scale + weight + role vars
  spacing.css                 ← 4px-base spacing scale + semantic aliases
  effects.css                 ← Radius, shadow, motion, z-index tokens
guidelines/
  brand.card.html             ← Brand identity overview
  color-dark.card.html        ← Dark surface hierarchy
  color-accent.card.html      ← Electric mint accent + states
  color-neutrals.card.html    ← Neutral gray scale
  color-semantic.card.html    ← Semantic status colors
  type-display.card.html      ← Space Grotesk specimens
  type-body.card.html         ← DM Sans specimens
  type-mono.card.html         ← JetBrains Mono specimens
  type-scale.card.html        ← Full type scale
  spacing-tokens.card.html    ← Spacing token scale
  spacing-visual.card.html    ← Semantic gap/padding aliases
  effects-radii.card.html     ← Border radius system
  effects-shadows.card.html   ← Shadow elevation system
  effects-motion.card.html    ← Easing + duration tokens
components/core/
  Button.jsx / .d.ts          ← Button (primary/secondary/ghost/danger)
  Input.jsx / .d.ts           ← Text input with label/error/hint
  Badge.jsx / .d.ts           ← Status badge (6 variants)
  Tag.jsx / .d.ts             ← Removable tag/chip
  Card.jsx / .d.ts            ← Content container (4 variants)
  core.card.html              ← Component showcase card
assets/
  logo-wordmark.svg           ← Full horizontal wordmark
  logo-mark.svg               ← "05" compact mark
ui_kits/portfolio/
  index.html                  ← Interactive portfolio website
readme.md                     ← This file
SKILL.md                      ← Agent skill descriptor
```

---

## Assets Included

✅ **Logos** — Neon Planet (glow + gradient), Dragon Yin-Yang (balance mark)  
✅ **Fonts** — JetBrains Mono Nerd Font files (self-hosted)  
✅ **Colors** — Electric cyan accent, dark neutrals, semantic palette  
✅ **Components** — Button, Input, Badge, Tag, Card (5 primitives)

## Caveats

⚠️ **Wordmark rebuild needed** — the Zero-Five text logotype should be designed/imported; currently using typographic placeholder.

⚠️ **Portfolio content** — currently generic "developer tools" placeholder; should highlight actual Zero-Five projects, services, and creative direction.
