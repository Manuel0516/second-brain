# 0238 — web_fetch gets `steps`: fill a field, click a result, not just repeated clicks

Date: 2026-08-15
Status: accepted

## What changed

`web_fetch`'s browser mode (0237) could only click one element's text repeatedly
(`click_text`/`max_clicks`) — enough for "load more" pagination, but not for a page like
Willys' offers, which requires opening a store picker, typing a search term, and clicking the
one matching result before any offers are even shown. That flow doesn't change the URL at all
(confirmed by the user testing it directly), so no amount of URL-guessing or repeated-clicking
gets there.

Added `steps`: an ordered list (max 10) of one-off setup actions run once, before `click_text`'s
repeated-click loop, each either:
- `{"click": "text"}` — click the first element matching that text (open a picker, pick a
  search result, etc.)
- `{"type": "value", "into": "placeholder or label text"}` — fill a text field. `into` is
  optional: if given, it's matched against the field's placeholder or accessible label; if
  omitted, the first visible text/search input on the page is used — the common case right
  after a `click` step opens a single-field search box, where the agent won't know the exact
  placeholder wording.

`steps` and `click_text` compose: `steps` runs first (select a store), then `click_text` can
still paginate within the now-store-scoped results.

## Why

User request: after trying `web_fetch` themselves and getting the generic (no-store-selected)
Willys offers page every time, they asked directly for the "type into a field and select a
result" capability, since the store picker is a JS search-and-pick widget with no URL
equivalent — confirmed by their own test that the URL doesn't change after selecting a store in
a real browser.

## Files touched

- `apps/api/app/modules/ai/web.py` — `_run_step()` (executes one `click`/`type` step against
  a Playwright `Page`); `fetch_dynamic()` now takes `steps` and runs them, in order, right
  after navigation and before the existing `click_text` loop. `MAX_STEPS = 10`,
  `TYPE_WAIT_MS = 900`, `_VISIBLE_TEXT_INPUTS` (the `into`-omitted fallback selector) added.
- `apps/api/app/modules/ai/tools.py` — `web_fetch`'s schema gained `steps` (array of
  `{click, type, into}` objects, `additionalProperties: false`, max 10 items) and an expanded
  description explaining `steps` vs. `click_text` and giving a worked Willys-shaped example,
  including the instruction to always click the fully distinguishing result text (store name +
  street), never a bare city name, when a search can match multiple entries. The `execute()`
  dispatch now enters browser mode when `args.get("steps")` is truthy too, not only
  `click_text`.
- `apps/api/tests/test_web_fetch.py` — new `picker_server` fixture: a real local page with a
  "Select store" button that opens a search box, filters a hardcoded store list as you type,
  and records which result got clicked. Three real-headless-Chromium tests against it: the
  full open→type→select flow, the same flow with `into` omitted (proving the visible-input
  fallback), and a step that can't find its target raising `FetchError`.
- `apps/api/tests/test_ai.py` — extended the existing dispatch test with a `steps`-only call
  (proving it alone triggers browser mode, not just `click_text`) and the schema-shape
  assertion to include `steps`.

## How the pieces connect

Same `fetch_dynamic` entry point as 0237 — `steps` is additive, not a new mode. `_run_step`
reuses the same `CLICK_TIMEOUT_MS`/`CLICK_WAIT_MS` constants as the pagination loop for
consistency. The SSRF `page.route()` guard from 0237 applies unchanged, since `steps` only
interacts with the already-loaded, already-checked page — it doesn't navigate anywhere new.

## How to modify this later

- I could not verify a concrete Willys.se `steps` payload against the live site — WebFetch
  (used to research this) only sees static HTML, not the hydrated JS modal's actual field
  placeholder/result text, so the exact wording is unconfirmed. Confirmed from the real static
  HTML: the button is literally "Välj butik". The user should try `steps: [{"click": "Välj
  butik"}, {"type": "Lund"}, {"click": "Magistratsvägen"}]` (omitting `into` so it falls back to
  the first visible input) — if a step's target isn't found, `fetch_dynamic` raises `FetchError`
  naming which step failed, so the agent can see that and adjust rather than fail silently.
- `_run_step`'s `click` targeting (`page.get_by_text(text, exact=False)`) always clicks the
  *first* match. For a picker where the tool description's "distinguishing text" guidance isn't
  enough to avoid ambiguity, the next lever would be an optional `nth` index per step rather
  than adding more targeting strategies.
