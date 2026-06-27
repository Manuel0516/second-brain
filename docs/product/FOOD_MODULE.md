# Food Module — Deep Dive

## 1. Core Data Model

```
FoodLog
  id, date, meal_type: "breakfast"|"lunch"|"dinner"|"snack"
  items   jsonb     # [{ name, quantity, unit, calories, protein, carbs, fat }]
  photo_id  FK -> Attachment | null      # the photo, if logged that way
  source: "manual" | "ai_capture"        # ready for Phase 5 without a schema change later
  linked_event_id  FK -> CalendarEvent | null

WaterLog
  id, date, amount_ml

NutritionTarget                          # powers progress bars, same `Goal` pattern as Fitness
  id, calories, protein_g, carbs_g, fat_g, water_ml
  effective_from   date                  # so targets can change over time without losing history
```

`FoodLog.items` being structured (not free text) from day one is what makes the future
"photo → macros" AI step (Phase 5) a drop-in: the AI just needs to populate the same shape a
manual entry would, `source` flips to `"ai_capture"`, and every downstream view (daily totals,
charts) already works without modification.

## 2. Daily View

```
GET /food/summary?date=2026-06-23
→ { calories: {consumed, target}, protein: {...}, carbs: {...}, fat: {...},
    water: {consumed_ml, target_ml}, meals: [...] }
```
Same progress-bar pattern as Fitness `Goal`s — calories/macros/water each render as a
progress bar against `NutritionTarget`, using one shared UI component rather than a
bespoke one per metric.

## 3. Recipes — a Notes database, not a separate system

"Recipes" is a `Database` page (per `NOTES_MODULE.md` §2), reusing the exact same engine as
everything else rather than inventing a new content type:

```
Recipe (a Page in the Recipes database)
  Properties: Name, Tags (multi-select: "quick","high-protein","vegetarian"...),
              Calories/serving, Macros/serving, Source URL, Prep time
  Body (blocks): ingredients list, instructions — same block editor as every other page
```

### The TikTok piece specifically
Two distinct things you mentioned, worth keeping separate:
1. **Saving a specific recipe you found** — a Recipe page with a `Source URL` property
   pointing at the TikTok video. TikTok supports a public **oEmbed** endpoint
   (`https://www.tiktok.com/oembed?url=...`) that returns a thumbnail + embeddable preview
   without needing API authentication — so a saved recipe can show the actual video preview
   inline rather than just a bare link.
2. **A quick-access shortcut to your go-to recipe source** (a TikTok account/hashtag you
   browse when you need inspiration, not a specific saved video) — this is just a pinned
   bookmark, not really "data" — a single link card at the top of the Recipes page, no
   database entry needed for something that isn't a specific recipe yet.

## 4. What Carries Over From Fitness's Design Decisions
- Same `WearableMetric`-style separation logic applies if you ever want a smart-scale or
  food-scanning device synced later — bulk/automatic data stays in its own table, distinct
  from what you log yourself.
- Same `source: "manual" | "ai_capture"` pattern Fitness will likely want too, once Phase 5
  exists — consistent shape across modules rather than each one inventing its own flag.

## 5. API Surface (sketch)

```
GET/POST  /food/logs
GET       /food/summary?date=
GET/POST  /food/water
GET/POST  /food/targets
```
(Recipes don't need their own API — they're a Notes database, already covered by the
`/pages` and `/databases` endpoints in `NOTES_MODULE.md` §7.)
