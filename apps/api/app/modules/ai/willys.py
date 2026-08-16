"""Willys grocery offers.

Willys exposes no promotions-only endpoint. Promotions only ever appear
embedded in the category listing (`/axfood/rest/v1/c/{slug}`) as each product's
`potentialPromotions`, and the listing has no promotion facet to filter on. So
"every current offer" means sweeping the category tree — ~12k products over
~130 pages of 100 — and keeping the products that carry a promotion. That takes
about ten seconds concurrently, which is why the result is cached rather than
recomputed per question.

The sweep is anonymous: no login, no store session, no browser. A `storeId`
query param is accepted but ignored by their backend — e-handel offers are
national, so there is deliberately no store argument here.

The printed in-store flyer (`viewer.ipaper.io/willys/{storeId}`) is a different
dataset and is NOT used: it is page images with no text layer and no
enrichment data, so reading it would require OCR.
"""

import asyncio
import re
import time
import unicodedata
from datetime import UTC, datetime
from typing import Any

import httpx

JSON = dict[str, Any]

BASE = "https://www.willys.se"
_TREE = "/axfood/rest/v1/leftMenu/categorytree?storeId=2110&deviceType=OTHER"
_PAGE_SIZE = 100
_CONCURRENCY = 8
_TIMEOUT = 30.0
# Offers turn over weekly, so an hours-long cache is still always fresh enough.
# ponytail: process-local dict, not Redis — one API process, and a cold start
# only costs one ~10s sweep. Move it to the DB if this ever runs multi-worker.
CACHE_TTL = 6 * 3600
_cache: tuple[float, list[JSON]] | None = None
_lock = asyncio.Lock()

_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)


class WillysError(Exception):
    """Willys could not be reached or returned something unusable."""


# Words that carry no product meaning, so they must never become search terms.
_STOPWORDS = frozenset(
    {
        "and",
        "the",
        "for",
        "with",
        "och",
        "med",
        "till",
        "fresh",
        "organic",
        "large",
        "small",
        "some",
        "any",
        "eko",
        "ekologisk",
        "stor",
        "liten",
        "farsk",
    }
)

# English (and a few Swedish variants) -> Swedish product words. Willys product
# names are Swedish only; without this an English shopping list matches nothing.
# ponytail: a plain table, not a translation API — groceries are a small closed
# vocabulary and this needs to work offline and instantly.
_ALIASES: dict[str, tuple[str, ...]] = {
    # vegetables
    "cucumber": ("gurka",),
    "carrot": ("morot", "morotter"),
    "carrots": ("morot",),
    "tomato": ("tomat",),
    "tomatoes": ("tomat",),
    "crushed tomatoes": ("krossade tomater", "tomat"),
    "onion": ("lok", "gul lok"),
    "onions": ("lok",),
    "leek": ("purjolok",),
    "garlic": ("vitlok",),
    "potato": ("potatis",),
    "potatoes": ("potatis",),
    "pepper": ("paprika", "peppar"),
    "peppers": ("paprika",),
    "bell pepper": ("paprika",),
    "broccoli": ("broccoli",),
    "cauliflower": ("blomkal",),
    "cabbage": ("kal",),
    "spinach": ("spenat",),
    "lettuce": ("sallad",),
    "salad": ("sallad",),
    "mushroom": ("champinjon", "svamp"),
    "mushrooms": ("champinjon",),
    "peas": ("art", "arter"),
    "beans": ("bonor",),
    "chickpeas": ("kikart", "kikarter"),
    "lentils": ("linser",),
    "corn": ("majs",),
    "zucchini": ("zucchini",),
    "eggplant": ("aubergine",),
    "avocado": ("avokado",),
    "ginger": ("ingefara",),
    "herbs": ("orter", "krydda", "basilika", "persilja"),
    # fruit
    "apple": ("apple", "applen"),
    "banana": ("banan",),
    "bananas": ("banan",),
    "orange": ("apelsin",),
    "lemon": ("citron",),
    "lime": ("lime",),
    "grapes": ("vindruvor", "druvor"),
    "pear": ("paron",),
    "melon": ("melon",),
    "pineapple": ("ananas",),
    "strawberry": ("jordgubb",),
    "strawberries": ("jordgubb",),
    "blueberry": ("blabar",),
    "blueberries": ("blabar",),
    "raspberry": ("hallon",),
    "berries": ("bar", "blabar", "hallon", "jordgubb"),
    # dairy and eggs
    "milk": ("mjolk",),
    "cheese": ("ost",),
    "butter": ("smor",),
    "egg": ("agg",),
    "eggs": ("agg",),
    "cream": ("gradde",),
    "sour cream": ("graddfil", "creme fraiche"),
    "yogurt": ("yoghurt",),
    "yoghurt": ("yoghurt",),
    "halloumi": ("halloumi",),
    "quark": ("kvarg",),
    "creme fraiche": ("creme fraiche",),
    # meat, fish, protein
    "chicken": ("kyckling",),
    "beef": ("notkott", "not"),
    "pork": ("flask",),
    "minced meat": ("kottfars", "fars"),
    "mince": ("kottfars",),
    "ham": ("skinka",),
    "sausage": ("korv",),
    "bacon": ("bacon",),
    "fish": ("fisk",),
    "salmon": ("lax",),
    "shrimp": ("rakor",),
    "tuna": ("tonfisk",),
    "tofu": ("tofu",),
    "quorn": ("quorn",),
    # pantry
    "bread": ("brod",),
    "pasta": ("pasta", "spaghetti", "makaroner"),
    "rice": ("ris",),
    "noodles": ("nudlar",),
    "flour": ("mjol",),
    "sugar": ("socker",),
    "salt": ("salt",),
    "oil": ("olja",),
    "olive oil": ("olivolja",),
    "vinegar": ("vinager",),
    "coffee": ("kaffe",),
    "tea": ("te",),
    "juice": ("juice",),
    "water": ("vatten",),
    "cereal": ("flingor", "musli"),
    "oats": ("havregryn",),
    "honey": ("honung",),
    "jam": ("sylt",),
    "mustard": ("senap",),
    "ketchup": ("ketchup",),
    "mayonnaise": ("majonnas",),
    "soup": ("soppa",),
    "tortilla": ("tortilla",),
    "pizza": ("pizza",),
    "chocolate": ("choklad",),
    "candy": ("godis",),
    "ice cream": ("glass",),
    "chips": ("chips",),
    "beer": ("ol",),
    "wine": ("vin",),
    # household
    "toilet paper": ("toalettpapper",),
    "detergent": ("tvattmedel",),
    "soap": ("tval",),
    "shampoo": ("schampo",),
    "toothpaste": ("tandkram",),
    "iron supplements": ("jarntillskott", "jarn"),
}


