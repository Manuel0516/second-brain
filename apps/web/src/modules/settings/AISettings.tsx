import { useEffect, useRef, useState } from 'react'
import { Dropdown, type DropdownOption } from '../../components/Dropdown'
import { Field } from '../../components/Field'
import { IconButton } from '../../components/IconButton'
import { SettingsCard } from '../../components/SettingsCard'
import { ToggleRow } from '../../components/ToggleRow'

type Config = {
  provider: 'openrouter' | 'local'
  model_name: string
  local_endpoint_url: string | null
  autonomy_level: 'ask_before_write' | 'auto_low_risk' | 'auto_all'
  embedding_provider: 'openrouter' | 'local'
  embedding_model: string
  embedding_endpoint_url: string | null
  embedding_dimensions: number
  web_fetch_enabled: boolean
}

const PROVIDER_OPTIONS: DropdownOption<Config['provider']>[] = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'local', label: 'Local OpenAI-compatible' },
]

const AUTONOMY_OPTIONS: DropdownOption<Config['autonomy_level']>[] = [
  { value: 'ask_before_write', label: 'Ask before every write' },
  { value: 'auto_low_risk', label: 'Automatic low-risk changes' },
  { value: 'auto_all', label: 'Automatic ordinary changes' },
]

const EMBEDDING_PROVIDER_OPTIONS: DropdownOption<
  Config['embedding_provider']
>[] = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'local', label: 'Local' },
]

type Memory = { id: string; fact: string; category: string }
type Capability = {
  id: string
  method: string
  path: string
  risk: string
  enabled: boolean
}
type Action = { id: string; tool: string; status: string; risk: string }
type Skill = { id: string; name: string; content: string; enabled: boolean }
type ImportResult = {
  memories_imported: number
  memories_already_known: number
  skills_imported: number
  tools_imported: number
  tools_skipped: string[]
}

