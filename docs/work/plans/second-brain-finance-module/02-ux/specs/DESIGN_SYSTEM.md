# Finance design system

The mockups use a calm, high-density style inspired by the existing Second Brain module. They
are references for information hierarchy and interaction, not a second design system.

All Finance UI must use the existing `apps/web/src/styles.css` tokens and the rules in
`docs/design/STYLE_GUIDE.md`. Do not copy literal values from the mockups or this document into
component styles.

## Visual tokens

See [`design-tokens.json`](design-tokens.json) for the semantic mapping to existing token names.

### Surfaces

- Application, rail, sidebar and canvas surfaces use `--bg-base`, `--bg-elevated` and
  `--bg-raised`.
- Cards and inspectors use the existing `.cal-card` patterns and `--r-lg`/`--r-xl`.
- Focus and primary actions use `--accent`; danger uses the existing danger token/pattern.
- Semantic review status must have text/icon plus a semantic status class; color is never the
  only signal. If status colors are introduced, define them centrally in `styles.css` first.

### Typography

- Interface text: `var(--font-ui)`.
- Labels and metadata: `var(--font-mono)`.
- Numbers: tabular numerals.
- Avoid oversized metrics; preserve dense information without visual noise.

### Radius and spacing

- Cards: `var(--r-lg)` or `var(--r-xl)`.
- Controls: `var(--r-sm)` or `var(--r-md)`.
- Main grid gap: existing 12–16px spacing guidance.
- Dense table row: 52–64 px.

### Motion

- 120–180 ms for hover/focus.
- 180–240 ms for panel expansion.
- Disable decorative animation when reduced motion is requested.
- Charts should animate only on first load or filter change, never continuously.

### Accessibility

- Rail→sidebar→canvas shell at the existing widths.
- Visible keyboard focus.
- Text and status icons meet contrast requirements.
- Status includes icon/text, not color alone.
- Tables expose semantic headers and row actions.
- Chart data is available as an accessible table.
