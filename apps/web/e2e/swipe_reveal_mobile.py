"""Touch-browser regression test for planned-workout and planned-meal rows.

Run with the Vite dev server already serving apps/web on SWIPE_E2E_URL.
The fixture contains no API connection or persistent data; delete callbacks only
set document-body data attributes.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

from playwright.async_api import async_playwright

URL = os.environ.get(
    "SWIPE_E2E_URL", "http://127.0.0.1:4173/e2e/swipe-reveal.mobile.html"
)
ARTIFACT_DIR = Path(os.environ.get("SWIPE_E2E_ARTIFACT_DIR", "/tmp/second-brain-swipe-e2e"))


async def swipe_left(cdp, box: dict[str, float]) -> None:
    x = box["x"] + box["width"] - 40
    y = box["y"] + box["height"] / 2
    await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y, "id": 1}]})
    await cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x - 96, "y": y, "id": 1}]})
    await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})


async def main() -> None:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        context = await browser.new_context(
            viewport={"width": 390, "height": 844},
            is_mobile=True,
            has_touch=True,
        )
        page = await context.new_page()
        await page.goto(URL, wait_until="networkidle")
        await page.get_by_text("E2E workout").wait_for()
        cdp = await context.new_cdp_session(page)

        workout = page.locator("#planned-session-e2e-workout")
        workout_box = await workout.bounding_box()
        assert workout_box is not None
        await swipe_left(cdp, workout_box)
        await page.wait_for_timeout(200)
        assert "-48" in await workout.get_attribute("style") or "-48" in await workout.evaluate("node => node.style.transform"), "workout swipe did not reveal delete"
        await page.get_by_role("button", name="Delete planned workout E2E workout").click()
        assert await page.locator("body").get_attribute("data-workout-deleted") == "true"

        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        meal = page.locator(".food-planned-card.swipe-reveal-content")
        await meal.scroll_into_view_if_needed()
        meal_box = await meal.bounding_box()
        assert meal_box is not None
        await swipe_left(cdp, meal_box)
        await page.wait_for_timeout(200)
        assert "-48" in await meal.evaluate("node => node.style.transform"), "meal swipe did not reveal delete"
        await page.get_by_role("button", name="Delete planned e2e meal").click()
        assert await page.locator("body").get_attribute("data-meal-deleted") == "true"

        await page.evaluate("window.scrollTo(0, 0)")
        before_scroll = await page.evaluate("window.scrollY")
        workout_box = await workout.bounding_box()
        assert workout_box is not None
        x = workout_box["x"] + workout_box["width"] / 2
        y = workout_box["y"] + workout_box["height"] / 2
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y, "id": 2}]})
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y - 180, "id": 2}]})
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        await page.wait_for_timeout(200)
        assert await page.evaluate("window.scrollY") > before_scroll, "vertical touch did not scroll"
        await page.screenshot(path=str(ARTIFACT_DIR / "swipe-reveal-mobile.png"), full_page=True)
        print(f"PASS: {URL}")
        print(f"artifact: {ARTIFACT_DIR / 'swipe-reveal-mobile.png'}")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
