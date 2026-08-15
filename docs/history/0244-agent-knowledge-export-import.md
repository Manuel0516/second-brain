# 0244 — Export/import the agent's learned knowledge between deployments

Date: 2026-08-15
Status: accepted

## What changed

Added a way to move what the AI agent has learned in one deployment (e.g. this development
setup) into another (e.g. production) — a JSON export/import of memories, skills, and
agent-created/enabled tools, with an "Export & import knowledge" card in AI settings.

- `GET /api/ai/knowledge/export` — returns all of the current user's `AIMemory` rows (fact +
  category), `AISkill` rows (name + content + enabled), and `AITool` rows (name + description +
  kind + spec + enabled + source), as a single JSON document. Deliberately excludes
  `AISettings` (provider/model/API config — environment-specific, not learned knowledge) and
  conversation history (not knowledge, and potentially large/private).
- `POST /api/ai/knowledge/import` — takes the same shape and applies it: memories go through
  `memory.remember()` (the exact function the agent's own `remember` tool calls), so dedup
  behavior is identical to normal agent writes and re-importing the same export is a safe
  no-op; skills go through `memory.save_skill()` (create-or-update-by-name); tool specs are
  re-validated against the *importing* instance's own routes/OpenAPI capability catalog before
  being stored — a spec that resolved on the exporting instance doesn't get a free pass, it has
  to resolve to a real route on whatever's actually running here. Invalid tools are skipped
  (not a hard failure) and named in the response so the caller knows what didn't come across.
- Frontend: a new "Export & import knowledge" `SettingsCard` at the top of the AI settings
  page. Export downloads a JSON file (same `Blob`/`createObjectURL`/anchor-click pattern
  `GeneralSettings.tsx`'s existing data export already uses). Import is a hidden file input
  triggered by a button (matching `MealLogModal.tsx`'s file-input pattern), parses the selected
  file client-side, POSTs it, and shows a result summary (counts imported/already-known/
  skipped) or a parse/request error.

## Why

User request: a way to carry over what the agent learned during development into the
production deployment, expecting to use it as a recurring migration step rather than a one-off.

## Files touched

- `apps/api/app/routes/ai.py` — `MemoryExport`/`SkillExport`/`ToolExport`/`KnowledgeExport`/
  `KnowledgeImport`/`KnowledgeImportResult` Pydantic models; `GET /knowledge/export` and
  `POST /knowledge/import` routes.
- `apps/web/src/modules/settings/AISettings.tsx` — new card, `exportKnowledge`/
  `importKnowledge` handlers, hidden file input + ref, result/error display; refreshes the
  Memory/Skills cards on the same page after a successful import so the new data is visible
  immediately without a manual reload.
- `apps/api/tests/test_ai.py` — export shape; import dedup (`memories_already_known` on
  repeat) and skill upsert (content/enabled updated on re-import); an invalid tool spec is
  skipped and never persisted; a cross-account round trip (export as one user, import as a
  different one) proving the payload is self-contained and isn't tied back to the exporting
  account.
- `apps/web/src/modules/settings/AISettings.test.tsx` — new file: successful import shows the
  summary text, invalid JSON shows a client-side error without ever calling the import
  endpoint, and the Export button calls the export endpoint.

## How the pieces connect

Both routes reuse existing, already-tested machinery rather than reimplementing dedup/
validation: `memory.remember`/`memory.save_skill` (the same functions the agent's `remember`/
`save_skill` tools call — see `apps/api/app/modules/ai/tools.py`) and
`spec_tools.validate_spec`/`capabilities.find` (the same validation `create_tool`/`update_tool`
already use). This is why import is safe to re-run: it's the same idempotent write path the
agent itself uses every day, not a bespoke bulk-loader with its own rules.

## How to modify this later

- Tool specs with `source == "openapi"` are matched by `capability_id`, which is a deterministic
  hash of `METHOD path` (see `capabilities.py`) — stable across instances running the same app
  version, but if the app's API surface changes between the exporting and importing deployment's
  versions, some capability ids won't resolve and those tools land in `tools_skipped`. That's
  expected, not a bug to fix.
- If conversation history or `AISettings` ever need to travel too, that's a deliberate, separate
  decision (privacy/size for history; environment-specific for settings) — don't fold them into
  this endpoint's default payload without re-litigating why they were excluded here.