export function AISettings() {
  const [config, setConfig] = useState<Config | null>(null)
  const [memories, setMemories] = useState<Memory[]>([])
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [actions, setActions] = useState<Action[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [saved, setSaved] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState('')
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void Promise.all([
      fetch('/api/ai/settings').then((response) => response.json()),
      fetch('/api/ai/memories').then((response) => response.json()),
      fetch('/api/ai/capabilities').then((response) => response.json()),
      fetch('/api/ai/actions').then((response) => response.json()),
      fetch('/api/ai/skills').then((response) => response.json()),
    ]).then(
      ([
        nextConfig,
        nextMemories,
        nextCapabilities,
        nextActions,
        nextSkills,
      ]) => {
        setConfig(nextConfig as Config)
        setMemories(nextMemories as Memory[])
        setCapabilities(nextCapabilities as Capability[])
        setActions(nextActions as Action[])
        setSkills(nextSkills as Skill[])
      },
    )
  }, [])

  if (!config) return <p className="route-loading">Loading AI settings…</p>

  const save = async () => {
    const response = await fetch('/api/ai/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (response.ok) {
      setConfig((await response.json()) as Config)
      setSaved('Saved')
      setTimeout(() => setSaved(''), 2000)
    }
  }

  const toggleCapability = async (capability: Capability) => {
    const response = await fetch(`/api/ai/capabilities/${capability.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !capability.enabled }),
    })
    if (response.ok)
      setCapabilities((rows) =>
        rows.map((row) =>
          row.id === capability.id ? { ...row, enabled: !row.enabled } : row,
        ),
      )
  }

  const deleteMemory = async (memory: Memory) => {
    const response = await fetch(`/api/ai/memories/${memory.id}`, {
      method: 'DELETE',
    })
    if (response.ok)
      setMemories((rows) => rows.filter((row) => row.id !== memory.id))
  }

  const saveSkill = async (skill: Skill) => {
    const response = await fetch(`/api/ai/skills/${skill.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(skill),
    })
    if (response.ok) {
      setSaved(`Saved ${skill.name}`)
      setTimeout(() => setSaved(''), 2000)
    }
  }

  const toggleSkill = async (skill: Skill) => {
    const response = await fetch(`/api/ai/skills/${skill.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !skill.enabled }),
    })
    if (response.ok)
      setSkills((rows) =>
        rows.map((row) =>
          row.id === skill.id ? { ...row, enabled: !row.enabled } : row,
        ),
      )
  }

  const exportKnowledge = async () => {
    const response = await fetch('/api/ai/knowledge/export')
    if (!response.ok) return
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `secondbrain-ai-knowledge-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importKnowledge = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImportError('')
    setImportResult(null)
    let payload: unknown
    try {
      payload = JSON.parse(await file.text())
    } catch {
      setImportError('That file is not valid JSON.')
      return
    }
    const response = await fetch('/api/ai/knowledge/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      setImportError(
        typeof data.detail === 'string' ? data.detail : 'Import failed.',
      )
      return
    }
    setImportResult((await response.json()) as ImportResult)
    void Promise.all([
      fetch('/api/ai/memories').then((r) => r.json()),
      fetch('/api/ai/skills').then((r) => r.json()),
    ]).then(([nextMemories, nextSkills]) => {
      setMemories(nextMemories as Memory[])
      setSkills(nextSkills as Skill[])
    })
  }

  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <h1>AI assistant</h1>
        <p>Control what the agent can use, learn, and change.</p>
      </header>

      <SettingsCard
        title="Export & import knowledge"
        description="Memories, skills, and agent-created tools — not settings or conversation history. Use this to move what the agent has learned from one deployment to another (e.g. development to production)."
      >
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          onChange={(event) => void importKnowledge(event)}
          hidden
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="settings-card-save"
            type="button"
            onClick={() => void exportKnowledge()}
          >
            Export
          </button>
          <button
            className="settings-card-save"
            type="button"
            onClick={() => importInputRef.current?.click()}
          >
            Import
          </button>
        </div>
        {importError && (
          <p className="settings-empty" role="alert">
            {importError}
          </p>
        )}
        {importResult && (
          <p className="settings-card-saved">
            Imported {importResult.memories_imported} memor
            {importResult.memories_imported === 1 ? 'y' : 'ies'} (
            {importResult.memories_already_known} already known),{' '}
            {importResult.skills_imported} skill
            {importResult.skills_imported === 1 ? '' : 's'},{' '}
            {importResult.tools_imported} tool
            {importResult.tools_imported === 1 ? '' : 's'}.
            {importResult.tools_skipped.length > 0 &&
              ` Skipped (no matching route on this server): ${importResult.tools_skipped.join(', ')}.`}
          </p>
        )}
      </SettingsCard>

      <SettingsCard
        title="Model & autonomy"
        onSave={() => void save()}
        hasChanges
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <Field label="Model">
            <input
              value={config.model_name}
              onChange={(event) =>
                setConfig({ ...config, model_name: event.target.value })
              }
            />
          </Field>
          <div className="settings-field-row">
            <Field label="Provider">
              <Dropdown
                ariaLabel="Provider"
                value={config.provider}
                onChange={(provider) => setConfig({ ...config, provider })}
                options={PROVIDER_OPTIONS}
              />
            </Field>
            <Field label="Autonomy">
              <Dropdown
                ariaLabel="Autonomy"
                value={config.autonomy_level}
                onChange={(autonomy_level) =>
                  setConfig({ ...config, autonomy_level })
                }
                options={AUTONOMY_OPTIONS}
              />
            </Field>
          </div>
          {config.provider === 'local' && (
            <Field label="Local endpoint">
              <input
                value={config.local_endpoint_url ?? ''}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    local_endpoint_url: event.target.value,
                  })
                }
                placeholder="http://localhost:11434/v1"
              />
            </Field>
          )}
          {saved && <span className="settings-card-saved">{saved}</span>}
        </div>
      </SettingsCard>

      <SettingsCard
        title="Semantic retrieval"
        description="OpenRouter sends indexed text to the configured embedding model. Choose Local to keep it on your network."
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <Field label="Embedding provider">
            <Dropdown
              ariaLabel="Embedding provider"
              value={config.embedding_provider}
              onChange={(embedding_provider) =>
                setConfig({ ...config, embedding_provider })
              }
              options={EMBEDDING_PROVIDER_OPTIONS}
            />
          </Field>
          <Field label="Embedding model">
            <input
              value={config.embedding_model}
              onChange={(event) =>
                setConfig({ ...config, embedding_model: event.target.value })
              }
            />
          </Field>
          {config.embedding_provider === 'local' && (
            <Field label="Embedding endpoint">
              <input
                value={config.embedding_endpoint_url ?? ''}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    embedding_endpoint_url: event.target.value,
                  })
                }
              />
            </Field>
          )}
          <button
            className="settings-card-save"
            type="button"
            onClick={() =>
              void fetch('/api/ai/search/reindex', { method: 'POST' })
            }
          >
            Reindex now
          </button>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Web access"
        description="Lets the agent fetch a specific web page's text (e.g. a link you give it) — including clicking a page's own 'Show more' button to load paginated results first, when asked. Only http(s) URLs are fetched, and requests to private/internal addresses are always blocked. There is no general web search — it can only open a URL, not go looking for one."
        onSave={() => void save()}
        hasChanges
      >
        <ToggleRow
          label="Allow fetching web pages"
          checked={config.web_fetch_enabled}
          onChange={(web_fetch_enabled) =>
            setConfig({ ...config, web_fetch_enabled })
          }
        />
        {saved && <span className="settings-card-saved">{saved}</span>}
      </SettingsCard>

      <SettingsCard
        title={`Memory (${memories.length})`}
        description="Durable facts injected into future conversations."
      >
        <div style={{ display: 'grid', gap: 6 }}>
          {memories.slice(0, 20).map((memory) => (
            <div className="ai-memory-row" key={memory.id}>
              <span className="integration-status">{memory.category}</span>
              <span className="ai-memory-row-fact">{memory.fact}</span>
              <IconButton
                className="ai-memory-row-delete"
                icon="✕"
                label={`Forget "${memory.fact}"`}
                onClick={() => void deleteMemory(memory)}
              />
            </div>
          ))}
          {!memories.length && (
            <p className="settings-empty">No memories yet.</p>
          )}
        </div>
      </SettingsCard>

      <SettingsCard
        title={`Capabilities (${capabilities.filter((item) => item.enabled).length} enabled)`}
        description="Loaded directly from the app's live OpenAPI schema."
      >
        <div style={{ display: 'grid', gap: 6 }}>
          {capabilities.map((capability) => (
            <label className="ai-capability-row" key={capability.id}>
              <input
                type="checkbox"
                checked={capability.enabled}
                disabled={
                  capability.risk === 'forbidden' ||
                  capability.risk === 'unsupported'
                }
                onChange={() => void toggleCapability(capability)}
              />
              <code>
                {capability.method} {capability.path}
              </code>
              <span className="integration-status">{capability.risk}</span>
            </label>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        title={`Skills (${skills.length})`}
        description="Reusable procedures the agent loads when relevant."
      >
        <div style={{ display: 'grid', gap: 10 }}>
          {skills.map((skill) => (
            <div className="ai-skill-card" key={skill.id}>
              <Field label="Skill name">
                <input
                  value={skill.name}
                  onChange={(event) =>
                    setSkills((rows) =>
                      rows.map((row) =>
                        row.id === skill.id
                          ? { ...row, name: event.target.value }
                          : row,
                      ),
                    )
                  }
                />
              </Field>
              <textarea
                value={skill.content}
                onChange={(event) =>
                  setSkills((rows) =>
                    rows.map((row) =>
                      row.id === skill.id
                        ? { ...row, content: event.target.value }
                        : row,
                    ),
                  )
                }
              />
              <div className="ai-skill-card-footer">
                <ToggleRow
                  label="Enabled"
                  checked={skill.enabled}
                  onChange={() => void toggleSkill(skill)}
                />
                <button
                  className="settings-card-save"
                  type="button"
                  onClick={() => void saveSkill(skill)}
                >
                  Save skill
                </button>
              </div>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Recent actions">
        <div style={{ display: 'grid' }}>
          {actions.slice(0, 20).map((action) => (
            <div className="ai-action-row" key={action.id}>
              <code>{action.tool}</code>
              <span>{action.status}</span>
              <span className="integration-status">{action.risk}</span>
            </div>
          ))}
          {!actions.length && <p className="settings-empty">No actions yet.</p>}
        </div>
      </SettingsCard>
    </div>
  )
}
