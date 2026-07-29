import { useEffect, useMemo, useState } from 'react'
import { Card } from '../../components/Card'
import { SidebarShell } from '../../components/SidebarShell'
import {
  fetchFinanceAccounts,
  fetchFinanceActivity,
  fetchFinanceSummary,
} from './api'
import { ActivityMain, ActivitySidebar } from './FinanceActivity'
import { FinanceHeader, type FinanceTabProps } from './Finance'
import { aggregateByDay, formatMoney, readinessPercent } from './format'
import {
  IconChevronRight,
  IconWarning,
  JurisdictionList,
  RingProgress,
  SidebarYearBlock,
  StatCard,
  StatusPill,
  TrendChart,
  WarningList,
  type PillTone,
} from './primitives'
import type {
  FinanceAccount,
  FinanceActivityItem,
  FinanceLoadState,
  FinanceSummary,
} from './types'

function useFinanceSummary(taxYear: number, jurisdiction: string | undefined) {
  const [summary, setSummary] = useState<FinanceLoadState<FinanceSummary>>({
    status: 'loading',
  })
  useEffect(() => {
    let active = true
    void fetchFinanceSummary(taxYear, jurisdiction)
      .then((data) => {
        if (!active) return
        setSummary(
          data.empty_state
            ? { status: 'empty', empty_state: data.empty_state }
            : { status: 'ready', data },
        )
      })
      .catch((error: unknown) => {
        if (!active) return
        setSummary({
          status: 'error',
          message:
            error instanceof Error ? error.message : 'Finance request failed',
          retryable: true,
        })
      })
    return () => {
      active = false
    }
  }, [taxYear, jurisdiction])
  return summary
}

