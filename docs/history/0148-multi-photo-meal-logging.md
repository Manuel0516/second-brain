# 0148 — Multi-photo meal logging

Date: 2026-07-22
Status: accepted

## What changed

Meal logs now support up to 15 ordered photos instead of one. New and past meals accept
multi-file uploads, repeated camera captures, drag/drop, paste, individual removal, manual save,
and explicit combined AI analysis. Existing single photos migrate into the first position. The
completed implementation contract is archived in this entry; the finished visual pass is
documented separately in [0151](0151-multi-photo-meal-log-visual-pass.md).

## Why

Long meals such as barbecues can contain several dishes eaten and photographed at different
times. Keeping those photos in one meal log makes capture easier and lets AI calculate one
combined nutrition result without splitting the occasion into artificial meals.

## Files touched

- `apps/api/alembic/versions/027_meal_log_photos.py` — creates and backfills ordered photo
  associations, then removes the single-photo column.
- `apps/api/app/models.py` — replaces the direct photo field with `MealLogPhoto`.
- `apps/api/app/routes/food.py` — validates, returns, replaces, analyzes, and deletes ordered
  photo collections.
- `apps/api/tests/test_food.py` — covers ordering, replacement, validation, deletion, and
  multi-image AI requests.
- `apps/web/src/modules/food/api.ts` — updates meal contracts and the analysis request.
- `apps/web/src/modules/food/MealLogModal.tsx` — implements functional multi-photo capture,
  removal, progress, explicit analysis, and saving for new and existing meals.
- `apps/web/src/modules/food/History.tsx` — uses the first image as cover and shows the remaining
  image count.
- `apps/web/src/modules/food/food.css` — supplies the gallery/count styling completed in 0151.
- `apps/web/src/modules/food/MealLogModal.test.tsx` and `History.test.tsx` — cover functional
  modal and history behavior.
- `docs/product/FOOD_MODULE.md` and `docs/architecture/DATABASE.md` — document the capability and
  normalized storage model.
- This history entry and 0151 permanently archive the completed functional and visual plans; the
  corresponding active-work plan files were retired after acceptance.

## How the pieces connect

Uploaded bytes and metadata still use the shared files service. `meal_log_photos` connects those
files to a meal with a stable position. Food endpoints translate the association rows into the
ordered `photo_file_ids` array consumed by the React modal and History. The modal persists that
array before calling the no-body analysis endpoint, which downloads every associated image in
order and sends one multimodal request. Removing or deleting attachments cleans both association
and file storage records.

## How to modify this later

Change `MAX_MEAL_PHOTOS` together in the Food route and modal if the limit changes. Preserve the
ordered full-replacement contract when changing photo editing. AI prompt or provider changes stay
in `food.py`; do not move per-photo totals into the association table unless the product adopts a
separate per-dish nutrition model. For visual changes, follow
[0151](0151-multi-photo-meal-log-visual-pass.md), then create a separate history entry.
