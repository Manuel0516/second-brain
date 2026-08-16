import { useEffect, useMemo, useState } from 'react'
import { Card } from '../../components/Card'
import { Dropdown } from '../../components/Dropdown'
import { SidebarShell } from '../../components/SidebarShell'
import {
  fetchFinanceAccounts,
  fetchFinanceActivity,
  fetchFinanceTimeseries,
} from './api'
import { ActivityMain, ActivitySidebar } from './FinanceActivity'
import { AddJurisdictionDialog } from './AddJurisdictionDialog'
import { FinanceHeader, type FinanceTabProps } from './Finance'
import {
  FinanceSidebarClose,
  FinanceSidebarContent,
  useFinanceSummary,
} from './FinanceSidebar'
import {
  formatMoney,
  mergeSeries,
  readinessPercent,
  seriesToTrend,
  trendDelta,
  yoyDelta,
} from './format'
import {
  StatCard,
  StatusPill,
  TrendChart,
  WarningList,
  type PillTone,
  type TrendPoint,
} from './primitives'
import type {
  FinanceAccount,
  FinanceActivityItem,
  FinanceLoadState,
  FinanceSummary,
  FinanceTimeseriesSeries,
} from './types'

interface OverviewCharts {
  income: FinanceTimeseriesSeries[]
  expense: FinanceTimeseriesSeries[]
  rewards: FinanceTimeseriesSeries[]
  netWorth: FinanceTimeseriesSeries[]
  readiness: FinanceTimeseriesSeries[]
}

function useOverviewCharts(taxYear: number, refreshKey: number) {
  const [charts, setCharts] = useState<OverviewCharts | null>(null)
  useEffect(() => {
    let active = true
    void Promise.all([
      fetchFinanceTimeseries({
        tax_year: taxYear,
        metric: 'income',
        granularity: 'day',
        group_by: 'none',
      }),
      fetchFinanceTimeseries({
        tax_year: taxYear,
        metric: 'expense',
        granularity: 'day',
        group_by: 'none',
      }),
      fetchFinanceTimeseries({
        tax_year: taxYear,
        metric: 'rewards',
        granularity: 'day',
        group_by: 'source',
      }),
      fetchFinanceTimeseries({
        tax_year: taxYear,
        metric: 'net_worth',
        granularity: 'day',
        group_by: 'account',
      }),
      fetchFinanceTimeseries({
        tax_year: taxYear,
        metric: 'readiness',
        granularity: 'day',
        group_by: 'jurisdiction',
      }),
    ])
      .then(([income, expense, rewards, netWorth, readiness]) => {
        if (!active) return
        setCharts({
          income: income.series,
          expense: expense.series,
          rewards: rewards.series,
          netWorth: netWorth.series,
          readiness: readiness.series,
        })
      })
      .catch(() => {
        // ponytail: charts degrade to their empty states on failure; the summary
        // cards still render, so a timeseries hiccup never blanks the page.
        if (active) setCharts(null)
      })
    return () => {
      active = false
    }
  }, [taxYear, refreshKey])
  return charts
}