function OverviewSidebar({
  taxYear,
  summary,
  jurisdiction,
  onJurisdictionChange,
}: {
  taxYear: number
  summary: FinanceLoadState<FinanceSummary>
  jurisdiction: string | undefined
  onJurisdictionChange: (code: string | undefined) => void
}) {
  const ready = summary.status === 'ready' ? summary.data : null
  return (
    <>
      <SidebarYearBlock taxYear={taxYear} />
      <JurisdictionList
        jurisdiction={jurisdiction}
        onChange={onJurisdictionChange}
      />

      {ready && (
        <div className="fin-sidebar-section">
          <span className="finance-section-label">Readiness</span>
          <div className="fin-readiness-card">
            <div className="fin-readiness-top">
              <RingProgress value={readinessPercent(ready)} />
              <div>
                <strong>{readinessPercent(ready)}%</strong>
                <span
                  className={
                    ready.readiness.status === 'blocked'
                      ? 'fin-muted-danger'
                      : 'fin-muted-success'
                  }
                >
                  {ready.readiness.status === 'ready'
                    ? 'On track'
                    : ready.readiness.status === 'blocked'
                      ? 'Blocked'
                      : 'Needs review'}
                </span>
              </div>
            </div>
            <span className="fin-sidebar-link">
              Complete your review to increase accuracy.
              <IconChevronRight />
            </span>
          </div>
        </div>
      )}

      {ready &&
        (ready.counts.pending_review_groups > 0 ||
          ready.counts.missing_evidence > 0) && (
          <div className="fin-sidebar-section">
            <span className="finance-section-label">Warnings</span>
            <div className="fin-sidebar-list">
              {ready.counts.pending_review_groups > 0 && (
                <span className="fin-warning-row">
                  <IconWarning />
                  <span>
                    <strong>
                      {ready.counts.pending_review_groups} unreviewed rewards
                    </strong>
                    <span>Review in queue</span>
                  </span>
                  <IconChevronRight />
                </span>
              )}
              {ready.counts.missing_evidence > 0 && (
                <span className="fin-warning-row">
                  <IconWarning />
                  <span>
                    <strong>
                      {ready.counts.missing_evidence} missing documents
                    </strong>
                    <span>Add to improve readiness</span>
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

function TodayTable({
  items,
  accounts,
}: {
  items: FinanceActivityItem[]
  accounts: Map<string, FinanceAccount>
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
            const tone: PillTone =
              reviewOrStatus === 'confirmed'
                ? 'success'
                : reviewOrStatus === 'deferred'
                  ? 'neutral'
                  : 'warning'
            const statusText =
              reviewOrStatus === 'confirmed'
                ? 'Matched'
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
  onOpenActivity,
}: {
  summary: FinanceLoadState<FinanceSummary>
  taxYear: number
  onOpenActivity: () => void
}) {
  const [recent, setRecent] = useState<FinanceLoadState<FinanceActivityItem[]>>(
    {
      status: 'loading',
    },
  )
  const [accounts, setAccounts] = useState<Map<string, FinanceAccount>>(
    new Map(),
  )

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
  }, [taxYear])

  const rewardTrend = useMemo(
    () => (recent.status === 'ready' ? aggregateByDay(recent.data) : []),
    [recent],
  )
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

  const { totals, counts, completeness } = summary.data
  const pageWarnings = [...completeness.blockers, ...completeness.warnings]

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
        />
        <StatCard
          icon="↑"
          label="Expenses"
          value={formatMoney(totals.expense)}
          caption="YTD"
        />
        <StatCard
          icon="★"
          label="Rewards"
          value={formatMoney(totals.rewards)}
          caption="YTD"
        />
        <StatCard
          icon="⇄"
          label="Transfers"
          value={formatMoney(totals.transfers)}
          caption="YTD"
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
        <Card className="fin-chart-card">
          <div className="fin-chart-head">
            <div>
              <span className="finance-section-label">Net worth</span>
              <strong className="fin-chart-value">
                {formatMoney(totals.net_worth)}
              </strong>
            </div>
          </div>
          <div className="fin-chart-empty">
            {totals.net_worth === null
              ? 'Net worth arrives once account balances are reconciled.'
              : 'Historical trend arrives once valuation snapshots accumulate across imports.'}
          </div>
        </Card>
        <Card className="fin-chart-card">
          <div className="fin-chart-head">
            <div>
              <span className="finance-section-label">Passive income</span>
              <strong className="fin-chart-value">
                {formatMoney(totals.rewards)}
              </strong>
            </div>
            <button
              type="button"
              className="fin-btn fin-btn-ghost fin-btn-sm"
              onClick={onOpenActivity}
            >
              View activity
            </button>
          </div>
          <TrendChart
            data={rewardTrend}
            valueFormatter={(v) => `€${v.toFixed(0)}`}
            height={180}
          />
          <p className="fin-chart-footnote">
            Daily aggregated staking, savings and reward groups for {taxYear}.
          </p>
        </Card>
        <Card className="fin-chart-card">
          <div className="fin-chart-head">
            <div>
              <span className="finance-section-label">Tax readiness</span>
              <strong className="fin-chart-value">
                {readinessPercent(summary.data)}%
              </strong>
            </div>
          </div>
          <div className="fin-chart-empty">
            Based on data completeness, reviews and documents. History arrives
            after your first full review pass.
          </div>
        </Card>
      </div>

      <Card>
        <div className="fin-card-head-row">
          <span className="finance-section-label">
            Today <span className="fin-count-badge">{today.length}</span>
          </span>
        </div>
        {recent.status === 'error' ? (
          <p className="finance-muted">{recent.message}</p>
        ) : (
          <TodayTable items={today} accounts={accounts} />
        )}
      </Card>
    </>
  )
}

export function FinanceOverview(props: FinanceTabProps) {
  const [view, setView] = useState<'overview' | 'activity'>('overview')
  const summary = useFinanceSummary(props.taxYear, props.jurisdiction)

  return (
    <>
      <SidebarShell
        as="nav"
        title="Finance"
        className="finance-sidebar"
        ariaLabel="Finance navigation"
      >
        {view === 'overview' ? (
          <OverviewSidebar
            taxYear={props.taxYear}
            summary={summary}
            jurisdiction={props.jurisdiction}
            onJurisdictionChange={props.onJurisdictionChange}
          />
        ) : (
          <ActivitySidebar
            taxYear={props.taxYear}
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
          />
          {view === 'overview' ? (
            <OverviewMain
              summary={summary}
              taxYear={props.taxYear}
              onOpenActivity={() => setView('activity')}
            />
          ) : (
            <ActivityMain
              taxYear={props.taxYear}
              onBack={() => setView('overview')}
            />
          )}
        </div>
      </main>
    </>
  )
}
