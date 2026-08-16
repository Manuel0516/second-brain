# 0254 — Willys offers: settings toggle, English shopping lists, and the missed-offers fix

Date: 2026-08-16
Status: accepted

## What changed

Three things, all following 0253.

**1. A settings toggle.** `willys_offers` is now gated by
`AISettings.willys_offers_enabled`, checked when building the tool list and again
inside `execute()`. Unlike `web_fetch_enabled` it **defaults to true**: `web_fetch`
is opt-in because it fetches whatever URL the model names (an SSRF surface),
whereas `willys_offers` only ever reads one hardcoded public host with no
user-controlled URL. The switch exists to turn it off, not to turn it on.

**2. English shopping lists now match.** The matcher only ever compared the raw
text against Swedish product names, so an English list ("cheese", "milk",
"cucumber") matched *nothing* and the agent truthfully reported "no offers" for
items that had dozens. Added an English→Swedish grocery alias table.

**3. Swedish compounds now match.** The old rule was word-start only, so "mjölk"
found "Mjölk 3%" but missed "**Lätt**mjölk", and "ost" missed "Präst**ost**".
Swedish puts the head noun last, so this was losing most of the range. Word-end
now counts too.

Measured on the user's real list: **19 of 23 items find offers, up from 4.**

## Why

The tool shipped in 0253 was returning far too few offers in practice. The user's
transcript showed the agent reporting "no specific offers" for avocado, broccoli,
cucumber, carrot, tomatoes, lemon, onion, herbs, cream, pasta, milk, sour cream,
cheese, bread, chickpeas, crushed tomatoes and corn — while the live data had 27
pasta offers, 25 cheese, 22 cream, 17 tomato. The stated goal was to maximise
offers found.

The user also asked to verify the agent can create its own tools; see below.

## Agent-created tools: verified, and why one failed

The agent **can** create tools, but only ever pointing at this app's own routes.
`spec_tools.validate_spec` requires `path` to start with `/api/` *and* to resolve
to a route already registered in the running app; there is no field anywhere in a
spec for a base URL, API key, or token. So when the agent asked the user for "an
API endpoint and a token" it was chasing something that could never work — an
external service is structurally unreachable, no matter what the user supplies.

Nothing in the `create_tool` description said so; it only said "calling an
existing app endpoint", which the agent read loosely. That description now states
the limit explicitly, tells the agent never to ask for an endpoint/key/token, and
points at `discover_capabilities` + `load_capability` (which search the app's live
API catalog) as the preferred path so it stops guessing paths. Locked in by
`test_agent_created_tools_cannot_reach_external_apis`.

## Files touched

- `apps/api/alembic/versions/036_ai_willys_offers.py` — new. Adds
  `ai_settings.willys_offers_enabled`, `server_default=true`.
- `apps/api/app/models.py` — the column, `default=True`.
- `apps/api/app/routes/ai.py` — field on the settings response and patch models.
- `apps/api/app/modules/ai/tools.py` — gate in `schemas_for` (uses `is False`, so a
  user with no `AISettings` row still sees the tool) and in `execute`; rewrote the
  `willys_offers` description (translation is automatic, never fall back to
  `web_fetch`, check `category` before trusting a match); rewrote the `create_tool`
  description as above.
- `apps/api/app/modules/ai/willys.py` — `_ALIASES` (English→Swedish groceries),
  `_STOPWORDS`, `_terms()` (weighted terms per item), `_score()` (word / word-start
  / word-end / interior), rewritten `match()` with ranking.
- `apps/web/src/modules/settings/AISettings.tsx` — `willys_offers_enabled` on the
  config type and response validator, plus a "Willys offers" settings card.
- `apps/web/src/modules/settings/AISettings.test.tsx` — fixture field.
- `apps/api/tests/test_ai.py` — toggle test (on by default, hidden once disabled,
  execute refuses).
- `apps/api/tests/test_willys.py` — compound matching, English translation,
  multi-word items, and the tool-creation boundary test.

## How the pieces connect

Matching is deliberately **recall-biased**: the user wants every possible deal, so
an occasional false positive is acceptable and a missed offer is the expensive
error. Two things keep that from becoming noise:

- **Weighting.** Swedish alias terms score above the word as typed (weight 2 vs 1).
  Swedish product names are full of English snack words, so an untranslated
  "cheese" hits "Cheese Ballz" and "cream" hits "Cream Cheese Chips"; without the
  weight those buried the real Ost and Vispgrädde offers.
- **Ranking.** Whole word > word-start > word-end > interior, then shorter names
  first, so "Morot" outranks "Morotsmuffin" and good deals are not pushed out by
  the per-item cap of 12.

Every offer still carries its `category`, and the tool description now tells the
agent to use it as a sanity check — an "ost" hit in *Djur* is cat food.

## How to modify this later

- **An item still finds nothing**: add it to `_ALIASES` in `willys.py` — keys and
  values must be written **without diacritics**, since both sides are compared
  through `_norm()` (which strips them). "mjölk" is stored as `mjolk`.
- **Too many junk matches**: raise the interior-match length in `_score()`, or add
  the offending word to `_STOPWORDS`. Do not switch back to word-start-only; that
  is what caused the original miss.
- **Real fix if this plateaus**: embed offer names and item text with pgvector and
  rank by similarity, which would drop the alias table entirely. Marked with a
  `ponytail:` comment in `match()`.
- **Adding the migration to a running dev DB**: `uv run --directory apps/api
  alembic upgrade head`. The API in `compose.dev.yaml` is *not* the process serving
  requests — dev runs it on the host via `npm run dev:api` (see `scripts/dev-start.sh`),
  so a stale `secondbrain-api-1` container can be ignored.
