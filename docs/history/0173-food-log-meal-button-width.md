# 0173 — Food Log meal button width

Date: 2026-07-24
Status: accepted

## What changed

The Food topbar’s Log meal action now has a 300px maximum width on phone and tablet-sized
viewports, matching the Overview/Stats/History segmented navigation width. The button still
fills its action slot at narrow widths and keeps its existing desktop treatment.

## Why

The Log meal action stretched wider than the page navigation on mobile and iPad layouts,
making the topbar feel unbalanced.

## Files touched

- `apps/web/src/modules/food/food.css` — caps the responsive topbar action width at 300px
  and makes the button fill that shared width.

## How the pieces connect

The Food page already gives `.food-tabs` a 300px width. The responsive `.food-topbar-actions`
rule now uses the same maximum, so the existing `Food.tsx` button automatically aligns with
the shared navigation without changing meal-log behavior.

## How to modify this later

If `.food-tabs` changes width, update the responsive action `max-width` in the same stylesheet
so Log meal and the section navigation remain aligned.
