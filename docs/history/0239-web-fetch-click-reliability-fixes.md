# 0239 — web_fetch click reliability: role-preferring targets, waited (not instant) matches

Date: 2026-08-15
Status: accepted

## What changed

User hit a real failure trying `web_fetch` against Willys' offers page and asked why. Rather
than guess, reproduced it directly against the live site with Playwright (this sandbox has real
outbound network access) and found two distinct, compounding root causes — plus confirmed the
fix by running the exact "select Willys Lund, Magistratsvägen" flow against the live site and
getting back 222 real products with real prices.

1. **Instant `count()` checks race third-party-injected content.** `_run_step` and the
   `click_text` loop checked `locator.count() > 0` immediately — a snapshot, not a wait. Willys'
   cookie-consent banner (OneTrust) is injected by a script slightly after
   `domcontentloaded`, so a click attempted right away sees `count() == 0` and fails, even
   though the banner appears a second or so later. This is not Willys-specific — it's the
   default posture of essentially every site with a third-party consent/chat/analytics widget.
   Fixed by waiting for visibility (`locator.wait_for(state="visible", timeout=...)`) instead of
   an instant count, for both step clicks/fills and the pagination click target.
2. **Plain text matching can land on the wrong element.** Willys' page has both a plain
   `<p>"Välj butik för att se rätt erbjudanden..."</p>` *and* the actual
   `<button>"Välj butik"</button>` — `get_by_text(...).first` in DOM order can resolve to the
   inert paragraph instead of the clickable button (this is exactly what caused an earlier
   click to silently be worthless: it "succeeded" against the paragraph, doing nothing). Fixed
   by trying `get_by_role("button", ...)` then `get_by_role("link", ...)` before falling back to
   plain text — an interactive role match is unambiguous where duplicate text isn't.

Separately, the tool's own worked example in its description was itself wrong:
`{"click": "Willys Lund, Magistratsvägen 22"}` doesn't match the real page — name and address
render as separate lines, never a comma-joined string — which is exactly the click the model
attempted and got a "could not find" error for in the reported transcript. Replaced it with a
verified-working example (dismiss cookies first, click the real button, search, click the
address alone since it's what's actually unique per result) and added explicit guidance about
cookie banners and near-duplicate result names, both observed as real failure modes in this
session, not hypothetical ones.

## Why

User request: understand why a real `web_fetch` attempt against Willys' offers page failed
repeatedly and burned the tool-call budget, and make it actually work.

## Files touched

- `apps/api/app/modules/ai/web.py` — new `_click_locator()` helper (role-preferring,
  wait-based) used by both `_run_step`'s click branch and `fetch_dynamic`'s `click_text`
  pagination loop; `_run_step`'s `type` branch also switched from instant `count()` to
  `wait_for(state="visible")` for both the placeholder/label search and the visible-input
  fallback. New `CLICK_APPEAR_TIMEOUT_MS = 4_000` constant (how long to wait for an element to
  appear, separate from `CLICK_TIMEOUT_MS`, which is Playwright's own action timeout once an
  element is found).
- `apps/api/app/modules/ai/tools.py` — `web_fetch`'s description: replaced the broken worked
  example with a verified one, added guidance to add a cookie-accept click first if a step
  seems to silently fail, and to click a short unique fragment (e.g. street address) rather
  than a venue name that might be a prefix of another result.

## How the pieces connect

No API surface change — `steps`/`click_text` still take the same shapes; this entry is
entirely about `fetch_dynamic`'s internal element-finding becoming more robust, transparent to
callers. Verified two ways: the full existing local-server test suite still passes unchanged
(17 tests in `test_web_fetch.py`, including the picker-flow tests from 0238), and — separately,
not committed as a test since it depends on a live third-party site's current markup —
`web.fetch_dynamic("https://www.willys.se/erbjudanden/butik", steps=[{"click": "Acceptera alla
cookies"}, {"click": "Välj butik"}, {"type": "Lund", "into": "Sök efter din butik"}, {"click":
"Magistratsvägen 22"}])` was run directly against the real site and returned the Willys Lund
store's actual current offers (confirmed by the page itself: "Visar erbjudanden för butik:
Willys Lund").

## How to modify this later

- `CLICK_APPEAR_TIMEOUT_MS` (4s) means a step whose target truly never appears now takes up to
  ~4s ×3 candidate roles (~12s worst case) to report `FetchError`, instead of failing instantly
  — a deliberate trade: a false "not found" sends the model down a wrong troubleshooting path
  (as seen in the reported transcript), which costs far more of the tool-call budget than a few
  extra seconds of waiting. If this proves too slow in practice, lower the constant before
  reducing the number of role candidates tried.
- The `click_text` pagination loop's per-iteration `locator.count() == 0` check (whether to
  keep clicking) was deliberately left as an instant check, not wait-based — after the first
  successful click, "is the button still there right now" is the correct question; waiting
  several seconds hoping a removed button reappears would be wrong.
- No live-site test was added to the automated suite (would be flaky/slow against a real
  external site outside this project's control) — the live verification above is a one-time
  manual proof this session, not a regression guard. If Willys changes their markup again,
  `test_web_fetch.py`'s local `picker_server`/`paginated_server` fixtures are the durable
  regression coverage; a live check would need to be a separate, explicitly-opt-in test.
