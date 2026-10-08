# ChatGPT MCP integration

The official Python MCP SDK serves stateless Streamable HTTP at `/api/mcp` inside
FastAPI. It is disabled by default. ChatGPT is an additional client of the existing
application services; no OpenAI SDK, second database, or parallel agent is required.
No VPS change, deployment, push, or live ChatGPT connection was performed while
implementing this feature.

## Existing architecture and reuse

React/TypeScript/Vite calls FastAPI, backed by async SQLAlchemy and PostgreSQL with
pgvector. Pages contain Tiptap documents and arbitrary properties; a generic Link
table joins resources. Existing calendar reads expand recurrence and sharing rules.
Fitness stores owned exercises, sessions and set entries; completed sessions have
calendar links. Food stores meal logs, photos and daily totals. Google/ICS calendar
sync runs in the backend. The optional Telegram bridge uses approved device grants.

The existing AI agent has provider-independent tools, persistent memories, hybrid
keyword/embedding search, skills and an AIAction approval queue. MCP reuses these
records and services. Search now includes memories and can restrict source types
before ranking and embedding. Existing configured embedding providers are reused;
without an available embedding provider, search falls back to keyword matching.
Only bounded, relevant hits are returned to ChatGPT, never the entire profile.

Tasks, groceries and daily plans did not have dedicated models. They are ordinary
owned Pages tagged with `properties.second_brain_kind` (`task`, `grocery`, or
`daily_plan`), visible in Notes, with readable content and structured properties.
No migration is needed. MCP interprets the properties; editing only the prose in
Notes does not update those properties. Plans remain Notes plans, not new calendar
events. Approval checks existing recurring calendar occurrences, other saved plans
and proposed activity overlaps in Europe/Stockholm.

## Tools and scopes

| Group | Tools | Scope |
| --- | --- | --- |
| Memory reads | `search_memories`, `get_memory`, `get_related_memories`, `get_personal_context` | `brain:read` |
| Memory proposals | `create_memory`, `update_memory` | `brain:write` |
| Planning reads | `get_daily_plan`, `get_upcoming_tasks`, `get_weekly_overview` | `brain:read` |
| Planning proposals | `create_task`, `update_task`, `complete_task`, `create_daily_plan` | `brain:write` |
| Shopping reads | `get_grocery_list`, `generate_grocery_suggestions` | `brain:read` |
| Shopping proposals | `add_grocery_item`, `update_grocery_item`, `remove_grocery_item` | `brain:write` |
| Fitness reads | `get_workout_history`, `get_workout_session`, `get_workout_plan`, `get_exercise_progress`, `list_exercises` | `fitness:read` |
| Fitness proposals | `log_workout_session`, `update_workout_session` | `fitness:write` |
| Notes reads | `search_notes`, `get_note` | `brain:read` |
| Notes proposals | `create_note` | `brain:write` |
| Proposal tracking | `get_action_status` | `brain:read`; fitness proposals also require `fitness:read` |

Tool schemas and annotations come from the official SDK and Pydantic. Every tool
advertises its OAuth scope. Read/write/destructive annotations match its behavior;
search tools are externally connected because the configured embedding service
may be outside the VPS. No arbitrary URL fetch, admin, credential, sharing, dynamic
tool creation or generic API proxy is exposed.

Date ranges use inclusive `start`/`end` dates and are limited to 366 days. Timestamp
inputs require an explicit UTC offset. Grocery quantities have `amount` and `unit`,
for example `{"amount": 2, "unit": "L"}`. Repeated case-insensitive names merge only
when units match. A different unit requires an explicit update. Removing an item
moves its Page to Notes trash, where it can be restored.

Exercise arguments use IDs from `list_exercises`. Sets accept `set_number`, `reps`,
`weight`, `distance_km`, and `duration_min`. Logging validates all exercise ownership
before atomically creating the session, sets, and existing fitness calendar link.

## Human approval

Every write returns a proposal under `structuredContent.data` with
`status=pending_confirmation`, `action_id`, `conversation_id` and the full preview.
This records approval state but changes no domain data.

1. Open Second Brain's Assistant.
2. Select the conversation titled `ChatGPT: <tool_name>` from conversation history.
3. Inspect the preview and approve or reject it using the existing controls.
4. Ask ChatGPT to call `get_action_status` with the returned `action_id`.
5. An executed result includes the affected `resource_id`.

There is deliberately no MCP approval tool. Model-supplied `confirmed=true` cannot
bypass approval. Local user authentication, ownership checks, and pending-action
locking protect the approval route. MCP writes ignore any looser local-agent
autonomy setting. Failed validation leaves a proposal pending; reject it and issue
a corrected proposal. Existing application undo is not implemented for MCP
proposals; restore trashed groceries through Notes or propose a corrective edit.
Approval does not run a local AI provider or require a provider API key.

## OAuth setup

Use an established OAuth 2.1 authorization server (for example an existing Auth0
or Keycloak deployment). This integration implements the resource server, not a
new identity provider or registration service. The provider must:

