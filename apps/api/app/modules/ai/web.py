"""Safe outbound web fetch for the agent's web_fetch tool.

No search engine, no API key — the agent is only ever given a URL (by the user, or one it
found via search_graph/prior fetches) and this reads it. The safety surface is entirely about
not letting an LLM-chosen URL reach anything on the private network: every hop (initial URL and
each redirect, or each distinct host a rendered page's own requests touch in ``fetch_dynamic``)
is DNS-resolved and checked against ``ipaddress.is_global`` before any request is made, so a
public hostname that resolves to a private/loopback/link-local address is rejected just as a
literal private IP would be.

Two entry points: ``fetch()`` is a plain HTTP GET for static pages (fast, no browser).
``fetch_dynamic()`` renders the page in a real headless Chromium and can click a "show more"
button repeatedly first — for pages (e.g. paginated offer/result lists) that only reveal more
content via JS instead of a URL. It costs a browser launch (roughly a second-plus) so it's only
used when the caller explicitly asks for click-through.
"""

import asyncio
import ipaddress
import re
import socket
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx
from playwright.async_api import Error as PlaywrightError
from playwright.async_api import Locator, Page, Route, async_playwright

TIMEOUT = 10.0
MAX_BYTES = 2_000_000
MAX_TEXT_CHARS = 6_000
MAX_REDIRECTS = 5
DYNAMIC_NAV_TIMEOUT_MS = 20_000
CLICK_APPEAR_TIMEOUT_MS = 4_000
CLICK_TIMEOUT_MS = 3_000
CLICK_WAIT_MS = 700
TYPE_WAIT_MS = 900
MAX_CLICKS_CAP = 20
MAX_STEPS = 10
_VISIBLE_TEXT_INPUTS = (
    "input[type='text']:visible, input[type='search']:visible, input:not([type]):visible"
)
_TEXT_CONTENT_TYPES = ("text/html", "text/plain", "xhtml")
_SKIP_TAGS = frozenset({"script", "style", "noscript", "template"})
_REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})


class FetchError(Exception):
    """User-facing reason a fetch was refused or failed — safe to show the model."""


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._skip_depth = 0
        self._in_title = False
        self.title_parts: list[str] = []
        self.text_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _SKIP_TAGS:
            self._skip_depth += 1
        elif tag == "title":
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag in _SKIP_TAGS and self._skip_depth:
            self._skip_depth -= 1
        elif tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        if self._in_title:
            self.title_parts.append(data)
            return
        stripped = data.strip()
        if stripped:
            self.text_parts.append(stripped)


def _extract_text(html: str) -> tuple[str, str]:
    parser = _TextExtractor()
    parser.feed(html)
    title = re.sub(r"\s+", " ", "".join(parser.title_parts)).strip()
    text = re.sub(r"\s+", " ", " ".join(parser.text_parts)).strip()
    return title, text


def _check_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise FetchError("Only http(s) URLs can be fetched.")
    if not parsed.hostname:
        raise FetchError("URL has no host.")
    if parsed.username or parsed.password:
        raise FetchError("URLs with embedded credentials are not allowed.")
    return parsed.hostname


async def _check_host_is_public(hostname: str) -> None:
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise FetchError(f"Could not resolve host: {hostname}") from exc
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if not address.is_global:
            raise FetchError(
                "This URL resolves to a private or internal address and can't be fetched."
            )


async def fetch(url: str) -> dict[str, object]:
    """Fetch `url`, following redirects (each re-checked), and return readable text.

    Raises FetchError for anything the model should just be told about (bad scheme, private
    address, unsupported content type, too many redirects, HTTP error status).
    """
    current = url
    async with httpx.AsyncClient(follow_redirects=False, timeout=TIMEOUT) as client:
        for _ in range(MAX_REDIRECTS + 1):
            hostname = _check_url(current)
            await _check_host_is_public(hostname)
            async with client.stream(
                "GET", current, headers={"User-Agent": "SecondBrainAgent/1.0"}
            ) as response:
                if response.status_code in _REDIRECT_STATUSES:
                    location = response.headers.get("location")
                    if not location:
                        raise FetchError(f"Redirect with no Location ({response.status_code}).")
                    current = str(response.url.join(location))
                    continue
                if response.status_code >= 400:
                    raise FetchError(f"Server returned {response.status_code}.")
                content_type = response.headers.get("content-type", "")
                if not any(marker in content_type for marker in _TEXT_CONTENT_TYPES):
                    raise FetchError(f"Unsupported content type: {content_type or 'unknown'}.")
                body = bytearray()
                truncated = False
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) >= MAX_BYTES:
                        truncated = True
                        break
                html = bytes(body).decode(response.encoding or "utf-8", errors="replace")
                final_url = str(response.url)
            break
        else:
            raise FetchError("Too many redirects.")

    title, text = _extract_text(html)
    if len(text) > MAX_TEXT_CHARS:
        text = text[:MAX_TEXT_CHARS]
        truncated = True
    return {"url": final_url, "title": title, "text": text, "truncated": truncated}


