# AI tool contracts

The model never writes SQL or receives a generic database tool. It can call narrow domain functions after authorization and scope validation.

Finance tools are implemented behind the existing authenticated API/domain boundary. The tool
layer must reuse the current user's ownership checks and may not query finance tables by bypassing
the route/domain authorization contract.

## Tool permission classes

| Class | Examples | Default |
|---|---|---|
| Read | balances, events, evidence, reports | Allowed within current user scope |
| Calculate | deterministic scenarios | Allowed with typed inputs |
| Research | official-source web search | User-configurable |
| Propose | classification or task draft | Allowed, no application |
| Apply | confirm/edit records | Never directly callable by the model |

## Example: passive-income breakdown

```json
{
  "name": "get_passive_income_breakdown",
  "description": "Return a deterministic breakdown of confirmed and proposed passive-income events.",
  "parameters": {
    "type": "object",
    "properties": {
      "taxYear": { "type": "integer" },
      "from": { "type": "string", "format": "date" },
      "to": { "type": "string", "format": "date" },
      "groupBy": {
        "type": "string",
        "enum": ["day", "month", "source", "asset", "event_type"]
      },
      "jurisdiction": { "type": ["string", "null"] },
      "status": {
        "type": "array",
        "items": { "enum": ["proposed", "confirmed"] }
      }
    },
    "required": ["taxYear", "from", "to", "groupBy"],
    "additionalProperties": false
  }
}
```

Result requirements:

- Decimal strings, never floats.
- Result scope and currency.
- Event/review-group IDs supporting each aggregate.
- Missing valuation count.
- Data completeness warnings.

## Example: current-guidance research

```json
{
  "name": "research_current_guidance",
  "description": "Search current external guidance for a specific jurisdiction, tax year and question.",
  "parameters": {
    "type": "object",
    "properties": {
      "jurisdiction": { "type": "string" },
      "taxYear": { "type": "integer" },
      "question": { "type": "string" },
      "sourcePolicy": {
        "enum": ["official_only", "primary_preferred", "broader_web"]
      }
    },
    "required": ["jurisdiction", "taxYear", "question", "sourcePolicy"],
    "additionalProperties": false
  }
}
```

The server, not the model, enforces domain filters and records access time and citations.

## Example: classification proposal

```json
{
  "name": "propose_event_classification",
  "description": "Create a draft classification proposal; does not modify the event.",
  "parameters": {
    "type": "object",
    "properties": {
      "eventRevisionIds": {
        "type": "array",
        "minItems": 1,
        "items": { "type": "string", "format": "uuid" }
      },
      "taxProfileId": { "type": "string", "format": "uuid" },
      "category": { "type": "string" },
      "rationale": { "type": "string" },
      "sourceReferences": {
        "type": "array",
        "items": { "type": "string" }
      }
    },
    "required": ["eventRevisionIds", "taxProfileId", "category", "rationale"],
    "additionalProperties": false
  }
}
```

The returned proposal includes a diff, impacted reports and a separate confirmation token rendered by the application UI.

## Server-side checks for every call

- Authenticated owner/share scope.
- Allowed tax years and accounts.
- Tool allowed in current conversation mode.
- Query complexity and result-size limit.
- Redaction policy before returning content to the model.
- Audit record containing tool, arguments hash and result metadata.
