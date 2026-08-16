import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Card } from '../../components/Card'
import { SidebarShell } from '../../components/SidebarShell'
import { ToggleRow } from '../../components/ToggleRow'
import { useDialogFocus } from '../../components/useDialogFocus'
import {
  confirmReviewGroup,
  deferReviewGroup,
  fetchFinanceAccounts,
  fetchFinanceActivity,
  fetchFinanceReviewQueueCounts,
  fetchReviewGroups,
  splitReviewGroup,
} from './api'
import { AddJurisdictionDialog } from './AddJurisdictionDialog'
import { AddRecordDialog, type AddRecordEdit } from './AddRecordDialog'
import { FinanceHeader, type FinanceTabProps } from './Finance'
import {
  FinanceSidebarClose,
  FinanceSidebarContent,
  useFinanceSummary,
} from './FinanceSidebar'
import { formatMoney } from './format'
import {
  BarMeter,
  IconChevronLeft,
  IconChevronRight,
  StatusPill,
  WarningList,
  type PillTone,
} from './primitives'
import type {
  Completeness,
  FinanceAccount,
  FinanceEventType,
  FinanceLoadState,
  PageMeta,
  ReviewGroup,
  ReviewQueueCounts,
  ReviewStatus,
} from './types'

const PAGE_SIZE = 10

const EVENT_TYPE_FILTERS: Array<{
  value: FinanceEventType | ''
  label: string
}> = [
  { value: '', label: 'All types' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'staking_reward', label: 'Staking reward' },
  { value: 'interest', label: 'Interest' },
  { value: 'dividend', label: 'Dividend' },
  { value: 'trade', label: 'Trade' },
]

type FilterKey =
  | 'all'
  | 'pending'
  | 'needs_evidence'
  | 'ready'
  | 'confirmed'
  | 'deferred'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All items' },
  { key: 'pending', label: 'Pending' },
  { key: 'needs_evidence', label: 'Needs evidence' },
  { key: 'ready', label: 'Ready to confirm' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'deferred', label: 'Deferred' },
]

function coverage(group: ReviewGroup): number {
  const n = Number(group.evidence_coverage)
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0
}

function matchesFilter(group: ReviewGroup, filter: FilterKey): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'pending':
      return group.status === 'pending'
    case 'needs_evidence':
      return group.status === 'pending' && coverage(group) < 0.5
    case 'ready':
      return group.status === 'pending' && coverage(group) >= 0.8
    case 'confirmed':
      return group.status === 'confirmed'
    case 'deferred':
      return group.status === 'deferred'
  }
}

function statusTone(status: ReviewGroup['status']): PillTone {
  if (status === 'confirmed') return 'success'
  if (status === 'deferred') return 'neutral'
  if (status === 'split') return 'info'
  return 'warning'
}

function statusLabel(group: ReviewGroup): string {
  if (group.status === 'confirmed') return 'Ready'
  if (group.status === 'deferred') return 'Deferred'
  if (group.status === 'split') return 'Split'
  return coverage(group) >= 0.8 ? 'Suggested' : 'Needs match'
}

