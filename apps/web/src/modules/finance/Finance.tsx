import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AppRail } from '../../components/AppRail'
import { Card } from '../../components/Card'
import { Dropdown } from '../../components/Dropdown'
import { IconButton } from '../../components/IconButton'
import { Segmented } from '../../components/Segmented'
import { FinanceAssistantLauncher } from './FinanceAssistant'
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
}

/** Shared header — tabs, tax-year navigation, record/import actions. Identical across every tab. */
export function FinanceHeader({
  taxYear,
  onTaxYearChange,
  tab,
  onSelectTab,
}: Pick<
  FinanceTabProps,
  'taxYear' | 'onTaxYearChange' | 'tab' | 'onSelectTab'
>) {
  const [importOpen, setImportOpen] = useState(false)
  const years = Array.from({ length: 6 }, (_, i) => taxYear - 4 + i)

  return (
    <header className="fin-header">
      <div className="fin-header-title">
        <h1>Finance</h1>
        <div className="fin-year-nav">
          <IconButton
            icon="‹"
            label="Previous tax year"
            onClick={() => onTaxYearChange(taxYear - 1)}
            size="sm"
          />
          <Dropdown
            ariaLabel="Tax year"
            value={taxYear}
            onChange={onTaxYearChange}
            options={years.map((year) => ({
              value: year,
              label: `Tax year ${year}`,
            }))}
          />
          <IconButton
            icon="›"
            label="Next tax year"
            onClick={() => onTaxYearChange(taxYear + 1)}
            size="sm"
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
          className="fin-btn fin-btn-primary"
          onClick={() => setImportOpen(true)}
        >
          Import statement
        </button>
      </div>
      {importOpen && (
        <FinanceImportWizard
          onClose={() => setImportOpen(false)}
          onCommitted={() => onSelectTab('review')}
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
      <FinanceAssistantLauncher />
    </div>
  )
}