/** Chart card with an optional series filter dropdown ("All accounts ▾" …). */
function SeriesChartCard({
  label,
  headline,
  series,
  allLabel,
  merge,
  valueFormatter,
  sinceLabel,
  footnote,
  action,
}: {
  label: string
  headline: string
  series: FinanceTimeseriesSeries[]
  allLabel: string
  merge: 'sum' | 'avg'
  valueFormatter: (value: number) => string
  sinceLabel: string
  footnote?: string
  action?: React.ReactNode
}) {
  const [selected, setSelected] = useState('all')
  const options = useMemo(
    () => [
      { value: 'all', label: allLabel },
      ...series
        .filter((s) => s.key !== 'all')
        .map((s) => ({ value: s.key, label: s.label })),
    ],
    [series, allLabel],
  )
  const points: TrendPoint[] = useMemo(() => {
    if (selected !== 'all') {
      return seriesToTrend(series.find((s) => s.key === selected))
    }
    const all = series.find((s) => s.key === 'all')
    return all ? seriesToTrend(all) : mergeSeries(series, merge)
  }, [series, selected, merge])
  const delta = trendDelta(points, sinceLabel)

  return (
    <Card className="fin-chart-card">
      <div className="fin-chart-head">
        <div>
          <span className="finance-section-label">{label}</span>
          <strong className="fin-chart-value">{headline}</strong>
          {delta && (
            <span className={`fin-kpi-delta fin-kpi-delta--${delta.tone}`}>
              {delta.text}
            </span>
          )}
        </div>
        <div className="fin-chart-actions">
          {action}
          {options.length > 1 && (
            <Dropdown
              ariaLabel={`${label} filter`}
              value={selected}
              onChange={setSelected}
              options={options}
            />
          )}
        </div>
      </div>
      <TrendChart data={points} valueFormatter={valueFormatter} height={180} />
      {footnote && <p className="fin-chart-footnote">{footnote}</p>}
    </Card>
  )
}