async def _guard_request(checked_hosts: dict[str, bool], route: Route) -> None:
    """page.route handler — blocks any request (navigation, redirect, XHR, sub-resource)
    whose host isn't public, so a rendered page's own JS can't pivot the browser at the
    private network. Results are cached per host for the life of the page."""
    hostname = urlparse(route.request.url).hostname
    if hostname is None:
        await route.abort()
        return
    if hostname not in checked_hosts:
        try:
            await _check_host_is_public(hostname)
            checked_hosts[hostname] = True
        except FetchError:
            checked_hosts[hostname] = False
    if checked_hosts[hostname]:
        await route.continue_()
    else:
        await route.abort()


async def _click_locator(page: Page, text: str) -> Locator | None:
    """Real sites routinely repeat a button's label in a plain description right next to it
    (e.g. Willys' offers page has both a <p>"Choose a store to see..."</p> and the actual
    <button>"Choose store"</button> containing the same words) — plain get_by_text's DOM-order
    `.first` can land on the inert paragraph instead of the real control. Preferring an
    interactive role first, and falling back to plain text only if no role matches, avoids
    that without the caller needing to know which case applies.

    Each candidate is *waited* for (not just count()-checked) since real-world elements like
    cookie-consent banners are frequently injected by a third-party script slightly after
    domcontentloaded — an instant count() of 0 doesn't mean "never appears", just "not yet"."""
    for locator in (
        page.get_by_role("button", name=text, exact=False),
        page.get_by_role("link", name=text, exact=False),
        page.get_by_text(text, exact=False),
    ):
        try:
            await locator.first.wait_for(state="visible", timeout=CLICK_APPEAR_TIMEOUT_MS)
            return locator
        except PlaywrightError:
            continue
    return None


async def _run_step(page: Page, step: dict[str, object]) -> None:
    """One `steps` entry: `{"click": text}` clicks the first element matching that text —
    for one-off navigation like opening a store picker or picking a search result, as
    opposed to `click_text`'s repeated "load more" loop. `{"type": value, "into": target}`
    fills a text field: if `into` is given it's matched against the field's placeholder or
    label; otherwise the first visible text/search input on the page is used (the common
    case right after a `click` step opens a single-field search box)."""
    if "click" in step:
        text = str(step["click"])
        locator = await _click_locator(page, text)
        if locator is None:
            raise FetchError(f"Could not find anything to click matching {text!r}.")
        await locator.first.click(timeout=CLICK_TIMEOUT_MS)
        await page.wait_for_timeout(CLICK_WAIT_MS)
        return
    if "type" in step:
        value = str(step["type"])
        target = step.get("into")
        field_locator: Locator | None = None
        if target:
            for by in (page.get_by_placeholder, page.get_by_label):
                candidate = by(str(target), exact=False)
                try:
                    await candidate.first.wait_for(state="visible", timeout=CLICK_APPEAR_TIMEOUT_MS)
                    field_locator = candidate
                    break
                except PlaywrightError:
                    continue
        if field_locator is None:
            field_locator = page.locator(_VISIBLE_TEXT_INPUTS)
            try:
                await field_locator.first.wait_for(state="visible", timeout=CLICK_APPEAR_TIMEOUT_MS)
            except PlaywrightError:
                raise FetchError(
                    f"Could not find a text field to type into (looking for {target!r})."
                ) from None
        await field_locator.first.fill(value, timeout=CLICK_TIMEOUT_MS)
        await page.wait_for_timeout(TYPE_WAIT_MS)
        return
    raise FetchError(f"Unrecognized step: {step!r} (each step must have 'click' or 'type').")


async def fetch_dynamic(
    url: str,
    steps: list[dict[str, object]] | None = None,
    click_text: str | None = None,
    max_clicks: int = 10,
) -> dict[str, object]:
    """Render `url` in a headless browser. `steps` runs first, in order, for one-off setup
    like opening a store picker, typing a search term, and clicking the matching result.
    Then, if `click_text` is given, the first element matching it (e.g. "Show more") is
    clicked repeatedly, up to `max_clicks` times, for JS-paginated content. Returns the
    resulting page's readable text.
    """
    hostname = _check_url(url)
    await _check_host_is_public(hostname)
    max_clicks = max(0, min(max_clicks, MAX_CLICKS_CAP))
    steps = steps or []
    if len(steps) > MAX_STEPS:
        raise FetchError(f"Too many steps (max {MAX_STEPS}).")
    checked_hosts: dict[str, bool] = {hostname: True}

    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch()
            try:
                page = await browser.new_page(user_agent="SecondBrainAgent/1.0")

                async def _route_handler(route: Route) -> None:
                    await _guard_request(checked_hosts, route)

                await page.route("**/*", _route_handler)
                await page.goto(url, timeout=DYNAMIC_NAV_TIMEOUT_MS, wait_until="domcontentloaded")
                for step in steps:
                    await _run_step(page, step)
                if click_text:
                    locator = await _click_locator(page, click_text)
                    for _ in range(max_clicks):
                        if locator is None or await locator.count() == 0:
                            break
                        try:
                            await locator.first.click(timeout=CLICK_TIMEOUT_MS)
                        except PlaywrightError:
                            break
                        await page.wait_for_timeout(CLICK_WAIT_MS)
                html = await page.content()
                final_url = page.url
            finally:
                await browser.close()
    except PlaywrightError as exc:
        raise FetchError(f"Could not render page: {exc}") from exc

    title, text = _extract_text(html)
    truncated = False
    if len(text) > MAX_TEXT_CHARS:
        text = text[:MAX_TEXT_CHARS]
        truncated = True
    return {"url": final_url, "title": title, "text": text, "truncated": truncated}
