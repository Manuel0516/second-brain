import { useEffect, useState } from 'react'
import { Card } from '../../components/Card'
import { Field } from '../../components/Field'
import { SidebarShell } from '../../components/SidebarShell'
import {
  confirmFinanceTaxTreatment,
  createFinanceReport,
  createFinanceTaxProfile,
  fetchFinanceActivity,
  fetchFinanceEvidence,
  fetchFinanceReports,
  fetchFinanceResidencyFacts,
  fetchFinanceTaxProfiles,
  fetchFinanceTaxTreatments,
  financeEvidenceBundleUrl,
} from './api'
import { AddJurisdictionDialog } from './AddJurisdictionDialog'
import { FinanceHeader, type FinanceTabProps } from './Finance'
import {
  FinanceSidebarClose,
  FinanceSidebarContent,
  useFinanceSummary,
} from './FinanceSidebar'
import { JURISDICTIONS } from './navigation'
import {
  IconCheck,
  IconDownload,
  IconFile,
  IconWarning,
  ReasonModal,
  StatusPill,
  WarningList,
} from './primitives'
import type {
  FinanceEvidence,
  FinanceLoadState,
  FinanceReportRun,
  FinanceResidencyFact,
  FinanceTaxProfile,
  FinanceTaxTreatment,
} from './types'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

/** Optimistic-concurrency input for report creation — every confirmed revision in the tax year. */
async function collectConfirmedRevisionIds(taxYear: number): Promise<string[]> {
  const ids: string[] = []
  let offset = 0
  const limit = 200
  for (;;) {
    const page = await fetchFinanceActivity({
      view: 'raw',
      status: 'confirmed',
      from: `${taxYear}-01-01`,
      to: `${taxYear}-12-31`,
      limit,
      offset,
    })
    for (const item of page.items) {
      if (item.representation === 'raw') ids.push(item.id)
    }
    if (!page.page.has_more) break
    offset += limit
  }
  return ids
}

function useAllTaxProfiles() {
  const [profiles, setProfiles] = useState<FinanceTaxProfile[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  useEffect(() => {
    let active = true
    void fetchFinanceTaxProfiles({ limit: 200 }).then((page) => {
      if (active) setProfiles(page.items)
    })
    return () => {
      active = false
    }
  }, [reloadKey])
  return { profiles, reload: () => setReloadKey((k) => k + 1) }
}

function useAllReports() {
  const [reports, setReports] = useState<FinanceReportRun[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  useEffect(() => {
    let active = true
    void fetchFinanceReports({ limit: 200 }).then((page) => {
      if (active) setReports(page.items)
    })
    return () => {
      active = false
    }
  }, [reloadKey])
  return { reports, reload: () => setReloadKey((k) => k + 1) }
}

function useEvidenceVault() {
  const [state, setState] = useState<FinanceLoadState<FinanceEvidence[]>>({
    status: 'loading',
  })
  const [total, setTotal] = useState(0)
  useEffect(() => {
    let active = true
    void fetchFinanceEvidence({ limit: 200 })
      .then((page) => {
        if (!active) return
        setTotal(page.page.total)
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
            error instanceof Error ? error.message : 'Evidence request failed',
          retryable: true,
        })
      })
    return () => {
      active = false
    }
  }, [])
  return { state, total }
}

function useTreatments(profileId: string | null) {
  const [result, setResult] = useState<{
    profileId: string
    items: FinanceTaxTreatment[]
  } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  useEffect(() => {
    if (!profileId) return
    let active = true
    void fetchFinanceTaxTreatments(profileId, { limit: 200 }).then((page) => {
      if (active) setResult({ profileId, items: page.items })
    })
    return () => {
      active = false
    }
  }, [profileId, reloadKey])
  return {
    items: result?.profileId === profileId ? result.items : [],
    reload: () => setReloadKey((k) => k + 1),
  }
}

