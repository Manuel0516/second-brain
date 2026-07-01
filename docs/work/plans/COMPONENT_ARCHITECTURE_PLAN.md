# Plan: Component-dominant frontend architecture

Status: ready to implement
Date: 2026-07-01

---

## Problem

The frontend has 4 shared components but many recurring UI patterns that are implemented
independently in each module using only CSS class names. This causes:

- Duplicated JSX structure (form fields, confirm dialogs, search dropdowns, save indicators)
- Inconsistent behaviour across modules (e.g. notes has no confirm dialog — it just deletes)
- New modules have to re-implement the same patterns from scratch
- Future modules (Finance, Fitness, Food) will drift further from the established patterns

## Goal

Extract every clearly reusable pattern into `src/components/` so future modules only assemble
existing primitives. Modules never reimplement UI that already exists as a component.

## New rule (already in `apps/web/AGENTS.md`)

> Before writing UI logic in a module, check `src/components/` first. If a second consumer
> is plausible, build it as a shared component from the start.

---

## Components to extract — priority order

### Priority 1 — High impact, low risk (implement first)

#### `<Card>` — the card container
Wraps `.cal-card`. Used now: EventEditor, calendar menus, notes panels.
Used next: Finance transaction form, Fitness log entry, any popover card.

```tsx
// Props
interface CardProps {
  children: React.ReactNode
  className?: string
  animate?: boolean   // default true — applies popIn animation
}
```

CSS: wraps `className="cal-card"`. No new styles needed.

---

#### `<Field>` — labelled form field
Wraps `.cal-field`. Used now: EventEditor (title, time, calendar, location, link, reminder),
settings forms.  
Used next: Finance form, Fitness form, Food form — every module has fields.

```tsx
interface FieldProps {
  label: string
  children: React.ReactNode   // the input/select/etc
  className?: string
}
```

Renders:
```html
<label class="cal-field">
  <span>LABEL</span>
  {children}
</label>
```

---

#### `<IconButton>` — small action button
The 26–30px square icon button used everywhere (sidebar actions, card close, heading buttons).
Used now: Sidebar, EventEditor close, notes tree actions, settings.

```tsx
interface IconButtonProps {
  icon: string            // emoji or nerd glyph
  label: string           // aria-label
  onClick: () => void
  size?: 'sm' | 'md'     // 26px | 30px
  variant?: 'ghost' | 'raised'
  disabled?: boolean
  className?: string
}
```

---

#### `<ConfirmDialog>` — confirmation popup
The `.scope-prompt` pattern. Used now: Sidebar (delete calendar).  
Used next: Notes (delete page), Finance (delete transaction), any destructive action.

```tsx
interface ConfirmDialogProps {
  message: string
  confirmLabel?: string   // default "Delete"
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean        // default true — shows red confirm button
}
```

Portalled to `document.body`. Matches existing `.scope-prompt` styles.

---

### Priority 2 — Medium impact (implement when a second real consumer exists)

#### `<SaveIndicator>` — saving/saved/error status badge
The tiny "Saving… / Saved / Could not save" text. Used now: EventEditor, PageView (notes).

```tsx
interface SaveIndicatorProps {
  state: 'saved' | 'saving' | 'error'
}
```

---

#### `<SearchField>` — text input with live results dropdown
Used now: EventEditor (link search for notes). Used next: Finance (merchant search),
AI capture (search), global search.

```tsx
interface SearchFieldProps<T> {
  placeholder: string
  value: string
  onChange: (value: string) => void
  results: T[]
  renderResult: (item: T) => React.ReactNode
  onSelect: (item: T) => void
  loading?: boolean
}
```

---

#### `<SidebarShell>` — module sidebar layout
The heading + scrollable list + optional footer button shell.
Used now: Calendar Sidebar, Notes PageTree (near-identical outer structure).
Used next: Finance sidebar (accounts list), Fitness sidebar (workout types).

```tsx
interface SidebarShellProps {
  title: string
  actions?: React.ReactNode      // buttons in the heading row
  children: React.ReactNode      // the list content
  footer?: React.ReactNode       // e.g. trash link
}
```

Note: the domain-specific list items (calendar rows, page tree rows) stay in the module.
Only the outer chrome is shared.

---

#### `<LinkedItems>` — cross-module link list
The "linked notes / linked events" section pattern. Used now: EventEditor (linked notes),
PageView Backlinks. Used next: Finance transactions linked to events, Fitness logs linked
to events.

```tsx
interface LinkedItemsProps {
  title: string
  items: Array<{ id: string; label: string; icon?: string }>
  onOpen: (id: string) => void
  onUnlink?: (id: string) => void   // optional — backlinks don't have unlink
}
```

---

### Priority 3 — Deferred (not yet needed in two places)

- `<Breadcrumbs>` — currently only in PageView. Extract when a second module needs it.
- `<Popover>` — base floating-card wrapper. Extract when the pattern diverges from the
  current inline implementations.
- `<Modal>` — full overlay modal. Not yet used. Extract when first needed.
- `<Skeleton>` — loading placeholder. Extract when first used in multiple places.
- `<Tag>` / `<Chip>` — small label pill. Extract when Finance or Fitness needs categories.

---

## What does NOT get extracted

- Module-specific list rows (`CalendarRow`, `PageTreeRow`) — their logic is domain-specific.
- Module-specific editors (`EventEditor`, `BlockEditor`) — too domain-coupled.
- `AppRail` — already a component, no changes needed.
- `EmojiPicker`, `Segmented`, `ProtectedRoute` — already correctly in `src/components/`.

---

## Implementation approach

Do NOT refactor everything at once. Extract one component at a time as follows:

1. Write the component in `src/components/<Name>.tsx` using the exact CSS classes already
   in `styles.css` — no new CSS.
2. Replace the first consumer (wherever the pattern currently lives).
3. Replace remaining consumers.
4. Add the component to this table:

| Component | Status | First consumer | All consumers replaced |
|-----------|--------|----------------|----------------------|
| `<Card>` | done | Sidebar (calendar menu) | Sidebar — only the menu card uses it; form cards keep raw class |
| `<Field>` | done | Sidebar (ColorField) | Sidebar (ColorField, Name fields) — 3 consumers replaced |
| `<IconButton>` | done | Sidebar (title actions) | Sidebar, EventEditor (close), PageTree (new/close), SettingsLayout (close) |
| `<ConfirmDialog>` | done | Sidebar (delete calendar) | Sidebar, Notes (delete page) |
| `<SaveIndicator>` | todo | EventEditor | — |
| `<SearchField>` | todo | EventEditor | — |
| `<SidebarShell>` | todo | Sidebar | — |
| `<LinkedItems>` | todo | EventEditor | — |

---

## Verification

After each component extraction:
```bash
npm run check --workspace @secondbrain/web
```

Visual check: open `/calendar` and `/notes` — both must look identical to before.
No new CSS. No behaviour changes. Pure structural extraction.
