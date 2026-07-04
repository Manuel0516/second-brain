# 0041 — Hierarchical list markers by nesting depth

Date: 2026-07-04
Status: accepted

## What changed

Extended the list marker styling system so bullet and numbered lists automatically
cycle through different marker styles as they nest deeper, rather than using the
same marker at every depth.

- **Bullet hierarchy**: disc → circle → square → dash → repeat
- **Numbered hierarchy**: decimal → lower-alpha → lower-roman → upper-alpha → upper-roman → repeat

The setting pick (e.g. `circle` for bullets or `lower-roman` for numbered) determines
the depth-1 style; each deeper nesting level advances one step through the cycle.

The **decimal** numbered style uses legal-style numbering (CSS counters) instead
of a cycle: `1.`, `1.1.`, `1.1.1.`, … — each nesting level shows the full path
from the root `ol`.

The settings previews were also updated to show nested list items so users can see
the hierarchy at a glance.

Removed the hardcoded `list-style: decimal` / `list-style: disc` defaults from
`notes.css` that were overriding the settings-driven rules in `listMarkers.css`,
so the selected style now correctly applies in the notes editor.

## Why

User request: nested lists were visually indistinguishable from flat lists because
every depth used the same bullet or number. Adding automatic depth cycling makes
the nesting structure readable at a glance, matching the behaviour users expect
from standard word processors and rich-text editors.

## Files touched

- `apps/web/src/modules/notes/listMarkers.css` — replaced flat per-style rules
  with depth-cycled rules (5 depths for bullets, 6 depths for numbered, per style);
  decimal uses CSS counters for legal-style numbering (`1.`, `1.1.`, `1.1.1.`)
- `apps/web/src/modules/settings/NotesSettings.tsx` — updated both previews from
  flat item lists to 3-level nested lists so the hierarchy renders in the settings UI
- `apps/web/src/modules/notes/notes.css` — removed conflicting `list-style: decimal`
  and `list-style: disc` rules that were overriding `listMarkers.css` due to higher
  specificity

## How the pieces connect

The `data-bullet-style` and `data-numbered-style` attributes are set by
`BlockEditor.tsx` (and rendered in the settings preview). The CSS selectors use
descendant combinator chaining (`ul`, `ul ul`, `ul ul ul`, …) so that each deeper
level targets its own `list-style-type`. Because `ul ul ul` is more specific than
`ul ul`, the cascade resolves correctly without `!important`.

For the decimal legal style, `counter-reset` / `counter-increment` on each `ol`/`li`
pair tracks the nesting stack, and `::marker { content: counters(…) }` renders the
full path (e.g. `1.2.1.`).

Task lists remain excluded via `:not([data-type='taskList'])`, preserving their
native checkboxes.

## How to modify this later

To change the cycle order or add a new bullet/numbered style:

1. Add the new value to the `UserSettings` type in `SettingsContext.tsx` and the
   options array in `NotesSettings.tsx`.
2. Add a new block of CSS rules in `listMarkers.css` for that value, copying the
   pattern from an existing block (one rule per depth level).
3. The cycle should be visually natural: filled → hollow → square → symbol for
   bullets; decimal → alpha → roman → uppercase for numbered lists.
4. Update the preview in `NotesSettings.tsx` if changing how nested items display.
