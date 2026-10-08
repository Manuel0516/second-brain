# 0270 — Private ChatGPT MCP integration

Date: 2026-10-08
Status: accepted

## What changed

Added an opt-in, official-Python-SDK MCP resource server at `/api/mcp` with stateless
Streamable HTTP, structured results, bounded input schemas, annotations and OAuth
protected-resource discovery. It exposes 29 tools for memories, daily/weekly
planning, tasks, groceries, fitness, notes, and approval tracking.

Tokens are verified against a configured OAuth issuer's JWKS with strict
signature/issuer/audience/expiry checks and explicit subject-to-local-user mapping.
Every tool checks its scope and the active user. Fitness has dedicated read/write
scopes. All writes create proposals in the existing Assistant approval queue;
only the authenticated application approval flow executes the saved arguments.
Approval is locked against replay, and MCP approvals never resume a local model.

Tasks, groceries and plans use tagged, owned Pages instead of duplicate tables.
Memory retrieval extends the existing hybrid index with memories and source-type
filters. Search initializes missing AI settings so embedding defaults are usable.
Workout logging shares the existing calendar-link builder and inserts sets
atomically. Grocery removal uses Notes trash; plan approval checks recurrence,
Stockholm day boundaries and overlaps. The SDK rejects unexpected Host headers.

Added setup/runbook documentation, placeholder environment fields and an optional
Compose environment override. The base deployment and VPN boundary are unchanged.
The override has not been applied on the VPS; operator deployment remains pending.
No production secrets, git push, PR, merge or deployment were performed.

Verification: `npm run check` passed: 175 frontend tests and 200 API tests, including
49 MCP tests; formatting, linting, mypy and the frontend build passed. The official
MCP client initialized/listed/called tools. MCP Inspector CLI initialized, listed
29 tools, read groceries and created an approval proposal against a disposable
loopback fixture with synthetic data and test-only signing keys. Compose validated
with `.env.example`. No live ChatGPT/provider/tunnel/VPS connection was tested.

## Why

The user requested a secure, private ChatGPT interface on `codex/development` that
reuses existing application services, supports Streamable HTTP and OAuth, and
ships working code, tests and connection instructions. Secure MCP Tunnel supports
private connections; no public gateway is needed for this private integration.

## Files touched

- `apps/api/app/modules/mcp/__init__.py` — module package.
- `apps/api/app/modules/mcp/auth.py` — issuer JWT verifier and scope vocabulary.
- `apps/api/app/modules/mcp/schemas.py` — bounded models and approved write schemas.
- `apps/api/app/modules/mcp/domain.py` — adapters, Page-backed organization records,
  approval proposals, ownership checks and transactional approved writes.
- `apps/api/app/modules/mcp/server.py` — SDK transport, tool registration, scope
  enforcement, safe errors and OAuth metadata.
- `apps/api/app/config.py` — optional MCP configuration.
- `apps/api/app/main.py` — opt-in transport mount and lifespan.
- `apps/api/app/modules/ai/memory.py` — optional caller-controlled transaction for remember.
- `apps/api/app/modules/ai/search.py` — memory indexing, source restrictions and settings initialization.
- `apps/api/app/routes/ai.py` — pending-action lock and approval/rejection dispatch for MCP proposals.
- `apps/api/app/routes/fitness.py` — shared session/calendar-link builder and plan persistence.
- `apps/api/tests/test_mcp.py` — actual SDK HTTP transport, signatures/scopes/ownership,
  CRUD, recurrence/DST, approval safety and protocol-client regressions.
- `apps/api/pyproject.toml` — explicitly requested official `mcp>=1.26,<2` dependency.
- `apps/api/uv.lock` — SDK and required transitive dependencies (MCP 1.30.0).
- `.env.example` — MCP placeholders only.
- `compose.mcp.yaml` — opt-in API environment; no port/network/ingress changes.
- `docs/chatgpt-mcp-integration.md` — architecture, tools, security, OAuth, tunnel,
  ChatGPT, Inspector, deployment, troubleshooting and limitations.
- `docs/history/CHANGELOG.md` — index entry.

## How the pieces connect

ChatGPT reaches the private SDK HTTP endpoint through Secure MCP Tunnel. The
OAuth provider authenticates the end user and issues resource-bound tokens; the
SDK verifier binds their subject to an existing User. Each tool requires a scope
and uses the same SQLAlchemy sessions, memory/search, Pages, calendar recurrence
and fitness builder used by the application.

A write creates an AIConversation, awaiting-confirmation AIMessage and pending
AIAction with validated arguments. The existing Assistant loads those previews.
Its confirm route locks the pending action, revalidates the saved payload and
executes the corresponding domain adapter in the same transaction as the action
status update. Rejection changes only proposal state. ChatGPT can read completion
status but has no approval tool. Existing local-agent dispatch stays unchanged.

## How to modify this later

Add a bounded schema and `WRITE_INPUTS` entry for a new write, then implement its
approved operation in `domain.py` and register the proposal tool in `server.py`.
Keep approval outside MCP. Reads must filter ownership and require the right
scope; health data needs fitness scopes. Register accurate annotations and safe,
compact responses. Extend transport/auth tests before exposing another resource.

Page-backed records are tagged with `properties.second_brain_kind`; change their
properties and readable document together. If a dedicated task/inventory module
is later built, migrate those records rather than introducing a second source of
truth. Memory source filters must preserve other index types during synchronization.
The workout builder must remain commit-free so approval and sets stay atomic.

Configure OAuth and the private tunnel using the runbook. Use the optional Compose
override for every API rebuild; the existing updater uses only the base Compose
file. Do not expose the internal API or alter VPN ingress for this feature. Public
plugin distribution requires a separately reviewed MCP-only public gateway.
