import { useEffect, useRef, useState } from 'react'
import { IconButton } from '../../components/IconButton'
import { Popover } from '../../components/Popover'
import { Segmented } from '../../components/Segmented'
import {
  confirmFinanceAssistantProposal,
  createFinanceAssistantProposal,
  fetchFinanceAccounts,
  rejectFinanceAssistantProposal,
  runFinanceAssistantTool,
} from './api'
import {
  CitationList,
  IconClose,
  IconSparkle,
  ReasonModal,
  StatusPill,
  WarningList,
} from './primitives'
import type {
  FinanceAccount,
  FinanceAssistantScope,
  FinanceAssistantToolName,
  FinanceAssistantToolResult,
  FinanceProposalCard,
  FinanceSourceCitation,
} from './types'

type ScopeType = FinanceAssistantScope['type']
type ToolPermission = 'read' | 'calculate' | 'research' | 'propose'
type ProposalType =
  | 'event_classification'
  | 'review_policy'
  | 'open_question'
  | 'export_note'

interface ToolMeta {
  permission: ToolPermission
  scopes: ScopeType[]
  required: string[]
  optional: string[]
  description: string
}

/** Mirrors app.services.finance_ai.TOOL_SPECS so the form only ever sends allowlisted shapes. */
const TOOL_META: Record<FinanceAssistantToolName, ToolMeta> = {
  get_financial_snapshot: {
    permission: 'read',
    scopes: ['finance'],
    required: [],
    optional: [],
    description: 'Balances, totals and readiness for the scoped tax year.',
  },
  list_accounts: {
    permission: 'read',
    scopes: ['finance'],
    required: [],
    optional: ['status', 'limit'],
    description: 'List accounts, optionally filtered by status.',
  },
  list_events: {
    permission: 'read',
    scopes: ['finance', 'account', 'event_revisions'],
    required: [],
    optional: ['from', 'to', 'status', 'event_type', 'limit'],
    description: 'List event revisions in a date range.',
  },
  get_event_lineage: {
    permission: 'read',
    scopes: ['event_revisions'],
    required: [],
    optional: [],
    description: 'Full source → revision lineage for the scoped events.',
  },
  get_evidence_for_event: {
    permission: 'read',
    scopes: ['event_revisions'],
    required: [],
    optional: [],
    description: 'Evidence documents linked to the scoped events.',
  },
  get_reconciliation_status: {
    permission: 'read',
    scopes: ['account'],
    required: ['period_start', 'period_end'],
    optional: [],
    description: 'Reconciliation status for an account over a period.',
  },
  explain_balance_change: {
    permission: 'read',
    scopes: ['account'],
    required: ['from', 'to'],
    optional: [],
    description: 'What moved an account balance between two dates.',
  },
  get_asset_lots: {
    permission: 'read',
    scopes: ['finance'],
    required: ['asset_id', 'jurisdiction', 'tax_year'],
    optional: [],
    description: 'Lots for an asset under a jurisdiction and tax year.',
  },
  get_derivative_position_summary: {
    permission: 'read',
    scopes: ['account'],
    required: ['period_start', 'period_end'],
    optional: [],
    description: 'Derivative position summary for an account/period.',
  },
  get_passive_income_breakdown: {
    permission: 'read',
    scopes: ['finance', 'account'],
    required: ['from', 'to', 'group_by'],
    optional: ['status'],
    description: 'Passive income breakdown grouped by source, asset or day.',
  },
  get_tax_package_status: {
    permission: 'read',
    scopes: ['finance', 'report'],
    required: ['tax_profile_id'],
    optional: [],
    description: 'Tax package completeness for a profile.',
  },
  calculate_scenario: {
    permission: 'calculate',
    scopes: ['finance', 'account', 'event_revisions', 'report'],
    required: ['calculation_type', 'typed_inputs'],
    optional: [],
    description: 'Run a deterministic what-if calculation.',
  },
  research_current_guidance: {
    permission: 'research',
    scopes: ['finance'],
    required: ['jurisdiction', 'tax_year', 'question', 'source_policy'],
    optional: [],
    description: 'Look up current official guidance, with citations.',
  },
  propose_event_classification: {
    permission: 'propose',
    scopes: ['finance', 'event_revisions'],
    required: ['event_revision_ids', 'tax_profile_id', 'category', 'rationale'],
    optional: ['source_references'],
    description: 'Draft a classification change for confirmation.',
  },
  propose_review_policy: {
    permission: 'propose',
    scopes: ['finance'],
    required: ['review_group_id', 'matching_fields', 'rationale'],
    optional: [],
    description: 'Draft a reusable review policy for confirmation.',
  },
  create_open_question_draft: {
    permission: 'propose',
    scopes: ['finance', 'event_revisions', 'report'],
    required: ['title', 'severity', 'rationale'],
    optional: ['related_revision_ids'],
    description: 'Draft an open question for the tax package.',
  },
  prepare_export_note: {
    permission: 'propose',
    scopes: ['report'],
    required: ['note'],
    optional: [],
    description: 'Draft a note attached to a report export.',
  },
}