function useReviewGroups(
  page: number,
  status: ReviewStatus | undefined,
  eventType: FinanceEventType | undefined,
  refreshKey: number,
) {
  const [state, setState] = useState<FinanceLoadState<ReviewGroup[]>>({
    status: 'loading',
  })
  const [completeness, setCompleteness] = useState<Completeness | null>(null)
  const [pageMeta, setPageMeta] = useState<PageMeta | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  useEffect(() => {
    let active = true
    void fetchReviewGroups({
      status,
      event_type: eventType,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
      .then((result) => {
        if (!active) return
        setCompleteness(result.completeness)
        setPageMeta(result.page)
        setState(
          result.items.length === 0 && result.empty_state
            ? { status: 'empty', empty_state: result.empty_state }
            : { status: 'ready', data: result.items },
        )
      })
      .catch((error: unknown) => {
        if (!active) return
        setState({
          status: 'error',
          message:
            error instanceof Error ? error.message : 'Review request failed',
          retryable: true,
        })
      })
    return () => {
      active = false
    }
  }, [page, status, eventType, reloadKey, refreshKey])
  return {
    state,
    completeness,
    pageMeta,
    reload: () => setReloadKey((k) => k + 1),
  }
}

function ConfirmModal({
  group,
  onClose,
  onConfirmed,
  onConflict,
}: {
  group: ReviewGroup
  onClose: () => void
  onConfirmed: () => void
  onConflict: () => void
}) {
  const [reusable, setReusable] = useState(false)
  const [reason, setReason] = useState('Reviewed and confirmed.')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  useDialogFocus({
    open: true,
    dialogRef,
    initialFocusRef: confirmRef,
    onEscape: onClose,
  })

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      await confirmReviewGroup(
        group.id,
        {
          expected_member_revision_ids: group.member_revision_ids,
          create_reusable_policy: reusable,
          reason,
        },
        crypto.randomUUID(),
      )
      onConfirmed()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm group')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      className="scope-prompt"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="scope-card fin-confirm-modal" ref={dialogRef}>
        <h3 id={titleId}>Confirm {group.label}</h3>
        <p className="finance-muted">
          {group.member_count} raw record(s) affected · materiality{' '}
          {group.materiality} · {group.confidence_explanation}
        </p>
        <ToggleRow
          label="Apply this decision to future compatible events"
          checked={reusable}
          onChange={setReusable}
        />
        <label className="cal-field">
          <span>Reason</span>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <p className="finance-muted">
          Confirming creates a new event revision for each member and balanced
          postings. This can be superseded later, not silently overwritten.
        </p>
        {error && (
          <div className="fin-conflict-row">
            <p className="fin-muted-danger">{error}</p>
            {/* Optimistic-lock conflicts (stale member revisions) resolve by reloading the queue. */}
            <button
              type="button"
              className="fin-btn fin-btn-ghost fin-btn-sm"
              onClick={onConflict}
            >
              Reload queue
            </button>
          </div>
        )}
        <div className="cal-card-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            ref={confirmRef}
            onClick={submit}
            disabled={saving}
          >
            {saving ? 'Confirming…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function DeferModal({
  group,
  onClose,
  onDeferred,
}: {
  group: ReviewGroup
  onClose: () => void
  onDeferred: () => void
}) {
  const [reason, setReason] = useState('')
  const [revisitOn, setRevisitOn] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocus({ open: true, dialogRef, onEscape: onClose })

  async function submit() {
    if (!reason.trim()) {
      setError('A reason is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await deferReviewGroup(
        group.id,
        { reason, revisit_on: revisitOn || null },
        crypto.randomUUID(),
      )
      onDeferred()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not defer group')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      className="scope-prompt"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="scope-card fin-confirm-modal" ref={dialogRef}>
        <h3 id={titleId}>Defer {group.label}</h3>
        <label className="cal-field">
          <span>Reason</span>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <label className="cal-field">
          <span>Revisit on (optional)</span>
          <input
            type="date"
            value={revisitOn}
            onChange={(e) => setRevisitOn(e.target.value)}
          />
        </label>
        {error && <p className="fin-muted-danger">{error}</p>}
        <div className="cal-card-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={submit}
            disabled={saving}
          >
            {saving ? 'Deferring…' : 'Defer'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function SplitModal({
  group,
  onClose,
  onSplit,
}: {
  group: ReviewGroup
  onClose: () => void
  onSplit: () => void
}) {
  const [reason, setReason] = useState(
    'Split into individual events for separate review.',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocus({ open: true, dialogRef, onEscape: onClose })

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      const partitions = group.member_revision_ids.map((id, i) => ({
        label: `${group.label} — part ${i + 1}`,
        member_revision_ids: [id],
      }))
      await splitReviewGroup(
        group.id,
        { partitions, reason },
        crypto.randomUUID(),
      )
      onSplit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not split group')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      className="scope-prompt"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="scope-card fin-confirm-modal" ref={dialogRef}>
        <h3 id={titleId}>Split {group.label}</h3>
        <p className="finance-muted">
          Splits all {group.member_count} member revisions into one partition
          each, preserving totals ({group.native_quantity}).
        </p>
        <label className="cal-field">
          <span>Reason</span>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {error && <p className="fin-muted-danger">{error}</p>}
        <div className="cal-card-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={submit}
            disabled={saving}
          >
            {saving ? 'Splitting…' : 'Split into individual events'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function DetailInspector({
  group,
  account,
  onConfirm,
  onSplit,
  onDefer,
  onEdit,
  editError,
}: {
  group: ReviewGroup
  account: FinanceAccount | undefined
  onConfirm: () => void
  onSplit: () => void
  onDefer: () => void
  onEdit: () => void
  editError: string | null
}) {
  const cov = coverage(group) * 100
  return (
    <Card className="fin-inspector">
      <div className="fin-inspector-head">
        <div>
          <strong>{group.label}</strong>
          <span className="fin-table-sub">
            {group.member_count} events grouped on {group.tax_date}
          </span>
        </div>
        <StatusPill tone={statusTone(group.status)}>
          {statusLabel(group)}
        </StatusPill>
      </div>

      <div className="fin-inspector-grid">
        <div>
          <span className="finance-section-label">Source</span>
          <strong>{account?.name ?? 'Unknown'}</strong>
        </div>
        <div>
          <span className="finance-section-label">Date</span>
          <strong>{group.tax_date}</strong>
        </div>
        <div>
          <span className="finance-section-label">Amount</span>
          <strong>
            {formatMoney(group.report_value, group.report_currency ?? 'EUR')}
          </strong>
        </div>
        <div>
          <span className="finance-section-label">Quantity</span>
          <strong>{group.native_quantity}</strong>
        </div>
        <div>
          <span className="finance-section-label">Suggested category</span>
          <strong>{group.candidate_treatment ?? '—'}</strong>
        </div>
        <div>
          <span className="finance-section-label">Linked account</span>
          <strong>
            {account?.tax_jurisdiction ?? account?.country_code ?? '—'}
          </strong>
        </div>
      </div>

      <div className="fin-inspector-section">
        <span className="finance-section-label">AI summary</span>
        <p className="finance-muted">{group.confidence_explanation}</p>
      </div>

      {(group.completeness.blockers.length > 0 ||
        group.completeness.warnings.length > 0) && (
        <div className="fin-inspector-section">
          <span className="finance-section-label">Warnings</span>
          <WarningList
            warnings={[
              ...group.completeness.blockers,
              ...group.completeness.warnings,
            ]}
          />
        </div>
      )}

      <div className="fin-inspector-section">
        <span className="finance-section-label">Evidence coverage</span>
        <strong>{cov.toFixed(0)}%</strong>
        <div style={{ marginTop: 6 }}>
          <BarMeter
            value={cov}
            tone={cov >= 80 ? 'success' : cov >= 50 ? 'warning' : 'danger'}
          />
        </div>
      </div>

      <div className="fin-inspector-actions">
        <button
          type="button"
          className="fin-btn fin-btn-ghost"
          onClick={onEdit}
          disabled={group.status !== 'pending' || group.member_count !== 1}
          title={
            group.member_count !== 1
              ? 'Split the group first to edit individual events'
              : undefined
          }
        >
          Edit
        </button>
        <button
          type="button"
          className="fin-btn fin-btn-ghost"
          onClick={onSplit}
          disabled={group.status !== 'pending'}
        >
          Split group
        </button>
        <button
          type="button"
          className="fin-btn fin-btn-primary"
          onClick={onConfirm}
          disabled={group.status !== 'pending'}
        >
          ✓ Confirm
        </button>
        <button
          type="button"
          className="fin-btn fin-btn-ghost"
          onClick={onDefer}
          disabled={group.status !== 'pending'}
        >
          Defer
        </button>
      </div>
      {editError && <p className="fin-muted-danger">{editError}</p>}

      <div className="fin-inspector-audit">
        <span className="finance-section-label">Audit trail</span>
        <div className="fin-audit-strip">
          <div>
            <span className="fin-audit-dot" />
            <span>First event</span>
            <span className="fin-table-sub">
              {group.first_effective_at.slice(0, 16).replace('T', ' ')}
            </span>
          </div>
          <div>
            <span className="fin-audit-dot" />
            <span>Grouping rule</span>
            <span className="fin-table-sub">{group.grouping_rule_version}</span>
          </div>
          <div>
            <span className="fin-audit-dot" />
            <span>Current status</span>
            <span className="fin-table-sub">{group.status}</span>
          </div>
        </div>
      </div>
    </Card>
  )
}

/** Server status param for a sidebar filter; derived filters refine status=pending client-side. */
function serverStatus(filter: FilterKey): ReviewStatus | undefined {
  if (filter === 'pending' || filter === 'needs_evidence' || filter === 'ready')
    return 'pending'
  if (filter === 'confirmed' || filter === 'deferred') return filter
  return undefined
}

export function FinanceReview(props: FinanceTabProps) {
  const summary = useFinanceSummary(
    props.taxYear,
    props.jurisdiction,
    props.refreshKey,
  )
  const [addJurisdictionOpen, setAddJurisdictionOpen] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [eventType, setEventType] = useState<FinanceEventType | ''>('')
  const [page, setPage] = useState(0)
  const { state, completeness, pageMeta, reload } = useReviewGroups(
    page,
    serverStatus(filter),
    eventType || undefined,
    props.refreshKey,
  )
  const [accounts, setAccounts] = useState<Map<string, FinanceAccount>>(
    new Map(),
  )
  const [queueCounts, setQueueCounts] = useState<ReviewQueueCounts | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modal, setModal] = useState<'confirm' | 'split' | 'defer' | null>(null)
  const [editTarget, setEditTarget] = useState<AddRecordEdit | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  /** Resolve the group's single raw member into the edit form (append-revision PATCH). */
  async function openEdit(group: ReviewGroup) {
    setEditError(null)
    try {
      const page = await fetchFinanceActivity({
        view: 'raw',
        group_id: group.id,
        limit: 10,
      })
      const raw = page.items.find((item) => item.representation === 'raw')
      if (!raw || raw.representation !== 'raw') {
        throw new Error('Could not load the underlying event for this group.')
      }
      setEditTarget({
        eventId: raw.event_id,
        expectedRevisionId: raw.id,
        initial: {
          occurred_at: raw.effective_at,
          event_type: raw.event_type,
          amount: raw.report_value ?? raw.native_quantity,
          currency: raw.report_currency ?? 'EUR',
          source_account_id: raw.source_account_id,
          description: group.label,
          jurisdiction: null,
        },
      })
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : 'Could not open the editor',
      )
    }
  }

  useEffect(() => {
    void fetchFinanceAccounts().then((page) =>
      setAccounts(new Map(page.items.map((a) => [a.id, a]))),
    )
  }, [])

  useEffect(() => {
    void fetchFinanceReviewQueueCounts(props.taxYear, props.jurisdiction)
      .then(setQueueCounts)
      .catch(() => setQueueCounts(null))
  }, [props.taxYear, props.jurisdiction, props.refreshKey])

  // Filters and page depend on each other — changing a filter restarts at page 0.
  function selectFilter(next: FilterKey) {
    setFilter(next)
    setPage(0)
  }

  const groups = useMemo(
    () => (state.status === 'ready' ? state.data : []),
    [state],
  )
  // ponytail: needs_evidence/ready refine the fetched pending page client-side —
  // becomes a server param if these buckets ever need exact pagination.
  const filtered = useMemo(
    () => groups.filter((g) => matchesFilter(g, filter)),
    [groups, filter],
  )
  const selected =
    filtered.find((g) => g.id === selectedId) ?? filtered[0] ?? null

  const totalPages = pageMeta
    ? Math.max(1, Math.ceil(pageMeta.total / PAGE_SIZE))
    : 1

  // J/K/C/S/D keyboard nav scoped to this surface, ignored while typing or a modal is open.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (modal || editTarget) return
      const index = filtered.findIndex((g) => g.id === selected?.id)
      if (event.key === 'j' || event.key === 'J') {
        event.preventDefault()
        const next = filtered[Math.min(filtered.length - 1, index + 1)]
        if (next) setSelectedId(next.id)
      } else if (event.key === 'k' || event.key === 'K') {
        event.preventDefault()
        const prev = filtered[Math.max(0, index - 1)]
        if (prev) setSelectedId(prev.id)
      } else if (
        (event.key === 'c' || event.key === 'C') &&
        selected?.status === 'pending'
      ) {
        setModal('confirm')
      } else if (
        (event.key === 's' || event.key === 'S') &&
        selected?.status === 'pending'
      ) {
        setModal('split')
      } else if (
        (event.key === 'd' || event.key === 'D') &&
        selected?.status === 'pending'
      ) {
        setModal('defer')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [filtered, selected, modal, editTarget])

  return (
    <>
      <SidebarShell
        as="nav"
        title="Finance"
        className="finance-sidebar"
        ariaLabel="Finance navigation"
        open={props.sidebarOpen}
        actions={
          <FinanceSidebarClose
            onClose={() => props.onSidebarOpenChange(false)}
          />
        }
      >
        <FinanceSidebarContent
          taxYear={props.taxYear}
          onTaxYearChange={props.onTaxYearChange}
          summary={summary}
          jurisdiction={props.jurisdiction}
          onJurisdictionChange={props.onJurisdictionChange}
          onAddJurisdiction={() => setAddJurisdictionOpen(true)}
          onOpenReview={() => props.onSelectTab('review')}
        />
      </SidebarShell>
      <main className="finance-canvas">
        <div className="finance-content">
          <FinanceHeader
            taxYear={props.taxYear}
            onTaxYearChange={props.onTaxYearChange}
            tab={props.tab}
            onSelectTab={props.onSelectTab}
            onRefresh={props.onRefresh}
            sidebarOpen={props.sidebarOpen}
            onSidebarOpenChange={props.onSidebarOpenChange}
          />

          {completeness &&
            [...completeness.blockers, ...completeness.warnings].length > 0 && (
              <Card>
                <span className="finance-section-label">Data warnings</span>
                <WarningList
                  warnings={[
                    ...completeness.blockers,
                    ...completeness.warnings,
                  ]}
                />
              </Card>
            )}

          {state.status === 'loading' ? (
            <Card>
              <div className="skeleton finance-skeleton" />
            </Card>
          ) : state.status === 'error' ? (
            <Card>
              <p className="finance-muted">{state.message}</p>
            </Card>
          ) : state.status === 'empty' ? (
            <Card>
              <span className="finance-section-label">Nothing to review</span>
              <h2>{state.empty_state.title}</h2>
              <p className="finance-muted">{state.empty_state.message}</p>
            </Card>
          ) : (
            <>
              {queueCounts && (
                <div className="fin-stat-row fin-stat-row-4">
                  <div className="fin-mini-stat">
                    <span className="finance-section-label">
                      Needs grouping
                    </span>
                    <strong>{queueCounts.needs_grouping}</strong>
                    <span className="fin-table-sub">to classify</span>
                  </div>
                  <div className="fin-mini-stat">
                    <span className="finance-section-label">
                      Needs evidence
                    </span>
                    <strong>{queueCounts.needs_evidence}</strong>
                    <span className="fin-table-sub">missing documents</span>
                  </div>
                  <div className="fin-mini-stat">
                    <span className="finance-section-label">Ready</span>
                    <strong>{queueCounts.ready}</strong>
                    <span className="fin-table-sub">high confidence</span>
                  </div>
                  <div className="fin-mini-stat">
                    <span className="finance-section-label">Problematic</span>
                    <strong>{queueCounts.problematic}</strong>
                    <span className="fin-table-sub">need attention</span>
                  </div>
                </div>
              )}

              <div className="fin-review-split">
                <Card className="fin-review-queue">
                  <div className="fin-card-head-row">
                    <span className="finance-section-label">
                      Review queue{' '}
                      <span className="fin-count-badge">
                        {pageMeta?.total ?? filtered.length}
                      </span>
                    </span>
                    <div className="fin-queue-filters">
                      <label className="fin-type-filter">
                        <span className="sr-only">Filter by status</span>
                        <select
                          value={filter}
                          onChange={(e) =>
                            selectFilter(e.target.value as FilterKey)
                          }
                        >
                          {FILTERS.map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}
                              {f.key === 'all'
                                ? queueCounts
                                  ? ` (${queueCounts.total})`
                                  : ''
                                : f.key === 'needs_evidence'
                                  ? queueCounts
                                    ? ` (${queueCounts.needs_evidence})`
                                    : ''
                                  : f.key === 'ready'
                                    ? queueCounts
                                      ? ` (${queueCounts.ready})`
                                      : ''
                                    : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="fin-type-filter">
                        <span className="sr-only">Filter by type</span>
                        <select
                          value={eventType}
                          onChange={(e) => {
                            setEventType(
                              e.target.value as FinanceEventType | '',
                            )
                            setPage(0)
                          }}
                        >
                          {EVENT_TYPE_FILTERS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                  <p className="fin-queue-tip">
                    J/K to move · C to confirm · S to split · D to defer
                  </p>
                  <div className="fin-table-wrap">
                    <table className="fin-table fin-table-selectable">
                      <thead>
                        <tr>
                          <th />
                          <th>Item</th>
                          <th>Source</th>
                          <th>Amount</th>
                          <th>Events</th>
                          <th>Coverage</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((group) => (
                          <tr
                            key={group.id}
                            className={
                              selected?.id === group.id ? 'active' : ''
                            }
                            onClick={() => setSelectedId(group.id)}
                          >
                            <td>
                              <input
                                type="checkbox"
                                checked={selected?.id === group.id}
                                onChange={() => setSelectedId(group.id)}
                                aria-label={`Select ${group.label}`}
                              />
                            </td>
                            <td>
                              <strong>{group.label}</strong>
                              <span className="fin-table-sub">
                                {group.event_type.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td>
                              {accounts.get(group.account_id)?.name ??
                                'Unknown'}
                            </td>
                            <td className="fin-table-amount">
                              {formatMoney(
                                group.report_value,
                                group.report_currency ?? 'EUR',
                              )}
                            </td>
                            <td>{group.member_count}</td>
                            <td style={{ minWidth: 90 }}>
                              <BarMeter value={coverage(group) * 100} />
                            </td>
                            <td>
                              <StatusPill tone={statusTone(group.status)}>
                                {statusLabel(group)}
                              </StatusPill>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filtered.length === 0 && (
                      <p className="finance-muted">
                        No items match this filter.
                      </p>
                    )}
                  </div>
                  {pageMeta && pageMeta.total > PAGE_SIZE && (
                    <div className="fin-pager">
                      <button
                        type="button"
                        className="fin-btn fin-btn-ghost fin-btn-sm"
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={page === 0}
                        aria-label="Previous page"
                      >
                        <IconChevronLeft /> Prev
                      </button>
                      <span className="fin-pager-status">
                        Page {page + 1} of {totalPages}
                      </span>
                      <button
                        type="button"
                        className="fin-btn fin-btn-ghost fin-btn-sm"
                        onClick={() => setPage((p) => p + 1)}
                        disabled={!pageMeta.has_more}
                        aria-label="Next page"
                      >
                        Next <IconChevronRight />
                      </button>
                    </div>
                  )}
                </Card>

                {selected && (
                  <DetailInspector
                    group={selected}
                    account={accounts.get(selected.account_id)}
                    onConfirm={() => setModal('confirm')}
                    onSplit={() => setModal('split')}
                    onDefer={() => setModal('defer')}
                    onEdit={() => void openEdit(selected)}
                    editError={editError}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {selected && modal === 'confirm' && (
        <ConfirmModal
          group={selected}
          onClose={() => setModal(null)}
          onConfirmed={() => {
            setModal(null)
            reload()
          }}
          onConflict={() => {
            setModal(null)
            reload()
          }}
        />
      )}
      {selected && modal === 'split' && (
        <SplitModal
          group={selected}
          onClose={() => setModal(null)}
          onSplit={() => {
            setModal(null)
            reload()
          }}
        />
      )}
      {selected && modal === 'defer' && (
        <DeferModal
          group={selected}
          onClose={() => setModal(null)}
          onDeferred={() => {
            setModal(null)
            reload()
          }}
        />
      )}
      {editTarget && (
        <AddRecordDialog
          taxYear={props.taxYear}
          edit={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={reload}
        />
      )}
      {addJurisdictionOpen && (
        <AddJurisdictionDialog
          taxYear={props.taxYear}
          onClose={() => setAddJurisdictionOpen(false)}
          onSaved={props.onRefresh}
        />
      )}
    </>
  )
}
