# 0153 — Meal log modal primary buttons render in the app accent (portal token fix)

Date: 2026-07-22
Status: accepted

## What changed

The "Analyze photos" and "Log meal / Save meal" primary buttons in the meal log card now render
in the app's blue accent, matching every other primary button (e.g. the Food topbar "Log meal"
button and the settings save button). Previously they appeared colorless.

## Why

`MealLogModal` renders through `createPortal(..., document.body)`, so its DOM lives outside the
`.food-page` wrapper. The food accent tokens (`--food-accent`, `--food-accent-tint`,
`--food-accent-border`) are declared **only on `.food-page`**, and CSS custom properties inherit
down the real DOM tree — so inside the portal those tokens were undefined. Every rule that used
them (`.food-primary-button`, `.food-meallog-input:focus`, `.food-meallog-textarea:focus`,
`.food-meallog-type-pill.active`) fell back to no color: buttons had no tint/border, focus rings
and active pills lost their accent. The user reported the two primary buttons; the fix repairs the
whole set at once.

## Files touched

- `apps/web/src/modules/food/food.css` — added a re-declaration of the four `--food-accent*`
  tokens on `.food-meallog-backdrop` (the portal root that wraps the modal), mirroring the values
  on `.food-page`. Because the backdrop is the modal's ancestor in the portaled tree, the tokens
  now cascade into every element inside the modal.

## How the pieces connect

`--food-accent: var(--accent)` — the food accent IS the app accent (cyan/blue); the module never
diverged to a distinct color despite the stale "amber" comment at the top of `food.css`. So
re-declaring the tokens on the backdrop simply makes the app accent reach the portaled modal.
`.food-primary-button` reads `--food-accent-tint` (background), `--food-accent-border` (border),
and `--food-accent` (text); with the tokens now resolving, it matches the Food page's own primary
buttons exactly. The same tokens feed the input focus glow and the active meal-type pill, so those
recover their accent too.

## How to modify this later

- To change the modal's accent, edit the `--food-accent*` block on `.food-meallog-backdrop`; to
  change it app-wide for the Food page, edit the matching block on `.food-page`. Keep the two in
  sync, or the modal will visually drift from its page.
- If another food component is ever portaled outside `.food-page`, it will hit the same issue —
  either re-declare the tokens on its portal root or switch it to the global `--accent*` tokens.
- The cleaner long-term option is to delete the `--food-accent*` indirection entirely (it only
  ever aliases `--accent`) and use the global accent tokens directly; that removes the scoping
  trap but touches every food-accent reference, so it was left out of this minimal fix.
