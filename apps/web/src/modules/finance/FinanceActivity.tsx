import { useEffect, useMemo, useState } from 'react'
import { Card } from '../../components/Card'
import { Field } from '../../components/Field'
import { Segmented } from '../../components/Segmented'
import {
  createFinanceAccount,
  fetchFinanceAccounts,
  fetchFinanceActivity,
} from './api'
import {
  aggregateByDay,
  aggregateByHour,
  aggregateByMonth,
  formatMoney,
  sumDecimal,
} from './format'
import {
  BarMeter,
  IconChevronRight,
  IconPlus,
  IconWarning,
  JurisdictionList,
  SidebarYearBlock,
  StatCard,
  StatusPill,
  TrendChart,
  WarningList,
  type PillTone,
} from './primitives'
import type {
  Completeness,
  FinanceAccount,
  FinanceAccountCreate,
  FinanceAccountType,
  FinanceActivityItem,
  FinanceLoadState,
  FinanceSummary,
} from './types'

const ACCOUNT_TYPES: FinanceAccountType[] = [
  'bank',
  'broker',
  'exchange',
  'wallet',
  'bot',
  'cash',
]

const SOURCE_MIX_TOKENS = [
  'var(--accent)',
  'var(--text-primary)',
  'var(--text-secondary)',
  'var(--text-tertiary)',
]

function useAccounts() {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  useEffect(() => {
    let active = true
    void fetchFinanceAccounts().then((page) => {
      if (active) setAccounts(page.items)
    })
    return () => {
      active = false
    }
  }, [reloadKey])
  return { accounts, reload: () => setReloadKey((k) => k + 1) }
}