function useResidencyFacts(profileId: string | null) {
  const [result, setResult] = useState<{
    profileId: string
    items: FinanceResidencyFact[]
  } | null>(null)
  useEffect(() => {
    if (!profileId) return
    let active = true
    void fetchFinanceResidencyFacts(profileId, { limit: 200 }).then((page) => {
      if (active) setResult({ profileId, items: page.items })
    })
    return () => {
      active = false
    }
  }, [profileId])
  return result?.profileId === profileId ? result.items : []
}

function CreateProfileCard({
  jurisdiction,
  taxYear,
  onCreated,
}: {
  jurisdiction: 'SE' | 'ES'
  taxYear: number
  onCreated: () => void
}) {
  const [currency, setCurrency] = useState(
    jurisdiction === 'SE' ? 'SEK' : 'EUR',
  )
  const [materiality, setMateriality] = useState('100')
  const [tolerance, setTolerance] = useState('1')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      await createFinanceTaxProfile(
        {
          tax_year: taxYear,
          jurisdiction,
          reporting_currency: currency,
          materiality_threshold: materiality,
          reconciliation_tolerance: tolerance,
          status: 'draft',
        },
        crypto.randomUUID(),
      )
      onCreated()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not create tax profile',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <span className="finance-section-label">
        No profile for {taxYear} yet
      </span>
      <div className="fin-create-profile">
        <Field label="Reporting currency">
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          />
        </Field>
        <Field label="Materiality threshold">
          <input
            value={materiality}
            onChange={(e) => setMateriality(e.target.value)}
          />
        </Field>
        <Field label="Reconciliation tolerance">
          <input
            value={tolerance}
            onChange={(e) => setTolerance(e.target.value)}
          />
        </Field>
      </div>
      {error && <p className="fin-muted-danger">{error}</p>}
      <button
        type="button"
        className="fin-btn fin-btn-primary fin-btn-sm"
        onClick={() => void submit()}
        disabled={saving}
      >
        {saving ? 'Creating…' : `Create ${jurisdiction} profile`}
      </button>
    </Card>
  )
}

