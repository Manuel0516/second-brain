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
  fetchReviewGroups,
  splitReviewGroup,
} from './api'
import { FinanceHeader, type FinanceTabProps } from './Finance'
import { formatMoney } from './format'
import { BarMeter, StatusPill, WarningList, type PillTone } from './primitives'
import type {
  Completeness,
  FinanceAccount,
  FinanceLoadState,
  ReviewGroup,
} from './types'

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

function useReviewGroups() {
  const [state, setState] = useState<FinanceLoadState<ReviewGroup[]>>({
    status: 'loading',
  })
  const [completeness, setCompleteness] = useState<Completeness | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  useEffect(() => {
    let active = true
    void fetchReviewGroups(undefined, 200, 0)
      .then((page) => {
        if (!active) return
        setCompleteness(page.completeness)
        setState(
          page.items.length === 0 && page.empty_state
            ? { status: 'empty', empty_state: page.empty_state }
            : { status: 'ready', data: page.items },
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
  }, [reloadKey])
  return { state, completeness, reload: () => setReloadKey((k) => k + 1) }
}

function ConfirmModal({
  group,
  onClose,
  onConfirmed,
}: {
  group: ReviewGroup
  onClose: () => void
  onConfirmed: () => void
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
        {error && <p className="fin-muted-danger">{error}</p>}
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
}: {
  group: ReviewGroup
  account: FinanceAccount | undefined
  onConfirm: () => void
  onSplit: () => void
  onDefer: () => void
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
          className="fin-btn fin-btn-primary"
          onClick={onConfirm}
          disabled={group.status !== 'pending'}
        >
          ✓ Confirm
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
          className="fin-btn fin-btn-ghost"
          onClick={onDefer}
          disabled={group.status !== 'pending'}
        >
          Defer
        </button>
      </div>

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

export function FinanceReview(props: FinanceTabProps) {
  const { state, completeness, reload } = useReviewGroups()
  const [accounts, setAccounts] = useState<Map<string, FinanceAccount>>(
    new Map(),
  )
  const [filter, setFilter] = useState<FilterKey>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modal, setModal] = useState<'confirm' | 'split' | 'defer' | null>(null)

  useEffect(() => {
    void fetchFinanceAccounts().then((page) =>
      setAccounts(new Map(page.items.map((a) => [a.id, a]))),
    )
  }, [])

  const groups = useMemo(
    () => (state.status === 'ready' ? state.data : []),
    [state],
  )
  const filtered = useMemo(
    () => groups.filter((g) => matchesFilter(g, filter)),
    [groups, filter],
  )
  const selected =
    filtered.find((g) => g.id === selectedId) ?? filtered[0] ?? null

  const counts = useMemo(
    () => ({
      queue: groups.length,
      pending: groups.filter((g) => g.status === 'pending').length,
      needsEvidence: groups.filter((g) => matchesFilter(g, 'needs_evidence'))
        .length,
      ready: groups.filter((g) => matchesFilter(g, 'ready')).length,
    }),
    [groups],
  )

  // J/K/C/S/D keyboard nav scoped to this surface, ignored while typing or a modal is open.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (modal) return
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
  }, [filtered, selected, modal])

  return (
    <>
      <SidebarShell
        as="nav"
        title="Finance"
        className="finance-sidebar"
        ariaLabel="Finance navigation"
      >
        <div className="fin-sidebar-section">
          <span className="finance-section-label">Review filters</span>
          <div className="fin-sidebar-list">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`fin-filter-row${filter === f.key ? ' active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                <span>{f.label}</span>
                <span className="fin-filter-count">
                  {groups.filter((g) => matchesFilter(g, f.key)).length}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="fin-sidebar-section fin-review-totals">
          <div>
            <strong>{counts.queue}</strong>
            <span>Items</span>
          </div>
          <div>
            <strong>{counts.needsEvidence}</strong>
            <span>Needs evidence</span>
          </div>
          <div>
            <strong>{counts.ready}</strong>
            <span>Ready</span>
          </div>
        </div>
        <div className="fin-sidebar-section">
          <div className="fin-tip-card">
            <strong>Quick review tip</strong>
            <p>
              Use J/K to move between items, C to confirm, S to split, D to
              defer.
            </p>
          </div>
        </div>
      </SidebarShell>
      <main className="finance-canvas">
        <div className="finance-content">
          <FinanceHeader
            taxYear={props.taxYear}
            onTaxYearChange={props.onTaxYearChange}
            tab={props.tab}
            onSelectTab={props.onSelectTab}
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
              <div className="fin-stat-row fin-stat-row-4">
                <div className="fin-mini-stat">
                  <span className="finance-section-label">Queue</span>
                  <strong>{counts.queue}</strong>
                  <span className="fin-table-sub">items</span>
                </div>
                <div className="fin-mini-stat">
                  <span className="finance-section-label">Pending</span>
                  <strong>{counts.pending}</strong>
                  <span className="fin-table-sub">
                    {counts.queue > 0
                      ? Math.round((counts.pending / counts.queue) * 100)
                      : 0}
                    % of queue
                  </span>
                </div>
                <div className="fin-mini-stat">
                  <span className="finance-section-label">Needs evidence</span>
                  <strong>{counts.needsEvidence}</strong>
                  <span className="fin-table-sub">
                    {counts.queue > 0
                      ? Math.round((counts.needsEvidence / counts.queue) * 100)
                      : 0}
                    % of queue
                  </span>
                </div>
                <div className="fin-mini-stat">
                  <span className="finance-section-label">
                    Ready to confirm
                  </span>
                  <strong>{counts.ready}</strong>
                  <span className="fin-table-sub">
                    {counts.queue > 0
                      ? Math.round((counts.ready / counts.queue) * 100)
                      : 0}
                    % of queue
                  </span>
                </div>
              </div>

              <div className="fin-review-split">
                <Card className="fin-review-queue">
                  <div className="fin-card-head-row">
                    <span className="finance-section-label">
                      Review queue {filtered.length}
                    </span>
                  </div>
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
                </Card>

                {selected && (
                  <DetailInspector
                    group={selected}
                    account={accounts.get(selected.account_id)}
                    onConfirm={() => setModal('confirm')}
                    onSplit={() => setModal('split')}
                    onDefer={() => setModal('defer')}
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
    </>
  )
}