- Support authorization code with S256 PKCE and the MCP OAuth discovery contract.
- Support the client registration method required by your ChatGPT surface (CIMD,
  dynamic registration, or a pre-registered client as supported by the provider).
- Accept the RFC 8707 `resource` parameter and issue a signed **access token** whose
  `aud` is exactly `MCP_RESOURCE_URL`.
- Publish its authorization-server discovery document and JWKS endpoint.
- Issue RS256 or ES256 JWTs with `iss`, `aud`, `sub`, `iat`, `exp` and space-separated
  `scope`. Opaque access tokens are not supported by this verifier.
- Configure the exact redirect URI supplied by the ChatGPT linking flow, never a
  wildcard redirect. Configure authorized scopes and consent in the provider.

Set the following environment variables (placeholders are in `.env.example`):

| Variable | Value |
| --- | --- |
| `MCP_ENABLED` | `true` after configuring all other fields |
| `MCP_RESOURCE_URL` | Canonical resource URL, e.g. `https://brain.example.com/api/mcp` |
| `MCP_ISSUER_URL` | Exact issuer in JWT `iss` (including any trailing slash) |
| `MCP_JWKS_URL` | Trusted provider's HTTPS JWKS URL |
| `MCP_SUBJECT_USERS` | JSON object mapping exact issuer `sub` to existing local user UUID |
| `MCP_ALLOWED_HOSTS` | JSON array of actual private connection Host headers |

Get your local user ID by signing into Second Brain and inspecting `GET /api/auth/me`
with the existing authenticated browser session. Bind only explicitly authorized
subjects. No email matching or automatic account creation occurs. Mapping changes
require restarting the backend. Disable access by disabling the local account,
removing the subject mapping and restarting, or revoking access at the provider.
JWTs remain valid until expiry unless the local account/mapping is disabled;
configure short access-token lifetimes and provider-managed refresh-token rotation.

The SDK publishes protected-resource metadata at
`/.well-known/oauth-protected-resource/api/mcp` and issues `WWW-Authenticate`
challenges with that URL. Tokens are checked for signature, issuer, audience,
expiration and identity mapping on every HTTP request; every tool rechecks the
active local user and its required scope. Browser cookies and Telegram device
bearers are not accepted at the MCP endpoint. SDK Host/Origin checks protect
against DNS rebinding. URLs must use HTTPS except for loopback development.

Dedicated workout/meal records never appear in general note/memory searches.
Calendar commitments and notes may themselves contain user-entered health text;
calendar planning tools show event titles/times as ordinary commitments. Keep
sensitive details in dedicated fitness records if they must require fitness scopes.
Stored text is marked as untrusted data. Prompt injection cannot grant identity,
scopes or approval. Tool failures use safe error codes, not backend exceptions;
MCP logs no input arguments, tokens or personal content. Provider embeddings retain
the existing AI-settings privacy behavior; use local embeddings to keep index text
inside your network.

## Development

From the repository root:

```bash
uv sync --directory apps/api --locked
npm run dev:api
```

Configure the MCP environment before starting. For local Inspector testing you can
use `MCP_RESOURCE_URL=http://localhost:8000/api/mcp` while keeping the issuer/JWKS
on HTTPS. Configure that exact audience in your provider as well. Development
needs the existing database running and its migrations applied as usual.

The MCP server shares the API process and lifespan; no second server command is
necessary. Without `MCP_ENABLED=true`, the existing application is unchanged and
`/api/mcp` is unavailable.

## Production configuration (manual, opt-in)

`compose.mcp.yaml` adds only the MCP environment variables to the existing API
service. It introduces no host-bound ports, public ingress or tunnel credentials.
The base `compose.yaml`, nginx, Traefik VPN allowlist and database services are
unchanged. The operator must review and apply the override manually:

```bash
docker compose -f compose.yaml -f compose.mcp.yaml config --quiet
docker compose -f compose.yaml -f compose.mcp.yaml up -d --build api
```

Use both Compose files for subsequent API rebuilds; the current updater script
uses only the base file and therefore does not preserve this opt-in configuration.
Do not use the updater for MCP-enabled API updates without supplying the override
through your operator workflow. No production secrets belong in version control.

## Secure MCP Tunnel: private connection

