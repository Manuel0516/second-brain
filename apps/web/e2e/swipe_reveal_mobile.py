"""Real touch regression with production module CSS and rendered geometry.

Run against the Vite fixture; all data/callbacks are disposable and local.
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path

from playwright.async_api import async_playwright

URL = os.environ.get("SWIPE_E2E_URL", "http://127.0.0.1:4173/e2e/swipe-reveal.mobile.html")
ARTIFACT_DIR = Path(os.environ.get("SWIPE_E2E_ARTIFACT_DIR", "/tmp/second-brain-swipe-e2e"))


async def gesture(cdp, x, y, dx, dy):
    await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y, "id": 1}]})
    for step in range(1, 9):
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x + dx * step / 8, "y": y + dy * step / 8, "id": 1}]})
        await asyncio.sleep(0.02)
    await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})


async def main():
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    failures = []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        for motion in ("no-preference", "reduce"):
            context = await browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, reduced_motion=motion)
            page = await context.new_page()
            cdp = await context.new_cdp_session(page)
            for selector, label, deleted in (
                ("#planned-session-e2e-workout", "Delete planned workout E2E workout", "workout"),
                (".food-planned-card.swipe-reveal-content", "Delete planned e2e meal", "meal"),
            ):
                await page.goto(URL, wait_until="networkidle")
                row = page.locator(selector)
                await row.scroll_into_view_if_needed()
                await page.wait_for_timeout(400)
                before = await row.bounding_box()
                assert before is not None
                await gesture(cdp, before["x"] + before["width"] - 40, before["y"] + 24, -96, 2)
                await page.wait_for_timeout(250)
                after = await row.bounding_box()
                transform = await row.evaluate("el => getComputedStyle(el).transform")
                moved = after["x"] - before["x"]
                print(f"{deleted} {motion}: rendered movement={moved:.1f}px, computed transform={transform}")
                if abs(moved + 48) > 1:
                    failures.append(f"{deleted}/{motion}: card did not physically reveal delete ({moved}px)")
                    continue
                button = page.get_by_role("button", name=label)
                box = await button.bounding_box()
                x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
                assert await button.evaluate("(el, p) => el.contains(document.elementFromPoint(p.x, p.y))", {"x": x, "y": y}), "delete button still covered"
                assert await page.locator("body").get_attribute(f"data-{deleted}-deleted") is None
                await page.touchscreen.tap(x, y)
                assert await page.locator("body").get_attribute(f"data-{deleted}-deleted") == "true"
                # Start fresh to verify scrolling without any prior revealed state.
                await page.goto(URL, wait_until="networkidle")
                await row.scroll_into_view_if_needed()
                await page.wait_for_timeout(400)
                box = await row.bounding_box()
                initial_scroll = await page.evaluate("window.scrollY")
                await gesture(cdp, box["x"] + box["width"] / 2, box["y"] + 24, 0, -120)
                await page.wait_for_timeout(250)
                assert await page.evaluate("window.scrollY") > initial_scroll, f"{deleted}: vertical scroll blocked"
                assert await page.locator("body").get_attribute(f"data-{deleted}-deleted") is None
            await page.screenshot(path=str(ARTIFACT_DIR / f"swipe-{motion}.png"), full_page=True)
            await context.close()
        await browser.close()
    assert not failures, "\n".join(failures)
    print("PASS: both row types physically slide, delete is touch-reachable, vertical scrolling works; normal and reduced motion")


if __name__ == "__main__":
    asyncio.run(main())
