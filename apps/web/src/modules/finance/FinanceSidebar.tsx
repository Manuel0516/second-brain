import { useEffect, useState } from 'react'
import { IconButton } from '../../components/IconButton'
import { fetchFinanceSummary } from './api'
import { readinessPercent } from './format'
import {
  IconChevronRight,
  IconClose,
  IconWarning,
  JurisdictionList,
  RingProgress,
  SidebarYearBlock,
} from './primitives'
import type { FinanceLoadState, FinanceSummary } from './types'

/** The sidebar's own X — matches Food/Fitness's `sidebar-close` pattern. */
export function FinanceSidebarClose({ onClose }: { onClose: () => void }) {
  return (
    <IconButton
      icon={<IconClose />}
      label="Close navigation"
      onClick={onClose}
      size="md"
      className="sidebar-close"
    />
  )
}

/** Shared across all three tabs — the left rail is global finance context, not page-specific. */
export function useFinanceSummary(
  taxYear: number,
  jurisdiction: string | undefined,
  refreshKey: number,
) {
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
  }, [taxYear, jurisdiction, refreshKey])
  return summary
}

/**
 * The finance left rail — This year / Jurisdictions / Readiness / Warnings.
 * Identical on Overview, Review and Reports; it is global finance status, not
 * page-specific content, so it never swaps out per tab.
 */
export function FinanceSidebarContent({
  taxYear,
  onTaxYearChange,
  summary,
  jurisdiction,
  onJurisdictionChange,
  onAddJurisdiction,
  onOpenReview,
}: {
  taxYear: number
  onTaxYearChange: (year: number) => void
  summary: FinanceLoadState<FinanceSummary>
  jurisdiction: string | undefined
  onJurisdictionChange: (code: string | undefined) => void
  onAddJurisdiction: () => void
  onOpenReview: () => void
}) {
  const ready = summary.status === 'ready' ? summary.data : null
  return (
    <>
      <SidebarYearBlock taxYear={taxYear} onChange={onTaxYearChange} />
      <JurisdictionList
        jurisdiction={jurisdiction}
        onChange={onJurisdictionChange}
        onAdd={onAddJurisdiction}
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
            <button
              type="button"
              className="fin-sidebar-link"
              onClick={onOpenReview}
            >
              Complete your review to increase accuracy.
              <IconChevronRight />
            </button>
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
                <button
                  type="button"
                  className="fin-warning-row"
                  onClick={onOpenReview}
                >
                  <IconWarning />
                  <span>
                    <strong>
                      {ready.counts.pending_review_groups} unreviewed rewards
                    </strong>
                    <span>Review in queue</span>
                  </span>
                  <IconChevronRight />
                </button>
              )}
              {ready.counts.missing_evidence > 0 && (
                <button
                  type="button"
                  className="fin-warning-row"
                  onClick={onOpenReview}
                >
                  <IconWarning />
                  <span>
                    <strong>
                      {ready.counts.missing_evidence} missing documents
                    </strong>
                    <span>Add to improve readiness</span>
                  </span>
                  <IconChevronRight />
                </button>
              )}
              <button
                type="button"
                className="fin-sidebar-link"
                onClick={onOpenReview}
              >
                View all warnings
                <IconChevronRight />
              </button>
            </div>
          </div>
        )}
    </>
  )
}