The [official tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
confirms private ChatGPT connections are supported without inbound public ports.
The authorization server still needs to be reachable for browser OAuth;
tunneling the MCP resource does not automatically tunnel the identity provider.

1. Open [Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels).
   Create a tunnel, associate your Platform organization and target ChatGPT
   workspace, and grant the operator Tunnels Read + Use (Manage to create/edit).
2. Obtain `tunnel-client` from the download link in Platform settings or the
   [official latest release](https://github.com/openai/tunnel-client/releases/latest).
3. Run it inside the VPN/private network that can reach the API, preferably as a
   sidecar on the existing internal Docker network. Inside that network the MCP
   address is `http://secondbrain-api:8000/api/mcp`. A host process does not have
   access to Docker-only DNS/ports; join the network or use your private VPN
   hostname. If using nginx, the metadata path needs an explicit private proxy
   route (nginx's default SPA fallback does not serve it). Direct API access from
   the private tunnel process avoids that nginx change.
4. Use the client's `help quickstart` and HTTP profile options:

```bash
# Supply CONTROL_PLANE_API_KEY through your secret manager, not this document.
tunnel-client help quickstart
tunnel-client init --profile second-brain --tunnel-id YOUR_TUNNEL_ID \
  --mcp-server-url http://secondbrain-api:8000/api/mcp
tunnel-client doctor --profile second-brain --explain
tunnel-client run --profile second-brain
```

The client needs outbound HTTPS to `api.openai.com:443` and local connectivity to
the API. Keep the polling process alive. Its admin UI should remain loopback-only.
Control-plane credentials belong only to the tunnel process; they are unrelated
to the user's OAuth access token. Review the generated profile against the current
client help and ensure per-request OAuth Authorization headers are forwarded.
No tunnel binary, service or credentials were installed by this change.

## Connect in ChatGPT

Following the [official connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt):

1. Go to ChatGPT Plugins, select the plus button, then **Add custom MCP server**.
2. Name it **Second Brain** and describe it as your private planning and memory assistant.
3. Under Connection choose **Tunnel**, then select or paste your `tunnel_id`.
4. Configure OAuth using your provider's supported linking/registration flow.
   Request `brain:read`; add `brain:write` for proposals and the two fitness scopes
   only if you want dedicated health tools. Review consent, then create the plugin.
5. Authenticate at the provider as the explicitly mapped local account identity.
6. Test a read ("What do I have planned for tomorrow?") and a write proposal
   ("Remember that I study in the morning"). Approve the proposal in Second Brain.
7. Check `get_action_status` and the corresponding record in the normal application.

Account/workspace policies may restrict custom MCP or tunnels. A tunnel-backed
private plugin is for supported private/developer connections, not public plugin
submission. Public distribution requires a stable public HTTPS MCP endpoint under
[OpenAI's server requirements](https://developers.openai.com/plugins/build/mcp-server).
This implementation does not open such an endpoint. If you later request public
distribution, review a narrowly scoped MCP-only gateway with OAuth and OpenAI client
mTLS separately; never publish the entire internal API.

## Inspector and automated validation

Start the existing API with MCP enabled and obtain a short-lived OAuth token from
the configured provider. Run the [official Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector@latest
```

Select **Streamable HTTP**, enter `http://localhost:8000/api/mcp`, and configure its
Authorization header with the short-lived bearer token. Check initialization,
tool listing, schemas, annotations, a filtered memory search, a proposal, local
approval, and status retrieval. Never paste credentials into versioned files or
screenshots. Do not reuse an application cookie/device grant as the OAuth token.

Automated HTTP transport tests use the real SDK, signed JWTs with test-only keys,
and an isolated SQLite database. They cover initialization/discovery, token and
scope failures, memory search/CRUD, tasks, shopping, planning conflicts, workout
logging, approval/rejection, replay, ownership, malformed input and safe backend
errors. Existing application regression checks are run with:

```bash
npm run check
```

Validation on 2026-10-08: `npm run check` passed (175 frontend tests, 200 API
tests, including 49 MCP tests). The official MCP SDK client and MCP Inspector CLI
initialized, discovered 29 tools and called the local server. Inspector also
created an approval proposal on a disposable loopback fixture with synthetic data
and test-only signing keys. The optional Compose override validated with
`.env.example`.

These tests do not establish a live ChatGPT, OAuth-provider, PostgreSQL concurrency
or VPS connection. Complete the Inspector/provider/tunnel/ChatGPT checks above in
your configured environment before treating the connection as verified.

## Limitations and troubleshooting

- Memory metadata is not stored by the existing model; only `{}` is accepted.
  Related-memory semantics require configured embeddings; otherwise matching is lexical.
- Groceries have no stock inventory/recipe engine. Suggestions return preference
  evidence and shopping-list context with `inventory_available=false`; ChatGPT
  must ask about stock and explicit recipe ingredients rather than inventing them.
- Projects are existing notes; there is no separate project/habit/finance backend
  in this branch. No unrelated models or pretend endpoints were added.
- Tasks are Pages, not a full task-management module; unscheduled tasks are omitted
  from date-range results. Lists and note text are bounded and indicate truncation.
- Workout plans are existing planned sessions; there is no independent program model.
  Session updates share the existing behavior and do not reschedule linked calendar events.
- `401`: check bearer token, JWT issuer/audience/expiry, subject mapping and JWKS access.
- `insufficient_scope`: update provider consent/token scopes; discovery itself requires
  a valid token but does not require all optional scopes.
- `421`/Origin errors: allow the exact private request Host/Origin; do not disable Host protection.
- `not_found`: check the ID and ownership; foreign records intentionally look missing.
- `conflict` on approval: review units, calendar recurrence and activity overlaps.
- `backend_unavailable`: verify API/database/issuer health without enabling raw request logging.
- No tools/tunnel unavailable: keep `tunnel-client` running, run `doctor`, check the
  workspace association and Tunnels Use role, and confirm protected-resource discovery
  is reaching FastAPI rather than nginx's SPA fallback.