/** Per-category export buttons — B8 `?category=` reports in each of the three formats. */
function CategoryExportButtons({
  profile,
  taxYear,
  category,
  onCreated,
}: {
  profile: FinanceTaxProfile
  taxYear: number
  category: string
  onCreated: () => void
}) {
  const [busy, setBusy] = useState<'zip' | 'csv' | 'pdf_summary' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function exportAs(format: 'zip' | 'csv' | 'pdf_summary') {
    setBusy(format)
    setError(null)
    try {
      const expectedEventRevisionIds =
        await collectConfirmedRevisionIds(taxYear)
      await createFinanceReport(
        {
          tax_profile_id: profile.id,
          format,
          include_warnings: true,
          expected_event_revision_ids: expectedEventRevisionIds,
          category,
        },
        crypto.randomUUID(),
      )
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <span className="fin-category-exports">
      {(['zip', 'csv', 'pdf_summary'] as const).map((format) => (
        <button
          key={format}
          type="button"
          className="fin-btn fin-btn-ghost fin-btn-sm"
          onClick={() => void exportAs(format)}
          disabled={busy !== null}
          aria-label={`Export ${category.replace(/_/g, ' ')} as ${format}`}
        >
          {busy === format
            ? '…'
            : format === 'pdf_summary'
              ? 'PDF'
              : format.toUpperCase()}
        </button>
      ))}
      {error && <span className="fin-muted-danger">{error}</span>}
    </span>
  )
}

function OpenQuestionRow({
  treatment,
  onConfirmed,
}: {
  treatment: FinanceTaxTreatment
  onConfirmed: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const missing = treatment.missing_facts.length > 0
  return (
    <div className="fin-question-row">
      <IconWarning />
      <div>
        <strong>{treatment.category.replace(/_/g, ' ')}</strong>
        <span className="fin-table-sub">
          {missing
            ? `Missing: ${treatment.missing_facts.join(', ')}`
            : treatment.rationale}
        </span>
      </div>
      <StatusPill tone={missing ? 'danger' : 'warning'}>
        {missing ? 'Missing facts' : 'Candidate'}
      </StatusPill>
      <button
        type="button"
        className="fin-btn fin-btn-ghost fin-btn-sm"
        onClick={() => setConfirming(true)}
      >
        Confirm
      </button>
      {confirming && (
        <ReasonModal
          title={`Confirm ${treatment.category.replace(/_/g, ' ')}`}
          description={treatment.rationale}
          onCancel={() => setConfirming(false)}
          onSubmit={async (reason) => {
            await confirmFinanceTaxTreatment(
              treatment.id,
              { reason, expected_ruleset_version: treatment.ruleset_version },
              crypto.randomUUID(),
            )
            setConfirming(false)
            onConfirmed()
          }}
        />
      )}
    </div>
  )
}

function ReportsPanel({
  profile,
  reports,
  taxYear,
  onCreated,
}: {
  profile: FinanceTaxProfile
  reports: FinanceReportRun[]
  taxYear: number
  onCreated: () => void
}) {
  const [format, setFormat] = useState<'zip' | 'csv' | 'pdf_summary'>('zip')
  const [includeWarnings, setIncludeWarnings] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setCreating(true)
    setError(null)
    try {
      const expectedEventRevisionIds =
        await collectConfirmedRevisionIds(taxYear)
      await createFinanceReport(
        {
          tax_profile_id: profile.id,
          format,
          include_warnings: includeWarnings,
          expected_event_revision_ids: expectedEventRevisionIds,
        },
        crypto.randomUUID(),
      )
      onCreated()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not create report — records may have changed since the last check, try again',
      )
    } finally {
      setCreating(false)
    }
  }

  const latest = reports[0]

  return (
    <Card>
      <span className="finance-section-label">Report exports</span>
      {latest && (
        <div className="fin-export-card">
          <strong>{latest.status.replace(/_/g, ' ')}</strong>
          <span className="fin-table-sub">
            {latest.readiness.blocking_count} blocking ·{' '}
            {latest.readiness.warning_count} warning ·{' '}
            {new Date(latest.created_at).toLocaleDateString()}
          </span>
          <WarningList
            warnings={[
              ...latest.readiness.blockers,
              ...latest.readiness.warnings,
            ]}
          />
          {latest.download && (
            <a
              className="fin-btn fin-btn-ghost fin-btn-sm"
              href={latest.download.download_url}
              target="_blank"
              rel="noreferrer"
            >
              <IconDownload /> {latest.download.file_name}
            </a>
          )}
        </div>
      )}
      <div className="fin-export-buttons">
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as typeof format)}
        >
          <option value="zip">ZIP</option>
          <option value="csv">CSV</option>
          <option value="pdf_summary">PDF summary</option>
        </select>
        <label className="fin-ack-row">
          <input
            type="checkbox"
            checked={includeWarnings}
            onChange={(e) => setIncludeWarnings(e.target.checked)}
          />
          Include warnings
        </label>
      </div>
      {error && <p className="fin-muted-danger">{error}</p>}
      <button
        type="button"
        className="fin-btn fin-btn-primary fin-btn-sm"
        onClick={() => void create()}
        disabled={creating}
      >
        {creating ? 'Generating…' : 'Generate report'}
      </button>
      <span className="fin-table-sub">
        {reports.length} export{reports.length === 1 ? '' : 's'} so far
      </span>
    </Card>
  )
}