const ARRAY_ARG_KEYS = new Set([
  'event_revision_ids',
  'matching_fields',
  'related_revision_ids',
  'source_references',
])
const TEXTAREA_ARG_KEYS = new Set(['rationale', 'note', 'question'])
const JSON_ARG_KEYS = new Set(['typed_inputs'])

const PROPOSAL_TOOL_TO_TYPE: Partial<
  Record<FinanceAssistantToolName, ProposalType>
> = {
  propose_event_classification: 'event_classification',
  propose_review_policy: 'review_policy',
  create_open_question_draft: 'open_question',
  prepare_export_note: 'export_note',
}

function coerceArgValue(key: string, raw: string): unknown {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  if (ARRAY_ARG_KEYS.has(key)) {
    return trimmed
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
  }
  if (JSON_ARG_KEYS.has(key)) {
    return JSON.parse(trimmed) as unknown
  }
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  return trimmed
}

function ScopeFields({
  type,
  values,
  onChange,
  accounts,
}: {
  type: ScopeType
  values: Record<string, string>
  onChange: (next: Record<string, string>) => void
  accounts: FinanceAccount[]
}) {
  function set(key: string, value: string) {
    onChange({ ...values, [key]: value })
  }
  if (type === 'finance') {
    return (
      <div className="fin-tool-scope-fields">
        <input
          placeholder="Tax year (optional)"
          value={values.tax_year ?? ''}
          onChange={(e) => set('tax_year', e.target.value)}
        />
        <input
          placeholder="Jurisdiction (optional)"
          value={values.jurisdiction ?? ''}
          onChange={(e) => set('jurisdiction', e.target.value)}
        />
      </div>
    )
  }
  if (type === 'account') {
    return (
      <select
        value={values.account_id ?? ''}
        onChange={(e) => set('account_id', e.target.value)}
      >
        <option value="">Select account…</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </select>
    )
  }
  if (type === 'event_revisions') {
    return (
      <input
        placeholder="Event revision IDs, comma separated"
        value={values.event_revision_ids ?? ''}
        onChange={(e) => set('event_revision_ids', e.target.value)}
      />
    )
  }
  return (
    <input
      placeholder="Report ID"
      value={values.report_id ?? ''}
      onChange={(e) => set('report_id', e.target.value)}
    />
  )
}

