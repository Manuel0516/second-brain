import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AppRail } from '../../components/AppRail'
import { Card } from '../../components/Card'
import { Dropdown } from '../../components/Dropdown'
import { IconButton } from '../../components/IconButton'
import { Segmented } from '../../components/Segmented'
import { AddRecordDialog } from './AddRecordDialog'
import { FinanceImportWizard } from './FinanceImportWizard'
import { FinanceOverview } from './FinanceOverview'
import { FinanceReports } from './FinanceReports'
import { FinanceReview } from './FinanceReview'
import { FINANCE_TABS, type FinanceTab } from './navigation'
import './finance.css'

const LEGACY_SECTIONS = ['accounts', 'assets', 'evidence'] as const
const TAB_LABELS: Record<FinanceTab, string> = {
  overview: 'Overview',
  review: 'Review',
  reports: 'Reports',
}

export interface FinanceTabProps {
  taxYear: number
  onTaxYearChange: (year: number) => void
  jurisdiction: string | undefined
  onJurisdictionChange: (jurisdiction: string | undefined) => void
  tab: FinanceTab
  onSelectTab: (tab: FinanceTab) => void
  /** Bumped after any mutation — pages refetch on it. */
  refreshKey: number
  onRefresh: () => void
  sidebarOpen: boolean
  onSidebarOpenChange: (open: boolean) => void
}

/** Shared header — tabs, tax-year navigation, record/import actions. Identical across every tab. */
export function FinanceHeader({
  taxYear,
  onTaxYearChange,
  tab,
  onSelectTab,
  onRefresh,
  sidebarOpen,
  onSidebarOpenChange,
}: Pick<
  FinanceTabProps,
  | 'taxYear'
  | 'onTaxYearChange'
  | 'tab'
  | 'onSelectTab'
  | 'onRefresh'
  | 'sidebarOpen'
  | 'onSidebarOpenChange'
>) {
  const [importOpen, setImportOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const years = Array.from({ length: 6 }, (_, i) => taxYear - 4 + i)

  return (
    <header className="fin-header">
      <div className="fin-header-title">
        <IconButton
          icon={
            <svg
              width="15"
              height="15"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
              <path d="M7.5 3.5v13" />
            </svg>
          }
          label={sidebarOpen ? 'Hide navigation' : 'Show navigation'}
          pressed={sidebarOpen}
          onClick={() => onSidebarOpenChange(!sidebarOpen)}
          size="sm"
          variant="raised"
        />
        <h1>Finance</h1>
        <div className="fin-year-nav">
          <div className="fin-year-nav-buttons">
            <IconButton
              icon="‹"
              label="Previous tax year"
              onClick={() => onTaxYearChange(taxYear - 1)}
              size="sm"
              variant="raised"
            />
            <IconButton
              icon="›"
              label="Next tax year"
              onClick={() => onTaxYearChange(taxYear + 1)}
              size="sm"
              variant="raised"
            />
          </div>
          <Dropdown
            className="fin-dropdown-plain"
            ariaLabel="Tax year"
            value={taxYear}
            onChange={onTaxYearChange}
            options={years.map((year) => ({
              value: year,
              label: `Tax year ${year}`,
            }))}
          />
        </div>
      </div>

      <div className="fin-tabs">
        <Segmented
          ariaLabel="Finance section"
          value={tab}
          options={[...FINANCE_TABS]}
          labels={TAB_LABELS}
          onChange={(next) => onSelectTab(next as FinanceTab)}
        />
      </div>

      <div className="fin-header-actions">
        <button
          type="button"
          className="fin-btn fin-btn-ghost"
          onClick={() => setAddOpen(true)}
        >
          + Add record
        </button>
        <button
          type="button"
          className="fin-btn fin-btn-primary"
          onClick={() => setImportOpen(true)}
        >
          Import CSV
        </button>
      </div>
      {addOpen && (
        <AddRecordDialog
          taxYear={taxYear}
          onClose={() => setAddOpen(false)}
          onSaved={onRefresh}
        />
      )}
      {importOpen && (
        <FinanceImportWizard
          onClose={() => setImportOpen(false)}
          onCommitted={() => {
            onRefresh()
            onSelectTab('review')
          }}
        />
      )}
    </header>
  )
}

function FinanceLegacyPlaceholder({ section }: { section: string }) {
  return (
    <main className="finance-canvas">
      <div className="finance-content">
        <header className="fin-header">
          <div className="fin-header-title">
            <h1 style={{ textTransform: 'capitalize' }}>{section}</h1>
          </div>
        </header>
        <Card>
          <span className="finance-section-label">Deferred scope</span>
          <p className="finance-muted">
            A dedicated {section} page has no mockup yet. Accounts already live
            under Activity → Sources, and documents under Reports → Evidence
            bundle.
          </p>
        </Card>
      </div>
    </main>
  )
}

export function Finance() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedSection = searchParams.get('section')
  const tab: FinanceTab = (FINANCE_TABS as readonly string[]).includes(
    requestedSection ?? '',
  )
    ? (requestedSection as FinanceTab)
    : 'overview'
  const isLegacy = LEGACY_SECTIONS.includes(
    requestedSection as (typeof LEGACY_SECTIONS)[number],
  )

  const [taxYear, setTaxYear] = useState(() => new Date().getFullYear())
  const [jurisdiction, setJurisdiction] = useState<string | undefined>(
    undefined,
  )
  const [refreshKey, setRefreshKey] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  function selectTab(next: FinanceTab) {
    setSearchParams(next === 'overview' ? {} : { section: next }, {
      replace: true,
    })
  }

  const shared: FinanceTabProps = {
    taxYear,
    onTaxYearChange: setTaxYear,
    jurisdiction,
    onJurisdictionChange: setJurisdiction,
    tab,
    onSelectTab: selectTab,
    refreshKey,
    onRefresh: () => setRefreshKey((key) => key + 1),
    sidebarOpen,
    onSidebarOpenChange: setSidebarOpen,
  }

  return (
    <div className="finance-page">
      <AppRail active="finance" onNavigate={navigate} />
      {isLegacy ? (
        <FinanceLegacyPlaceholder section={requestedSection as string} />
      ) : tab === 'review' ? (
        <FinanceReview {...shared} />
      ) : tab === 'reports' ? (
        <FinanceReports {...shared} />
      ) : (
        <FinanceOverview {...shared} />
      )}
    </div>
  )
}