function TodayTable({
  items,
  accounts,
  onOpenReview,
}: {
  items: FinanceActivityItem[]
  accounts: Map<string, FinanceAccount>
  onOpenReview: () => void
}) {
  if (items.length === 0) {
    return (
      <p className="finance-muted">
        No activity recorded yet for this tax year.
      </p>
    )
  }
  return (
    <div className="fin-table-wrap">
      <table className="fin-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Source</th>
            <th>Amount</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const accountId =
              item.representation === 'group'
                ? item.account_id
                : item.source_account_id
            const account = accounts.get(accountId)
            const label =
              item.representation === 'group' ? item.label : item.event_type
            const reviewOrStatus =
              item.representation === 'group' ? item.review_status : item.status
            const missingEvidence =
              item.completeness.blockers.length > 0 ||
              (item.representation === 'raw' &&
                item.evidence_document_ids.length === 0)
            const tone: PillTone =
              reviewOrStatus === 'confirmed'
                ? 'success'
                : missingEvidence
                  ? 'danger'
                  : reviewOrStatus === 'deferred'
                    ? 'neutral'
                    : 'warning'
            const statusText =
              reviewOrStatus === 'confirmed'
                ? 'Matched'
                : missingEvidence
                  ? 'Missing doc'
                  : reviewOrStatus === 'deferred'
                    ? 'Deferred'
                    : 'Review'
            return (
              <tr key={item.id}>
                <td>
                  <strong>{label}</strong>
                  <span className="fin-table-sub">
                    {item.event_type.replace(/_/g, ' ')}
                  </span>
                </td>
                <td>{account?.name ?? 'Unknown source'}</td>
                <td className="fin-table-amount">
                  {formatMoney(
                    item.report_value,
                    item.report_currency ?? 'EUR',
                  )}
                </td>
                <td>
                  <StatusPill tone={tone}>{statusText}</StatusPill>
                </td>
                <td className="fin-table-actions">
                  {/* ponytail: single row action — full context menu when a second action exists. */}
                  <button
                    type="button"
                    className="fin-row-menu"
                    aria-label={`Open ${label} in review`}
                    onClick={onOpenReview}
                  >
                    …
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function OverviewMain({
  summary,
  taxYear,
  refreshKey,
  onOpenActivity,
  onOpenReview,
}: {
  summary: FinanceLoadState<FinanceSummary>
  taxYear: number
  refreshKey: number
  onOpenActivity: () => void
  onOpenReview: () => void
}) {
  const [recent, setRecent] = useState<FinanceLoadState<FinanceActivityItem[]>>(
    {
      status: 'loading',
    },
  )
  const [recentTotal, setRecentTotal] = useState(0)
  const [accounts, setAccounts] = useState<Map<string, FinanceAccount>>(
    new Map(),
  )
  const charts = useOverviewCharts(taxYear, refreshKey)

  useEffect(() => {
    let active = true
    void fetchFinanceActivity({
      view: 'grouped',
      from: `${taxYear}-01-01`,
      to: `${taxYear}-12-31`,
      limit: 60,
    })
      .then((page) => {
        if (!active) return
        setRecentTotal(page.page.total)
        setRecent(
          page.items.length === 0 && page.empty_state
            ? { status: 'empty', empty_state: page.empty_state }
            : { status: 'ready', data: page.items },
        )
      })
      .catch((error: unknown) => {
        if (!active) return
        setRecent({
          status: 'error',
          message:
            error instanceof Error ? error.message : 'Activity request failed',
          retryable: true,
        })
      })
    void fetchFinanceAccounts().then((page) => {
      if (!active) return
      setAccounts(new Map(page.items.map((a) => [a.id, a])))
    })
    return () => {
      active = false
    }
  }, [taxYear, refreshKey])

  const today = useMemo(() => {
    if (recent.status !== 'ready') return []
    const todayIso = new Date().toISOString().slice(0, 10)
    const dated = recent.data.filter((item) =>
      item.representation === 'group' ? item.tax_date === todayIso : true,
    )
    return (dated.length > 0 ? dated : recent.data).slice(0, 6)
  }, [recent])

  if (summary.status === 'loading') {
    return (
      <Card>
        <div className="skeleton finance-skeleton" />
        <div className="skeleton finance-skeleton short" />
      </Card>
    )
  }
  if (summary.status === 'error') {
    return (
      <Card>
        <h2>Finance could not load</h2>
        <p className="finance-muted">{summary.message}</p>
      </Card>
    )
  }
  if (summary.status === 'empty') {
    return (
      <Card>
        <span className="finance-section-label">Start here</span>
        <h2>{summary.empty_state.title}</h2>
        <p className="finance-muted">{summary.empty_state.message}</p>
        <ol className="fin-onboarding-steps">
          <li>Add a source account</li>
          <li>Import a statement</li>
          <li>Review the first group</li>
        </ol>
      </Card>
    )
  }

  const { totals, counts, completeness, previous_year } = summary.data
  const pageWarnings = [...completeness.blockers, ...completeness.warnings]
  const previousYear = taxYear - 1
  const sinceLabel = `Jan 1, ${taxYear}`

  const sparkOf = (series: FinanceTimeseriesSeries[] | undefined) =>
    series ? mergeSeries(series, 'sum').map((p) => p.value) : undefined

  const kpiTrend = (current: string, previous: string) => {
    const delta = yoyDelta(current, previous, previousYear)
    return {
      tone:
        delta.tone === 'success'
          ? ('success' as const)
          : delta.tone === 'danger'
            ? ('danger' as const)
            : ('neutral' as const),
      text: delta.text,
    }
  }

  return (
    <>
      {pageWarnings.length > 0 && (
        <Card>
          <span className="finance-section-label">Data warnings</span>
          <WarningList warnings={pageWarnings} />
        </Card>
      )}
      <div className="fin-stat-row">
        <StatCard
          icon="↓"
          label="Income"
          value={formatMoney(totals.income)}
          caption="YTD"
          sparkline={sparkOf(charts?.income)}
          trend={kpiTrend(totals.income, previous_year.income)}
        />
        <StatCard
          icon="↑"
          label="Expenses"
          value={formatMoney(totals.expense)}
          caption="YTD"
          sparkline={sparkOf(charts?.expense)}
          trend={kpiTrend(totals.expense, previous_year.expense)}
        />
        <StatCard
          icon="★"
          label="Rewards"
          value={formatMoney(totals.rewards)}
          caption="YTD"
          sparkline={sparkOf(charts?.rewards)}
          trend={kpiTrend(totals.rewards, previous_year.rewards)}
        />
        <StatCard
          icon="⇄"
          label="Transfers"
          value={formatMoney(totals.transfers)}
          caption="YTD"
          trend={kpiTrend(totals.transfers, previous_year.transfers)}
        />
        <StatCard
          icon="☰"
          label="Review queue"
          value={counts.pending_review_groups}
          caption="Items"
          trend={
            counts.pending_review_groups > 0
              ? {
                  tone: 'warning',
                  text: `${counts.pending_review_groups} unreviewed`,
                }
              : { tone: 'success', text: 'All clear' }
          }
        />
      </div>

      <div className="fin-chart-row">
        <SeriesChartCard
          label="Net worth"
          headline={formatMoney(totals.net_worth)}
          series={charts?.netWorth ?? []}
          allLabel="All accounts"
          merge="sum"
          valueFormatter={(v) => `€${Math.round(v / 1000)}k`}
          sinceLabel={sinceLabel}
          footnote="Total across all accounts and assets."
        />
        <SeriesChartCard
          label="Passive income"
          headline={formatMoney(totals.rewards)}
          series={charts?.rewards ?? []}
          allLabel="All sources"
          merge="sum"
          valueFormatter={(v) => `€${v.toFixed(0)}`}
          sinceLabel={sinceLabel}
          footnote="Daily aggregated staking, savings and rewards. Tiny hourly rewards are grouped by day for clarity."
          action={
            <button
              type="button"
              className="fin-btn fin-btn-ghost fin-btn-sm"
              onClick={onOpenActivity}
            >
              View activity
            </button>
          }
        />
        <SeriesChartCard
          label="Tax readiness"
          headline={`${readinessPercent(summary.data)}%`}
          series={charts?.readiness ?? []}
          allLabel="All jurisdictions"
          merge="avg"
          valueFormatter={(v) => `${Math.round(v)}%`}
          sinceLabel={sinceLabel}
          footnote="Based on data completeness, reviews and documents."
        />
      </div>

      <Card>
        <div className="fin-card-head-row">
          <span className="finance-section-label">
            Today <span className="fin-count-badge">{today.length}</span>
          </span>
          <button
            type="button"
            className="fin-btn fin-btn-ghost fin-btn-sm"
            onClick={onOpenReview}
          >
            View all ({recentTotal})
          </button>
        </div>
        {recent.status === 'error' ? (
          <p className="finance-muted">{recent.message}</p>
        ) : (
          <TodayTable
            items={today}
            accounts={accounts}
            onOpenReview={onOpenReview}
          />
        )}
      </Card>
    </>
  )
}

export function FinanceOverview(props: FinanceTabProps) {
  const [view, setView] = useState<'overview' | 'activity'>('overview')
  const [addJurisdictionOpen, setAddJurisdictionOpen] = useState(false)
  const summary = useFinanceSummary(
    props.taxYear,
    props.jurisdiction,
    props.refreshKey,
  )
  const openReview = () => props.onSelectTab('review')

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
        {view === 'overview' ? (
          <FinanceSidebarContent
            taxYear={props.taxYear}
            onTaxYearChange={props.onTaxYearChange}
            summary={summary}
            jurisdiction={props.jurisdiction}
            onJurisdictionChange={props.onJurisdictionChange}
            onAddJurisdiction={() => setAddJurisdictionOpen(true)}
            onOpenReview={openReview}
          />
        ) : (
          <ActivitySidebar
            taxYear={props.taxYear}
            onTaxYearChange={props.onTaxYearChange}
            jurisdiction={props.jurisdiction}
            onJurisdictionChange={props.onJurisdictionChange}
            summary={summary}
          />
        )}
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
          {view === 'overview' ? (
            <OverviewMain
              summary={summary}
              taxYear={props.taxYear}
              refreshKey={props.refreshKey}
              onOpenActivity={() => setView('activity')}
              onOpenReview={openReview}
            />
          ) : (
            <ActivityMain
              taxYear={props.taxYear}
              onBack={() => setView('overview')}
            />
          )}
        </div>
      </main>
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
