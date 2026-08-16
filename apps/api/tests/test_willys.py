from typing import Any

from app.modules.ai import willys
from app.modules.ai.spec_tools import validate_spec


def test_agent_created_tools_cannot_reach_external_apis() -> None:
    """Why the agent could not build a tool for a third-party service, and never will
    be able to: a spec must resolve to a route already registered in THIS app. There is
    no base-URL/API-key/token field anywhere in the spec, so asking the user for an
    endpoint and a token can never help. See history 0254."""
    assert validate_spec({"method": "PATCH", "path": "/api/food/logs/{id}"}) is None

    external = validate_spec({"method": "GET", "path": "https://api.example.com/v1/data"})
    assert external is not None and "must start with /api/" in external

    # Even an /api/-shaped path is refused unless the route genuinely exists.
    invented = validate_spec({"method": "GET", "path": "/api/v1/weather"})
    assert invented is not None and "no registered route matches" in invented


def _product(name: str, price: str, reward: str, campaign: str = "GENERAL") -> dict[str, Any]:
    return {
        "name": name,
        "code": f"code-{name}",
        "price": price,
        "comparePrice": "159,20 kr",
        "comparePriceUnit": "kg",
        "potentialPromotions": [
            {
                "code": f"promo-{name}",
                "price": {"formattedValue": reward},
                "conditionLabel": "Spara 5,00 kr/st",
                "rewardLabel": reward,
                "campaignType": campaign,
                "redeemLimitLabel": "Max 5 köp",
                "validUntil": 1786917599000,
            }
        ],
    }


def _offers() -> list[dict[str, Any]]:
    return [
        willys._offer(p, p["potentialPromotions"][0], "Mejeri")
        for p in (
            _product("Mjölk 3%", "24,90 kr", "19,90 kr"),
            _product("Lättmjölk 0,5%", "22,00 kr", "18,00 kr"),
            _product("Kaffe Mellanrost", "59,00 kr", "45,00 kr", "LOYALTY"),
            _product("Kompost Jord", "99,00 kr", "79,00 kr"),
        )
    ]


def test_offer_maps_promotion_fields() -> None:
    offer = _offers()[0]
    assert offer["name"] == "Mjölk 3%"
    assert offer["price"] == "19,90 kr"
    assert offer["ordinary"] == "24,90 kr"
    assert offer["compare"] == "159,20 kr/kg"
    assert offer["until"] == "2026-08-16"
    assert offer["member_only"] is False


def test_loyalty_campaign_is_member_only() -> None:
    assert _offers()[2]["member_only"] is True


def test_match_finds_item_ignoring_diacritics_and_case() -> None:
    matched = willys.match(_offers(), ["mjolk"])
    assert [group["item"] for group in matched] == ["mjolk"]
    assert "Mjölk 3%" in {o["name"] for o in matched[0]["offers"]}


def test_match_finds_swedish_compounds() -> None:
    """Swedish puts the head noun last, so "mjölk" must reach "Lättmjölk" — a
    word-start-only rule misses most of the range and was silently losing offers."""
    names = {o["name"] for o in willys.match(_offers(), ["mjölk"])[0]["offers"]}
    assert names == {"Mjölk 3%", "Lättmjölk 0,5%"}


def test_match_translates_english_shopping_list_items() -> None:
    """Shopping lists are written in English; every Willys product name is Swedish.
    Without translation these silently return nothing (see history 0254)."""
    matched = willys.match(_offers(), ["milk", "coffee"])
    by_item = {g["item"]: {o["name"] for o in g["offers"]} for g in matched}
    assert by_item["milk"] == {"Mjölk 3%", "Lättmjölk 0,5%"}
    assert by_item["coffee"] == {"Kaffe Mellanrost"}


def test_match_handles_multi_word_items() -> None:
    assert willys.match(_offers(), ["some fresh milk"])[0]["offers"]


def test_match_skips_items_with_no_offer() -> None:
    matched = willys.match(_offers(), ["kaffe", "bananer"])
    assert [group["item"] for group in matched] == ["kaffe"]


def test_match_caps_offers_per_item() -> None:
    many = [
        willys._offer(p, p["potentialPromotions"][0], "Mejeri")
        for p in (_product(f"Mjölk sort {i}", "10,00 kr", "8,00 kr") for i in range(12))
    ]
    matched = willys.match(many, ["mjölk"], per_item=3)
    assert len(matched[0]["offers"]) == 3
    assert matched[0]["total"] == 12