function buildScope(
  type: ScopeType,
  values: Record<string, string>,
): FinanceAssistantScope {
  if (type === 'finance') {
    return {
      type: 'finance',
      tax_year: values.tax_year ? Number(values.tax_year) : null,
      jurisdiction: values.jurisdiction || null,
    }
  }
  if (type === 'account') {
    return { type: 'account', account_id: values.account_id ?? '' }
  }
  if (type === 'event_revisions') {
    return {
      type: 'event_revisions',
      event_revision_ids: (values.event_revision_ids ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    }
  }
  return { type: 'report', report_id: values.report_id ?? '' }
}

interface ProposalDraft {
  proposal_type: ProposalType
  scope: FinanceAssistantScope
  before: string
  after: string
  rationale: string
  citations: FinanceSourceCitation[]
  affected_record_count: string
  impacted_report_ids: string
}

function emptyDraft(): ProposalDraft {
  return {
    proposal_type: 'event_classification',
    scope: { type: 'finance', tax_year: null, jurisdiction: null },
    before: '{}',
    after: '{}',
    rationale: '',
    citations: [],
    affected_record_count: '1',
    impacted_report_ids: '',
  }
}

function ToolRunner({ onDraft }: { onDraft: (draft: ProposalDraft) => void }) {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [scopeType, setScopeType] = useState<ScopeType>('finance')
  const [scopeValues, setScopeValues] = useState<Record<string, string>>({})
  const [toolName, setToolName] = useState<FinanceAssistantToolName>(
    'get_financial_snapshot',
  )
  const [argValues, setArgValues] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<FinanceAssistantToolResult | null>(null)

  useEffect(() => {
    void fetchFinanceAccounts({ limit: 200 }).then((page) =>
      setAccounts(page.items),
    )
  }, [])

  const meta = TOOL_META[toolName]

  function selectTool(nextTool: FinanceAssistantToolName) {
    const nextMeta = TOOL_META[nextTool]
    setToolName(nextTool)
    setScopeType((current) =>
      nextMeta.scopes.includes(current) ? current : nextMeta.scopes[0],
    )
    setArgValues({})
    setResult(null)
    setError(null)
  }

  async function run() {
    setRunning(true)
    setError(null)
    try {
      const args: Record<string, unknown> = {}
      for (const key of [...meta.required, ...meta.optional]) {
        const value = coerceArgValue(key, argValues[key] ?? '')
        if (value !== undefined) args[key] = value
      }
      const scope = buildScope(scopeType, scopeValues)
      const toolResult = await runFinanceAssistantTool(toolName, {
        scope,
        arguments: args,
      })
      setResult(toolResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tool call failed')
    } finally {
      setRunning(false)
    }
  }

  function draftFromResult() {
    if (!result) return
    const proposalType = PROPOSAL_TOOL_TO_TYPE[toolName]
    if (!proposalType) return
    const draft = result.result as { draft?: Record<string, unknown> }
    onDraft({
      ...emptyDraft(),
      proposal_type: proposalType,
      scope: result.scope,
      after: JSON.stringify(draft.draft ?? result.result, null, 2),
      rationale:
        typeof (draft.draft ?? {})['rationale'] === 'string'
          ? String((draft.draft as Record<string, unknown>).rationale)
          : '',
    })
  }

  return (
    <div className="fin-tool-runner">
      <Field label="Scope">
        <select
          value={scopeType}
          onChange={(e) => setScopeType(e.target.value as ScopeType)}
        >
          {meta.scopes.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </Field>
      <ScopeFields
        type={scopeType}
        values={scopeValues}
        onChange={setScopeValues}
        accounts={accounts}
      />

      <Field label="Tool">
        <select
          value={toolName}
          onChange={(e) =>
            selectTool(e.target.value as FinanceAssistantToolName)
          }
        >
          {(Object.keys(TOOL_META) as FinanceAssistantToolName[]).map(
            (name) => (
              <option key={name} value={name}>
                {name.replace(/_/g, ' ')}
              </option>
            ),
          )}
        </select>
      </Field>
      <p className="fin-table-sub">{meta.description}</p>

      {[...meta.required, ...meta.optional].map((key) => (
        <Field key={key} label={key.replace(/_/g, ' ')}>
          {TEXTAREA_ARG_KEYS.has(key) || JSON_ARG_KEYS.has(key) ? (
            <textarea
              rows={2}
              value={argValues[key] ?? ''}
              onChange={(e) =>
                setArgValues({ ...argValues, [key]: e.target.value })
              }
              placeholder={
                JSON_ARG_KEYS.has(key) ? '{"key": "value"}' : undefined
              }
            />
          ) : (
            <input
              value={argValues[key] ?? ''}
              onChange={(e) =>
                setArgValues({ ...argValues, [key]: e.target.value })
              }
              placeholder={
                meta.required.includes(key) ? 'required' : 'optional'
              }
            />
          )}
        </Field>
      ))}

      {error && <p className="fin-muted-danger">{error}</p>}
      <button
        type="button"
        className="fin-btn fin-btn-primary fin-btn-sm"
        onClick={() => void run()}
        disabled={running}
      >
        {running ? 'Running…' : 'Run tool'}
      </button>

      {result && (
        <div className="fin-tool-result">
          <WarningList
            warnings={[
              ...result.completeness.blockers,
              ...result.completeness.warnings,
            ]}
          />
          <pre className="fin-tool-result-json">
            {JSON.stringify(result.result, null, 2)}
          </pre>
          <CitationList citations={result.citations} />
          {PROPOSAL_TOOL_TO_TYPE[toolName] && (
            <button
              type="button"
              className="fin-btn fin-btn-ghost fin-btn-sm"
              onClick={draftFromResult}
            >
              Draft a proposal from this
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ProposalComposer({
  draft,
  onDraftChange,
}: {
  draft: ProposalDraft
  onDraftChange: (draft: ProposalDraft) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cards, setCards] = useState<FinanceProposalCard[]>([])
  const [decision, setDecision] = useState<{
    card: FinanceProposalCard
    action: 'confirm' | 'reject'
  } | null>(null)

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      const before = JSON.parse(draft.before || '{}') as Record<string, unknown>
      const after = JSON.parse(draft.after || '{}') as Record<string, unknown>
      const result = await createFinanceAssistantProposal(
        {
          proposal_type: draft.proposal_type,
          scope: draft.scope,
          before,
          after,
          affected_record_count: Number(draft.affected_record_count) || 1,
          impacted_report_ids: draft.impacted_report_ids
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
          rationale: draft.rationale,
          citations: draft.citations,
        },
        crypto.randomUUID(),
      )
      setCards((prev) => [result.proposal, ...prev])
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not create proposal — check before/after are valid JSON',
      )
    } finally {
      setSaving(false)
    }
  }

  async function decide(reason: string) {
    if (!decision) return
    const { card, action } = decision
    const result =
      action === 'confirm'
        ? await confirmFinanceAssistantProposal(
            card.id,
            { confirmation_token: card.confirmation_token, reason },
            crypto.randomUUID(),
          )
        : await rejectFinanceAssistantProposal(
            card.id,
            { reason },
            crypto.randomUUID(),
          )
    setCards((prev) =>
      prev.map((c) => (c.id === card.id ? result.proposal : c)),
    )
    setDecision(null)
  }

  return (
    <div className="fin-proposal-composer">
      <Field label="Proposal type">
        <select
          value={draft.proposal_type}
          onChange={(e) =>
            onDraftChange({
              ...draft,
              proposal_type: e.target.value as ProposalType,
            })
          }
        >
          <option value="event_classification">Event classification</option>
          <option value="review_policy">Review policy</option>
          <option value="open_question">Open question</option>
          <option value="export_note">Export note</option>
        </select>
      </Field>
      <Field label="Before (JSON)">
        <textarea
          rows={3}
          value={draft.before}
          onChange={(e) => onDraftChange({ ...draft, before: e.target.value })}
        />
      </Field>
      <Field label="After (JSON)">
        <textarea
          rows={3}
          value={draft.after}
          onChange={(e) => onDraftChange({ ...draft, after: e.target.value })}
        />
      </Field>
      <Field label="Rationale">
        <textarea
          rows={2}
          value={draft.rationale}
          onChange={(e) =>
            onDraftChange({ ...draft, rationale: e.target.value })
          }
        />
      </Field>
      <Field label="Affected record count">
        <input
          value={draft.affected_record_count}
          onChange={(e) =>
            onDraftChange({ ...draft, affected_record_count: e.target.value })
          }
        />
      </Field>
      <Field label="Impacted report IDs (comma separated)">
        <input
          value={draft.impacted_report_ids}
          onChange={(e) =>
            onDraftChange({ ...draft, impacted_report_ids: e.target.value })
          }
        />
      </Field>
      {error && <p className="fin-muted-danger">{error}</p>}
      <button
        type="button"
        className="fin-btn fin-btn-primary fin-btn-sm"
        onClick={() => void submit()}
        disabled={saving}
      >
        {saving ? 'Creating…' : 'Create proposal'}
      </button>

      {cards.map((card) => (
        <div key={card.id} className="fin-proposal-card">
          <div className="fin-card-head-row">
            <strong>{card.proposal_type.replace(/_/g, ' ')}</strong>
            <StatusPill
              tone={
                card.status === 'confirmed'
                  ? 'success'
                  : card.status === 'rejected'
                    ? 'danger'
                    : card.status === 'expired'
                      ? 'neutral'
                      : 'warning'
              }
            >
              {card.status}
            </StatusPill>
          </div>
          <p className="finance-muted">{card.rationale}</p>
          <span className="fin-table-sub">
            {card.affected_record_count} record(s) · expires{' '}
            {card.expires_at.slice(0, 16).replace('T', ' ')}
          </span>
          <CitationList citations={card.citations} />
          {card.status === 'pending' && (
            <div className="fin-inspector-actions">
              <button
                type="button"
                className="fin-btn fin-btn-primary fin-btn-sm"
                onClick={() => setDecision({ card, action: 'confirm' })}
              >
                Confirm
              </button>
              <button
                type="button"
                className="fin-btn fin-btn-ghost fin-btn-sm"
                onClick={() => setDecision({ card, action: 'reject' })}
              >
                Reject
              </button>
            </div>
          )}
        </div>
      ))}

      {decision && (
        <ReasonModal
          title={
            decision.action === 'confirm'
              ? 'Confirm proposal'
              : 'Reject proposal'
          }
          confirmLabel={decision.action === 'confirm' ? 'Confirm' : 'Reject'}
          onCancel={() => setDecision(null)}
          onSubmit={decide}
        />
      )}
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="cal-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function FinanceAssistantPanel({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'tools' | 'proposals'>('tools')
  const [draft, setDraft] = useState<ProposalDraft>(emptyDraft())

  return (
    <div className="fin-assistant-panel">
      <div className="fin-assistant-head">
        <span className="finance-section-label">Finance assistant</span>
        <IconButton
          icon={<IconClose />}
          label="Close"
          size="sm"
          onClick={onClose}
        />
      </div>
      <Segmented
        ariaLabel="Assistant mode"
        value={mode}
        options={['tools', 'proposals']}
        labels={{ tools: 'Tools', proposals: 'Proposals' }}
        onChange={(v) => setMode(v as typeof mode)}
      />
      {mode === 'tools' ? (
        <ToolRunner
          onDraft={(next) => {
            setDraft(next)
            setMode('proposals')
          }}
        />
      ) : (
        <ProposalComposer draft={draft} onDraftChange={setDraft} />
      )}
    </div>
  )
}

export function FinanceAssistantLauncher() {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="fin-assistant-launcher"
        aria-label="Open Finance assistant"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconSparkle />
      </button>
      <Popover
        anchorRef={anchorRef}
        open={open}
        onClose={() => setOpen(false)}
        align="end"
        role="dialog"
        ariaLabel="Finance assistant"
      >
        <FinanceAssistantPanel onClose={() => setOpen(false)} />
      </Popover>
    </>
  )
}