function AddSourceForm({ onDone }: { onDone: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<FinanceAccountCreate>({
    name: '',
    institution: '',
    account_type: 'exchange',
    country_code: 'SE',
    base_currency: 'EUR',
    tax_jurisdiction: null,
    provider: 'manual',
    external_reference: null,
    opened_at: null,
  })

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!form.name.trim() || !form.institution.trim()) {
      setError('Name and institution are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createFinanceAccount(form, crypto.randomUUID())
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add source')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="fin-add-source-form" onSubmit={submit}>
      <Field label="Name">
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Kraken staking"
        />
      </Field>
      <Field label="Institution">
        <input
          value={form.institution}
          onChange={(e) => setForm({ ...form, institution: e.target.value })}
          placeholder="Kraken"
        />
      </Field>
      <Field label="Type">
        <select
          value={form.account_type}
          onChange={(e) =>
            setForm({
              ...form,
              account_type: e.target.value as FinanceAccountType,
            })
          }
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>
      {error && <p className="fin-muted-danger">{error}</p>}
      <div className="fin-add-source-actions">
        <button
          type="button"
          className="fin-btn fin-btn-ghost fin-btn-sm"
          onClick={onDone}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="fin-btn fin-btn-primary fin-btn-sm"
          disabled={saving}
        >
          {saving ? 'Adding…' : 'Add source'}
        </button>
      </div>
    </form>
  )
}

export function ActivitySidebar({
  taxYear,
  jurisdiction,
  onJurisdictionChange,
  summary,
}: {
  taxYear: number
  jurisdiction: string | undefined
  onJurisdictionChange: (code: string | undefined) => void
  summary: FinanceLoadState<FinanceSummary>
}) {
  const { accounts, reload } = useAccounts()
  const [adding, setAdding] = useState(false)
  const ready = summary.status === 'ready' ? summary.data : null

  return (
    <>
      <SidebarYearBlock taxYear={taxYear} />
      <JurisdictionList
        jurisdiction={jurisdiction}
        onChange={onJurisdictionChange}
      />

      <div className="fin-sidebar-section">
        <span className="finance-section-label">Reward sources</span>
        <div className="fin-sidebar-list">
          {accounts.map((account) => (
            <div key={account.id} className="fin-source-row">
              <span>{account.name}</span>
              <StatusPill
                tone={account.status === 'active' ? 'success' : 'neutral'}
              >
                {account.status === 'active' ? 'Active' : 'Closed'}
              </StatusPill>
            </div>
          ))}
        </div>
        {adding ? (
          <AddSourceForm
            onDone={() => {
              setAdding(false)
              reload()
            }}
          />
        ) : (
          <button
            type="button"
            className="fin-btn fin-btn-ghost fin-btn-sm fin-add-source-btn"
            onClick={() => setAdding(true)}
          >
            <IconPlus /> Add source
          </button>
        )}
      </div>

      <div className="fin-sidebar-section">
        <span className="finance-section-label">Grouping</span>
        <div className="fin-grouping-note">
          <p>
            Hourly rewards are grouped into daily summaries. Group by source,
            asset, day and tax treatment.
          </p>
          <span className="fin-sidebar-link">
            View grouping rules
            <IconChevronRight />
          </span>
        </div>
      </div>

      {ready && (
        <div className="fin-sidebar-section">
          <span className="finance-section-label">Warnings</span>
          <div className="fin-sidebar-list">
            {ready.counts.pending_review_groups > 0 && (
              <span className="fin-warning-row">
                <IconWarning />
                <span>
                  <strong>
                    {ready.counts.pending_review_groups} unreviewed groups
                  </strong>
                  <span>Review in Review tab</span>
                </span>
                <IconChevronRight />
              </span>
            )}
            {ready.completeness.warnings.length > 0 && (
              <span className="fin-warning-row">
                <IconWarning />
                <span>
                  <strong>
                    {ready.completeness.warnings.length} data warnings
                  </strong>
                  <span>Check raw events</span>
                </span>
                <IconChevronRight />
              </span>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function useGroupedActivity(taxYear: number) {
  const [state, setState] = useState<FinanceLoadState<FinanceActivityItem[]>>({
    status: 'loading',
  })
  const [total, setTotal] = useState(0)
  const [completeness, setCompleteness] = useState<Completeness | null>(null)
  useEffect(() => {
    let active = true
    void fetchFinanceActivity({
      view: 'grouped',
      from: `${taxYear}-01-01`,
      to: `${taxYear}-12-31`,
      limit: 100,
    })
      .then((page) => {
        if (!active) return
        setTotal(page.page.total)
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
            error instanceof Error ? error.message : 'Activity request failed',
          retryable: true,
        })
      })
    return () => {
      active = false
    }
  }, [taxYear])
  return { state, total, completeness }
}

function SummaryStats({
  items,
  accounts,
}: {
  items: FinanceActivityItem[]
  accounts: FinanceAccount[]
}) {
  const stats = useMemo(() => {
    const groups = items.filter(
      (i): i is Extract<FinanceActivityItem, { representation: 'group' }> =>
        i.representation === 'group',
    )
    const todayIso = new Date().toISOString().slice(0, 10)
    const monthKey = todayIso.slice(0, 7)
    const todayTotal = sumDecimal(
      groups.filter((g) => g.tax_date === todayIso).map((g) => g.report_value),
    )
    const monthTotal = sumDecimal(
      groups
        .filter((g) => g.tax_date.startsWith(monthKey))
        .map((g) => g.report_value),
    )
    const unreviewed = groups.filter(
      (g) => g.review_status === 'pending',
    ).length
    const activeSources = accounts.filter((a) => a.status === 'active').length
    const ytdTotal = sumDecimal(groups.map((g) => g.report_value))
    const firstDay = new Date(`${new Date().getFullYear()}-01-01T00:00:00Z`)
    const daysElapsed = Math.max(
      1,
      Math.ceil((Date.now() - firstDay.getTime()) / 86_400_000),
    )
    return {
      todayTotal,
      monthTotal,
      unreviewed,
      activeSources,
      avgPerDay: (Number(ytdTotal) / daysElapsed).toFixed(2),
    }
  }, [items, accounts])

  return (
    <div className="fin-stat-row">
      <StatCard icon="◷" label="Today" value={formatMoney(stats.todayTotal)} />
      <StatCard
        icon="▤"
        label="This month"
        value={formatMoney(stats.monthTotal)}
      />
      <StatCard
        icon="●"
        label="Active sources"
        value={stats.activeSources}
        caption="Earning now"
        trend={{ tone: 'success', text: 'All systems normal' }}
      />
      <StatCard
        icon="☰"
        label="Unreviewed groups"
        value={stats.unreviewed}
        caption="Requires review"
        trend={
          stats.unreviewed > 0
            ? { tone: 'warning', text: 'In Review tab' }
            : { tone: 'success', text: 'All reviewed' }
        }
      />
      <StatCard
        icon="÷"
        label="Avg / day"
        value={formatMoney(stats.avgPerDay)}
      />
    </div>
  )
}

function PassiveIncomeCard({
  taxYear,
  items,
}: {
  taxYear: number
  items: FinanceActivityItem[]
}) {
  const [granularity, setGranularity] = useState<
    'Hourly' | 'Daily' | 'Monthly'
  >('Daily')
  const [hourly, setHourly] = useState<FinanceActivityItem[]>([])

  useEffect(() => {
    if (granularity !== 'Hourly') return
    let active = true
    void fetchFinanceActivity({
      view: 'raw',
      from: `${taxYear}-01-01`,
      to: `${taxYear}-12-31`,
      limit: 200,
    }).then((page) => {
      if (active) setHourly(page.items)
    })
    return () => {
      active = false
    }
  }, [granularity, taxYear])

  const data = useMemo(() => {
    if (granularity === 'Monthly') return aggregateByMonth(items)
    if (granularity === 'Hourly') {
      const raw = hourly.filter(
        (i): i is Extract<FinanceActivityItem, { representation: 'raw' }> =>
          i.representation === 'raw',
      )
      return aggregateByHour(raw)
    }
    return aggregateByDay(items)
  }, [granularity, items, hourly])

  return (
    <Card className="fin-chart-card">
      <div className="fin-chart-head">
        <span className="finance-section-label">Passive income</span>
        <Segmented
          ariaLabel="Chart granularity"
          value={granularity}
          options={['Hourly', 'Daily', 'Monthly']}
          onChange={(v) => setGranularity(v as typeof granularity)}
        />
      </div>
      <TrendChart data={data} valueFormatter={(v) => `€${v.toFixed(0)}`} />
      <p className="fin-chart-footnote">
        Tiny hourly rewards are grouped automatically for clarity. Switch to
        Hourly to inspect raw events.
      </p>
    </Card>
  )
}

function SourceMixCard({
  items,
  accounts,
}: {
  items: FinanceActivityItem[]
  accounts: Map<string, FinanceAccount>
}) {
  const rows = useMemo(() => {
    const byAccount = new Map<string, (string | null)[]>()
    for (const item of items) {
      if (item.representation !== 'group') continue
      const list = byAccount.get(item.account_id) ?? []
      list.push(item.report_value)
      byAccount.set(item.account_id, list)
    }
    const totals = [...byAccount.entries()].map(
      ([accountId, values]) => [accountId, sumDecimal(values)] as const,
    )
    const sum = Number(sumDecimal(totals.map(([, value]) => value)))
    return totals
      .sort(([, a], [, b]) => Number(b) - Number(a))
      .map(([accountId, value], index) => ({
        name: accounts.get(accountId)?.name ?? 'Unknown source',
        value,
        pct: sum > 0 ? (Number(value) / sum) * 100 : 0,
        color: SOURCE_MIX_TOKENS[Math.min(index, SOURCE_MIX_TOKENS.length - 1)],
      }))
  }, [items, accounts])
  const total = sumDecimal(rows.map((r) => r.value))

  return (
    <Card>
      <span className="finance-section-label">Source mix (year to date)</span>
      {rows.length === 0 ? (
        <p className="finance-muted">No grouped rewards yet.</p>
      ) : (
        <div className="fin-source-mix">
          {rows.map((row) => (
            <div key={row.name} className="fin-source-mix-row">
              <span className="fin-source-mix-name">{row.name}</span>
              <div style={{ color: row.color }}>
                <BarMeter value={row.pct} />
              </div>
              <span className="fin-source-mix-pct">{row.pct.toFixed(1)}%</span>
              <span className="fin-source-mix-value">
                {formatMoney(row.value)}
              </span>
            </div>
          ))}
          <div className="fin-source-mix-row fin-source-mix-total">
            <span className="fin-source-mix-name">Total</span>
            <span />
            <span className="fin-source-mix-pct">100%</span>
            <span className="fin-source-mix-value">{formatMoney(total)}</span>
          </div>
        </div>
      )}
    </Card>
  )
}

function GroupedActivityTable({
  items,
  total,
  accounts,
}: {
  items: FinanceActivityItem[]
  total: number
  accounts: Map<string, FinanceAccount>
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const groups = items.filter(
    (i): i is Extract<FinanceActivityItem, { representation: 'group' }> =>
      i.representation === 'group',
  )

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Card>
      <div className="fin-card-head-row">
        <span className="finance-section-label">Grouped reward activity</span>
      </div>
      <div className="fin-table-wrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th />
              <th>Date</th>
              <th>Group</th>
              <th>Source</th>
              <th>Raw events</th>
              <th>Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const tone: PillTone =
                group.review_status === 'confirmed'
                  ? 'success'
                  : group.review_status === 'deferred'
                    ? 'neutral'
                    : 'warning'
              const statusText =
                group.review_status === 'confirmed'
                  ? 'Matched'
                  : group.review_status === 'deferred'
                    ? 'Deferred'
                    : 'Review'
              const isOpen = expanded.has(group.id)
              return (
                <>
                  <tr key={group.id}>
                    <td>
                      <button
                        type="button"
                        className="fin-expand-btn"
                        aria-expanded={isOpen}
                        aria-label={isOpen ? 'Collapse group' : 'Expand group'}
                        onClick={() => toggle(group.id)}
                        style={{
                          transform: isOpen ? 'rotate(90deg)' : undefined,
                        }}
                      >
                        <IconChevronRight />
                      </button>
                    </td>
                    <td>{group.tax_date}</td>
                    <td>
                      <strong>{group.label}</strong>
                      <span className="fin-table-sub">
                        {group.event_type.replace(/_/g, ' ')} grouped
                      </span>
                    </td>
                    <td>{accounts.get(group.account_id)?.name ?? 'Unknown'}</td>
                    <td>{group.member_count}</td>
                    <td className="fin-table-amount">
                      {formatMoney(
                        group.report_value,
                        group.report_currency ?? 'EUR',
                      )}
                    </td>
                    <td>
                      <StatusPill tone={tone}>{statusText}</StatusPill>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr
                      key={`${group.id}-detail`}
                      className="fin-table-detail-row"
                    >
                      <td />
                      <td colSpan={6}>
                        <span className="fin-table-sub">
                          {group.member_revision_ids.length} member revision(s):{' '}
                          {group.member_revision_ids.slice(0, 6).join(', ')}
                          {group.member_revision_ids.length > 6 ? '…' : ''}
                        </span>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
      <span className="fin-table-footer">
        Showing {groups.length} of {total} groups
      </span>
    </Card>
  )
}

const GROUPING_RULES = [
  { title: 'Group by source', desc: 'Rewards are grouped within each source.' },
  { title: 'Group by asset', desc: 'Each asset is grouped separately.' },
  { title: 'Group by day', desc: 'Events are grouped into the same UTC day.' },
  {
    title: 'Group by tax treatment',
    desc: 'Only events with the same tax treatment are grouped together.',
  },
]

function GroupingLogicCard() {
  return (
    <Card>
      <span className="finance-section-label">Grouping logic</span>
      <div className="fin-rule-list">
        {GROUPING_RULES.map((rule) => (
          <div key={rule.title} className="fin-rule-row">
            <span className="fin-rule-icon" aria-hidden="true">
              ▦
            </span>
            <div>
              <strong>{rule.title}</strong>
              <p>{rule.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="fin-btn fin-btn-ghost fin-btn-sm">
        View full rules
      </button>
    </Card>
  )
}

function SourcesTab({
  accounts,
  onReload,
}: {
  accounts: FinanceAccount[]
  onReload: () => void
}) {
  const [adding, setAdding] = useState(false)
  return (
    <Card>
      <div className="fin-card-head-row">
        <span className="finance-section-label">Sources</span>
        <button
          type="button"
          className="fin-btn fin-btn-ghost fin-btn-sm"
          onClick={() => setAdding((v) => !v)}
        >
          <IconPlus /> Add source
        </button>
      </div>
      {adding && (
        <AddSourceForm
          onDone={() => {
            setAdding(false)
            onReload()
          }}
        />
      )}
      <div className="fin-table-wrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Institution</th>
              <th>Type</th>
              <th>Last import</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <td>
                  <strong>{account.name}</strong>
                </td>
                <td>{account.institution}</td>
                <td style={{ textTransform: 'capitalize' }}>
                  {account.account_type}
                </td>
                <td>
                  {account.last_imported_at
                    ? account.last_imported_at.slice(0, 10)
                    : 'Never'}
                </td>
                <td>
                  <StatusPill
                    tone={account.status === 'active' ? 'success' : 'neutral'}
                  >
                    {account.status === 'active' ? 'Active' : 'Closed'}
                  </StatusPill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {accounts.length === 0 && (
          <p className="finance-muted">No sources added yet.</p>
        )}
      </div>
    </Card>
  )
}

function RawEventsTab({ taxYear }: { taxYear: number }) {
  const [state, setState] = useState<FinanceLoadState<FinanceActivityItem[]>>({
    status: 'loading',
  })
  useEffect(() => {
    let active = true
    void fetchFinanceActivity({
      view: 'raw',
      from: `${taxYear}-01-01`,
      to: `${taxYear}-12-31`,
      limit: 100,
    })
      .then((page) => {
        if (!active) return
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
            error instanceof Error ? error.message : 'Activity request failed',
          retryable: true,
        })
      })
    return () => {
      active = false
    }
  }, [taxYear])

  return (
    <Card>
      <span className="finance-section-label">Raw events</span>
      {state.status === 'loading' ? (
        <div className="skeleton finance-skeleton" />
      ) : state.status === 'error' ? (
        <p className="finance-muted">{state.message}</p>
      ) : state.status === 'empty' ? (
        <p className="finance-muted">{state.empty_state.message}</p>
      ) : (
        <div className="fin-table-wrap">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((item) =>
                item.representation === 'raw' ? (
                  <tr key={item.id}>
                    <td>{item.effective_at.slice(0, 16).replace('T', ' ')}</td>
                    <td style={{ textTransform: 'capitalize' }}>
                      {item.event_type.replace(/_/g, ' ')}
                    </td>
                    <td className="fin-table-amount">
                      {formatMoney(
                        item.report_value,
                        item.report_currency ?? 'EUR',
                      )}
                    </td>
                    <td>
                      <StatusPill
                        tone={
                          item.status === 'confirmed' ? 'success' : 'warning'
                        }
                      >
                        {item.status}
                      </StatusPill>
                    </td>
                  </tr>
                ) : null,
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

export function ActivityMain({
  taxYear,
  onBack,
}: {
  taxYear: number
  onBack: () => void
}) {
  const [subTab, setSubTab] = useState<'summary' | 'sources' | 'raw'>('summary')
  const { state, total, completeness } = useGroupedActivity(taxYear)
  const { accounts, reload } = useAccounts()
  const accountsMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  )
  const pageWarnings = completeness
    ? [...completeness.blockers, ...completeness.warnings]
    : []

  return (
    <>
      <button type="button" className="fin-back-crumb" onClick={onBack}>
        ‹ Back to overview
      </button>
      <Segmented
        ariaLabel="Activity view"
        value={subTab}
        options={['summary', 'sources', 'raw']}
        labels={{ summary: 'Summary', sources: 'Sources', raw: 'Raw events' }}
        onChange={(v) => setSubTab(v as typeof subTab)}
      />

      {pageWarnings.length > 0 && (
        <Card>
          <span className="finance-section-label">Data warnings</span>
          <WarningList warnings={pageWarnings} />
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
          <span className="finance-section-label">Start here</span>
          <h2>{state.empty_state.title}</h2>
          <p className="finance-muted">{state.empty_state.message}</p>
        </Card>
      ) : subTab === 'summary' ? (
        <>
          <SummaryStats items={state.data} accounts={accounts} />
          <div className="fin-chart-row fin-chart-row-2">
            <PassiveIncomeCard taxYear={taxYear} items={state.data} />
            <SourceMixCard items={state.data} accounts={accountsMap} />
          </div>
          <div className="fin-chart-row fin-chart-row-2">
            <GroupedActivityTable
              items={state.data}
              total={total}
              accounts={accountsMap}
            />
            <GroupingLogicCard />
          </div>
        </>
      ) : subTab === 'sources' ? (
        <SourcesTab accounts={accounts} onReload={reload} />
      ) : (
        <RawEventsTab taxYear={taxYear} />
      )}
    </>
  )
}
