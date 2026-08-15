# 0221 — OpenAPI agent discovery and growth

Date: 2026-08-15
Status: accepted

## What changed

The embedded agent can now search FastAPI's live OpenAPI catalog, load a selected operation as
a typed tool, and execute it without a hand-written wrapper. Added centralized autonomy/risk
policy with mandatory double confirmation and transient secure inputs for sensitive operations;
working OpenRouter/local chat providers; single-request final answers; pgvector-backed hybrid
search with keyword fallback; deduplicated explicit turn-bound learning; message metrics and
feedback; and a Settings → AI assistant control center for models, autonomy, retrieval, memory,
skills, capabilities, and action history.

## Why

The previous self-extension mechanism could only create a tool when the model already knew the
exact method, path, and request shape. It was therefore safe but blind. The user requested a
Hermes-style agent that discovers the app, grows with corrections and preferences, and remains
transparent and controllable.

## Files touched

- `apps/api/app/modules/ai/capabilities.py` — live OpenAPI discovery, typed schemas, risk labels,
  generic execution, and secret redaction.
- `apps/api/app/modules/ai/search.py` — incremental cross-module hybrid retrieval and embeddings.
- `apps/api/app/modules/ai/agent.py`, `tools.py`, `providers.py` — refreshed tool loop, autonomy,
  local provider support, metrics, and learning.
- `apps/api/app/routes/ai.py`, `models.py`, `alembic/versions/032_ai_agent_growth.py` — control APIs
  and durable policy/search/settings state.
- `apps/web/src/modules/settings/AISettings.tsx` and assistant components — control center,
  feedback, and high-risk secure confirmation UI.
- `compose.yaml`, `apps/api/pyproject.toml`, `apps/api/uv.lock` — PostgreSQL pgvector image and
  Python integration.

## How the pieces connect

The model first calls `discover_capabilities`, then `load_capability`; the loaded `AITool` stores
only a stable capability id and regenerates its schema from the current FastAPI application on
each agent step. The server classifies writes independently of the model and applies the user's
autonomy setting. Sensitive inputs are omitted from provider-visible schemas and supplied only
on the second confirmation request. `search_graph` lazily synchronizes changed life-data rows,
uses embeddings when configured, and falls back to local keyword ranking. The control center
uses the same authenticated AI routes to expose this state.

## How to modify this later

New JSON FastAPI routes require no agent registration: give them useful summaries and response
models so discovery is descriptive. Update the fixed risk prefixes before exposing a new trust
boundary. Add a source adapter in `search.py` when a new life-data module such as Finance ships.
Keep composed tools only where they add real behavior beyond one endpoint. Add an ANN index only
after the personal corpus or measured latency justifies it.