function JurisdictionCard({
  jurisdiction,
  taxYear,
  reports,
  onReportsChanged,
}: {
  jurisdiction: { code: 'SE' | 'ES'; flag: string; label: string }
  taxYear: number
  reports: FinanceReportRun[]
  onReportsChanged: () => void
}) {
  const { profiles, reload: reloadProfiles } = useAllTaxProfiles()
  const profile =
    profiles.find(
      (p) => p.jurisdiction === jurisdiction.code && p.tax_year === taxYear,
    ) ?? null
  const { items: treatments, reload: reloadTreatments } = useTreatments(
    profile?.id ?? null,
  )
  const residency = useResidencyFacts(profile?.id ?? null)
  const profileReports = reports.filter((r) => r.tax_profile_id === profile?.id)

  if (!profile) {
    return (
      <CreateProfileCard
        jurisdiction={jurisdiction.code}
        taxYear={taxYear}
        onCreated={reloadProfiles}
      />
    )
  }

  const byCategory = new Map<string, FinanceTaxTreatment[]>()
  for (const t of treatments) {
    const list = byCategory.get(t.category) ?? []
    list.push(t)
    byCategory.set(t.category, list)
  }
  const openQuestions = treatments.filter((t) => t.status === 'candidate')

  return (
    <div className="fin-jurisdiction-report">
      <div className="fin-card-head-row">
        <span className="finance-section-label">
          {jurisdiction.flag} {jurisdiction.label} · {profile.status}
        </span>
        <span className="fin-table-sub">{profile.reporting_currency}</span>
      </div>

      <div className="fin-chart-row fin-chart-row-3">
        <Card>
          <span className="finance-section-label">Tax package</span>
          {byCategory.size === 0 ? (
            <p className="finance-muted">
              No confirmed classifications yet — review activity to populate
              this checklist.
            </p>
          ) : (
            <div className="fin-checklist">
              {[...byCategory.entries()].map(([category, group]) => {
                const complete = group.every((t) => t.status === 'confirmed')
                return (
                  <div key={category} className="fin-checklist-row">
                    <span>{category.replace(/_/g, ' ')}</span>
                    {complete ? (
                      <span className="fin-muted-success">
                        Complete <IconCheck />
                      </span>
                    ) : (
                      <StatusPill tone="warning">
                        {group.filter((t) => t.status !== 'confirmed').length}{' '}
                        open
                      </StatusPill>
                    )}
                    <CategoryExportButtons
                      profile={profile}
                      taxYear={taxYear}
                      category={category}
                      onCreated={onReportsChanged}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card>
          <div className="fin-card-head-row">
            <span className="finance-section-label">Residency summary</span>
          </div>
          <span className="fin-table-sub">
            Tax year {taxYear} · human confirmation required
          </span>
          {/* ponytail: derived treaty heuristic — no treaty ruleset model exists yet. */}
          {profiles.filter((p) => p.tax_year === taxYear).length > 1 && (
            <p className="fin-treaty-note">
              <IconWarning /> Profiles exist in multiple jurisdictions for{' '}
              {taxYear} — income may be reportable in both. Treaty review with
              an adviser recommended before filing.
            </p>
          )}
          {residency.length === 0 ? (
            <p className="finance-muted">No residency facts recorded yet.</p>
          ) : (
            <div className="fin-residency-list">
              {residency.map((fact) => (
                <div key={fact.id} className="fin-residency-row">
                  <span>{fact.fact_type.replace(/_/g, ' ')}</span>
                  <StatusPill
                    tone={
                      fact.status === 'adviser_confirmed'
                        ? 'success'
                        : fact.status === 'disputed'
                          ? 'danger'
                          : 'neutral'
                    }
                  >
                    {fact.status.replace(/_/g, ' ')}
                  </StatusPill>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="fin-card-head-row">
            <span className="finance-section-label">Open questions</span>
            <StatusPill tone={openQuestions.length > 0 ? 'warning' : 'success'}>
              {openQuestions.length} unresolved
            </StatusPill>
          </div>
          {openQuestions.length === 0 ? (
            <p className="finance-muted">Nothing awaiting confirmation.</p>
          ) : (
            <div className="fin-question-list">
              {openQuestions.map((t) => (
                <OpenQuestionRow
                  key={t.id}
                  treatment={t}
                  onConfirmed={reloadTreatments}
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      <ReportsPanel
        profile={profile}
        reports={profileReports}
        taxYear={taxYear}
        onCreated={onReportsChanged}
      />
    </div>
  )
}

function EvidenceBundleCard({
  state,
  total,
  taxYear,
  jurisdiction,
}: {
  state: FinanceLoadState<FinanceEvidence[]>
  total: number
  taxYear: number
  jurisdiction: string | undefined
}) {
  if (state.status === 'loading') {
    return (
      <Card>
        <div className="skeleton finance-skeleton" />
      </Card>
    )
  }
  if (state.status === 'error') {
    return (
      <Card>
        <p className="finance-muted">{state.message}</p>
      </Card>
    )
  }
  if (state.status === 'empty') {
    return (
      <Card>
        <span className="finance-section-label">Evidence bundle</span>
        <h2>{state.empty_state.title}</h2>
        <p className="finance-muted">{state.empty_state.message}</p>
      </Card>
    )
  }
  const totalBytes = state.data.reduce((sum, doc) => sum + doc.size, 0)
  const folders = new Map<string, number>()
  for (const doc of state.data) {
    folders.set(doc.source_kind, (folders.get(doc.source_kind) ?? 0) + 1)
  }
  return (
    <Card>
      <div className="fin-card-head-row">
        <div>
          <span className="finance-section-label">Evidence bundle</span>
          <p className="fin-table-sub">All documents backing this tax year</p>
        </div>
        <div className="fin-chart-actions">
          <span className="fin-table-sub">
            Showing {state.data.length} of {total} · {formatBytes(totalBytes)}
          </span>
          <a
            className="fin-btn fin-btn-primary fin-btn-sm"
            href={financeEvidenceBundleUrl(taxYear, jurisdiction)}
            download
          >
            <IconDownload /> Download bundle (ZIP)
          </a>
        </div>
      </div>
      {folders.size > 0 && (
        <p className="fin-table-sub">
          Organized folders:{' '}
          {[...folders.entries()]
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([kind, count]) => `${kind.replace(/_/g, ' ')} (${count})`)
            .join(' · ')}
        </p>
      )}
      <div className="fin-table-wrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Source</th>
              <th>Size</th>
              <th>Linked events</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.data.map((doc) => (
              <tr key={doc.id}>
                <td className="fin-table-icon-cell">
                  <IconFile /> {doc.original_name}
                </td>
                <td>{doc.source_kind}</td>
                <td>{formatBytes(doc.size)}</td>
                <td>{doc.linked_event_revision_ids.length}</td>
                <td>
                  <StatusPill
                    tone={
                      doc.extraction_status === 'complete'
                        ? 'success'
                        : doc.extraction_status === 'failed'
                          ? 'danger'
                          : 'neutral'
                    }
                  >
                    {doc.extraction_status.replace(/_/g, ' ')}
                  </StatusPill>
                </td>
                <td>
                  <a href={doc.download_url} target="_blank" rel="noreferrer">
                    <IconDownload />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export function FinanceReports(props: FinanceTabProps) {
  const { reports, reload: reloadReports } = useAllReports()
  const { state: evidenceState, total: evidenceTotal } = useEvidenceVault()
  const summary = useFinanceSummary(
    props.taxYear,
    props.jurisdiction,
    props.refreshKey,
  )
  const [addJurisdictionOpen, setAddJurisdictionOpen] = useState(false)
  const jurisdictions = props.jurisdiction
    ? JURISDICTIONS.filter((j) => j.code === props.jurisdiction)
    : JURISDICTIONS

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

          {jurisdictions.map((jurisdiction) => (
            <JurisdictionCard
              key={jurisdiction.code}
              jurisdiction={
                jurisdiction as {
                  code: 'SE' | 'ES'
                  flag: string
                  label: string
                }
              }
              taxYear={props.taxYear}
              reports={reports}
              onReportsChanged={reloadReports}
            />
          ))}

          <EvidenceBundleCard
            state={evidenceState}
            total={evidenceTotal}
            taxYear={props.taxYear}
            jurisdiction={props.jurisdiction}
          />
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