def _norm(text: str) -> str:
    """Casefold and strip diacritics so 'Mjölk' matches a typed 'mjolk'."""
    stripped = unicodedata.normalize("NFKD", text)
    return "".join(c for c in stripped if not unicodedata.combining(c)).casefold()


async def _get(client: httpx.AsyncClient, path: str) -> JSON:
    response = await client.get(f"{BASE}{path}")
    response.raise_for_status()
    payload: JSON = response.json()
    return payload


def _offer(product: JSON, promotion: JSON, category: str) -> JSON:
    valid_until = promotion.get("validUntil")
    until = ""
    if isinstance(valid_until, int):
        until = datetime.fromtimestamp(valid_until / 1000, UTC).date().isoformat()
    compare = product.get("comparePrice") or ""
    unit = product.get("comparePriceUnit") or ""
    return {
        "name": product.get("name") or "",
        "price": (promotion.get("price") or {}).get("formattedValue") or "",
        "ordinary": product.get("price") or "",
        "save": promotion.get("conditionLabel") or "",
        "offer": promotion.get("rewardLabel") or "",
        "compare": f"{compare}/{unit}" if compare and unit else compare,
        # LOYALTY offers need a Willys Plus membership; GENERAL ones do not.
        "member_only": promotion.get("campaignType") == "LOYALTY",
        "limit": promotion.get("redeemLimitLabel") or "",
        "until": until,
        "category": category,
    }


