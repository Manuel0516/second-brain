# 0253 — Willys offers tool: every current offer, matched against a shopping list

Date: 2026-08-16
Status: accepted

## What changed

The agent can now read **all** current Willys offers through a dedicated
`willys_offers` tool instead of trying to scrape `willys.se/erbjudanden` with
`web_fetch`. Given a list of shopping-list items it returns only the offers that
match each item, which is the case the user actually wanted: "find the things on
my list that are on sale and write them down".

New module `apps/api/app/modules/ai/willys.py` sweeps Willys' public category
listing API and keeps every product carrying a promotion — currently ~790 offers
out of ~12 200 products, in about 11 seconds, cached for 6 hours.

## Why

User request: get "absolutely all the Willys offers in an easy way, such that it
can write them in my shopping list if there are items that match."

`web_fetch` could not do this, and the codebase already knew it — `tools.py`
carries a warning against guessing a `willys.se/erbjudanden` URL, and `web.py`
truncates every page at `MAX_TEXT_CHARS = 6_000`. A store's offer list is far
larger than that, so "all offers" was structurally impossible through it.

## How the source was chosen (the part worth not re-deriving)

Willys is a Next.js frontend over an Axfood/Hybris backend. Four things were
established by probing the live site, and they explain every design decision here:

1. **There is no promotions-only endpoint.** The client bundle *does* reference
   `/axfood/rest/v1/search/campaigns/{offline,online,mix}` and
   `/axfood/rest/v1/promotionproduct/*`, but all of them return 404 on the live
   deployment — they belong to a shared Axfood client that Willys does not
   expose. Do not spend time trying to make those work again.
2. **Promotions only exist inside the category listing.** `/axfood/rest/v1/c/{slug}`
   returns each product with a `potentialPromotions[]` array. There is no
   promotion facet to filter on (facets are only `commercialName2` and
   `productLabelTypes`), so a full sweep plus client-side filtering is the only
   way to see everything.
3. **The sweep is anonymous.** No login, no store session, no browser, no CSRF.
   A `storeId` query param is accepted but *ignored* — verified identical results
   for stores 2110/2149/2355 — because e-handel offers are national. That is why
   the tool deliberately has no store argument.
4. **The printed in-store flyer is not usable as data.** Each store has one at
   `viewer.ipaper.io/willys/{storeId}` (from `/axfood/rest/v1/store/active`'s
   `flyerURL`), but its viewer config shows `"enrichments":{"chunkUrls":{},
   "pageChunksIndexes":{}}` — empty. It is page images with no text layer and
   signed, expiring image URLs whose token is generated in JS. Reading it would
   mean Playwright plus OCR of ~8 images, with prices coming from vision rather
   than data. It was considered and rejected for that reason.

## Files touched

- `apps/api/app/modules/ai/willys.py` — new. `all_offers()` (cached sweep of the
  category tree), `_sweep()` (concurrent paging, 8 at a time, size 100),
  `_offer()` (flattens a product + promotion into a compact record), `match()`
  (groups offers by which shopping-list item they hit).
- `apps/api/app/modules/ai/tools.py` — registered the `willys_offers` tool and
  its `execute` branch. With `items` it returns matches plus a `no_offer` list;
  without, a capped browse list. Passes `model_content` so the provider sees the
  full JSON rather than only the chip summary.
- `apps/api/tests/test_willys.py` — new. Covers promotion-field mapping, the
  LOYALTY→`member_only` flag, diacritic/case-insensitive matching, the
  word-prefix rule, items with no offers, and the per-item cap. No network.

## How the pieces connect

`willys_offers` is read-only (`is_write=False`), so it needs no confirmation
card. Writing matches to the shopping list is **not** part of this tool — the
agent already has the append-only note endpoint from 0243, so it reads the list,
calls `willys_offers(items=[...])`, and appends what came back. That keeps the
write going through the normal visible-write path instead of inventing a second
one.

The offer record is deliberately compact (`name`, `price`, `ordinary`, `save`,
`offer`, `compare`, `member_only`, `limit`, `until`, `category`). The full list
is ~790 entries, which is why `items` matching happens server-side: dumping
everything into the model's context is exactly the failure mode `web_fetch` had.

`member_only` comes from `campaignType == "LOYALTY"` — those need a Willys Plus
membership, the rest are `GENERAL`. Worth surfacing, since a member-only price is
not one the user can necessarily get.

## How to modify this later

- **Offers look stale**: the cache is process-local with `CACHE_TTL = 6 * 3600`.
  Call `all_offers(refresh=True)` to force a sweep. It is a module-level dict, so
  it resets on restart and is per-worker — move it to the DB before running
  multiple API workers.
- **Matching misses things people type**: `match()` uses whole-word-prefix on a
  diacritic-stripped, casefolded name. This intentionally rejects bare substrings
  ("ost" must not match "Kompost") but *does* match Swedish compounds, so "mjölk"
  also returns "Mjölkchoklad". If that noise matters, swap the regex for pgvector
  similarity — the marked `ponytail:` comment in `match()` is the place.
- **Willys restructures their API**: the sweep depends on two paths only —
  `leftMenu/categorytree` for the category list and `/axfood/rest/v1/c/{slug}`
  for products. If offers ever vanish, check whether `potentialPromotions` is
  still the field name before assuming the endpoint moved.
- **Adding another chain** (Hemköp is the same Axfood backend): generalise
  `BASE` and the category path rather than copying the module.