async def _sweep() -> list[JSON]:
    headers = {"User-Agent": _UA, "Accept": "application/json", "Referer": f"{BASE}/"}
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=headers) as client:
        tree = await _get(client, _TREE)
        categories = [
            (child["title"], child["url"])
            for child in tree.get("children") or []
            if child.get("url")
        ]
        if not categories:
            raise WillysError("Willys returned no product categories.")

        async def count(title: str, slug: str) -> list[tuple[str, str, int]]:
            data = await _get(client, f"/axfood/rest/v1/c/{slug}?page=0&size=1&sort=")
            total = int(data.get("pagination", {}).get("totalNumberOfResults") or 0)
            pages = -(-total // _PAGE_SIZE)
            return [(title, slug, page) for page in range(pages)]

        counted = await asyncio.gather(
            *(count(t, s) for t, s in categories), return_exceptions=True
        )
        jobs = [job for group in counted if isinstance(group, list) for job in group]
        if not jobs:
            raise WillysError("Willys returned no products to scan.")

        semaphore = asyncio.Semaphore(_CONCURRENCY)

        async def page(title: str, slug: str, index: int) -> tuple[str, list[JSON]]:
            async with semaphore:
                try:
                    data = await _get(
                        client, f"/axfood/rest/v1/c/{slug}?page={index}&size={_PAGE_SIZE}&sort="
                    )
                except httpx.HTTPError:
                    # One bad page out of ~130 must not lose the whole sweep.
                    return title, []
                return title, data.get("results") or []

        pages = await asyncio.gather(*(page(t, s, i) for t, s, i in jobs))

    offers: list[JSON] = []
    seen: set[tuple[str, str]] = set()
    for title, products in pages:
        for product in products:
            for promotion in product.get("potentialPromotions") or []:
                key = (str(product.get("code")), str(promotion.get("code")))
                if key in seen:
                    continue
                seen.add(key)
                offers.append(_offer(product, promotion, title))
    if not offers:
        raise WillysError("Willys returned products but no current offers.")
    return offers


async def all_offers(refresh: bool = False) -> list[JSON]:
    """Every current Willys online offer, cached for CACHE_TTL seconds."""
    global _cache
    async with _lock:
        if not refresh and _cache and time.monotonic() - _cache[0] < CACHE_TTL:
            return _cache[1]
        offers = await _sweep()
        _cache = (time.monotonic(), offers)
        return offers


def _terms(raw: str) -> list[tuple[str, int]]:
    """Search terms for one shopping-list entry, each with a weight.

    Shopping lists get written in English ("cucumber", "sour cream") while every
    Willys product name is Swedish ("Gurka", "Gräddfil"), so matching the raw
    text alone silently finds nothing — that is exactly how a list came back
    with "no offers" for items that had plenty.

    The Swedish translation outranks the word as typed (weight 2 vs 1), because
    Swedish product names are full of English snack words: an untranslated
    "cheese" hits "Cheese Ballz" and would otherwise bury the actual ost offers.
    """
    text = _norm(raw).strip()
    weighted: dict[str, int] = {}

    def add(term: str, weight: int) -> None:
        if len(term) >= 3 and term not in _STOPWORDS:
            weighted[term] = max(weighted.get(term, 0), weight)

    add(text, 1)
    for alias in _ALIASES.get(text, ()):
        add(alias, 2)
    # "sour cream" / "crushed tomatoes": try the individual words too.
    for word in re.findall(r"[^\W\d_]+", text, re.UNICODE):
        add(word, 1)
        for alias in _ALIASES.get(word, ()):
            add(alias, 2)
    return list(weighted.items())


def _score(name: str, term: str) -> int:
    """How good a match `term` is inside `name`; 0 means no match.

    Swedish compounds put the head noun last ("Lättmjölk", "Prästost", "Slanggurka"),
    so word-end has to count — a word-start-only rule misses most of the range. The
    ranking keeps the plain product ("Morot") above an incidental one ("Morotsmuffin")
    so the good deal is not pushed out by the per-item cap.
    """
    escaped = re.escape(term)
    if re.search(rf"\b{escaped}\b", name):
        return 3
    if re.search(rf"\b{escaped}", name):
        return 2
    if re.search(rf"{escaped}\b", name):
        return 1
    if len(term) >= 5 and re.search(escaped, name):
        return 1
    return 0


def match(offers: list[JSON], items: list[str], per_item: int = 12) -> list[JSON]:
    """Group offers by which shopping-list item they match.

    Biased towards recall: the caller wants every possible deal, and each offer
    carries its `category`, so an occasional false positive ("ost" reaching
    "Kompost" in Blommor & trädgård) is visible and discardable. Missing a real
    offer is the expensive error.
    ponytail: string matching over an alias table — swap in pgvector similarity
    here if this starts missing words people actually write.
    """
    results: list[JSON] = []
    for raw in items:
        terms = _terms(raw)
        if not terms:
            continue
        scored: list[tuple[int, int, JSON]] = []
        for offer in offers:
            name = _norm(offer["name"])
            # Weight dominates the match quality, so a Swedish hit always beats an
            # English-word coincidence regardless of how cleanly the latter matched.
            best = max(
                ((weight * 10 + _score(name, term)) if _score(name, term) else 0)
                for term, weight in terms
            )
            if best:
                # Shorter names rank first: "Morot" is a better hit than "Morotsmuffin".
                scored.append((-best, len(name), offer))
        if scored:
            scored.sort(key=lambda row: (row[0], row[1]))
            results.append(
                {
                    "item": raw,
                    "offers": [offer for _, _, offer in scored[:per_item]],
                    "total": len(scored),
                }
            )
    return results
