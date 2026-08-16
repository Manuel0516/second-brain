import { useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Field } from '../../components/Field'
import { useDialogFocus } from '../../components/useDialogFocus'
import { createFinanceResidencyFact, createFinanceTaxProfile } from './api'

// ponytail: backend Literals gate the list — widen both sides together for jurisdiction #3.
const COUNTRIES: Array<{ code: 'SE' | 'ES'; label: string }> = [
  { code: 'SE', label: 'Sweden' },
  { code: 'ES', label: 'Spain' },
]

/** Creates a tax profile + an initial residency-status fact for the chosen jurisdiction. */
export function AddJurisdictionDialog({
  taxYear,
  onClose,
  onSaved,
}: {
  taxYear: number
  onClose: () => void
  onSaved: () => void
}) {
  const [code, setCode] = useState<'SE' | 'ES'>('SE')
  const [residency, setResidency] = useState<'resident' | 'non_resident'>(
    'resident',
  )
  const [currency, setCurrency] = useState('EUR')
  const [daysPresent, setDaysPresent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocus({ open: true, dialogRef, onEscape: onClose })
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const { profile } = await createFinanceTaxProfile(
        {
          tax_year: taxYear,
          jurisdiction: code,
          reporting_currency: currency.trim().toUpperCase(),
          materiality_threshold: '0',
          reconciliation_tolerance: '0',
          status: 'active',
        },
        idempotencyKey,
      )
      await createFinanceResidencyFact(
        profile.id,
        {
          fact_type: 'residency_status',
          period_start: `${taxYear}-01-01`,
          period_end: `${taxYear}-12-31`,
          value: {
            status: residency,
            ...(daysPresent !== ''
              ? { days_present: Number(daysPresent) }
              : {}),
          },
          evidence_document_ids: [],
          source: 'manual',
          notes: null,
        },
        crypto.randomUUID(),
      )
      onSaved()
      onClose()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not add the jurisdiction',
      )
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
      <div className="scope-card fin-record-modal" ref={dialogRef}>
        <h3 id={titleId}>Add jurisdiction</h3>
        <form className="fin-import-form" onSubmit={submit}>
          <div className="fin-form-grid">
            <Field label="Country">
              <select
                value={code}
                onChange={(e) => setCode(e.target.value as 'SE' | 'ES')}
              >
                {COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Residency status">
              <select
                value={residency}
                onChange={(e) =>
                  setResidency(e.target.value as 'resident' | 'non_resident')
                }
              >
                <option value="resident">Resident</option>
                <option value="non_resident">Non-resident</option>
              </select>
            </Field>
            <Field label="Reporting currency">
              <input
                className="finance-mono"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                maxLength={8}
                required
              />
            </Field>
            <Field label={`Days present in ${taxYear}`}>
              <input
                type="number"
                min={0}
                max={366}
                value={daysPresent}
                onChange={(e) => setDaysPresent(e.target.value)}
                placeholder="Optional"
              />
            </Field>
          </div>

          {error && <p className="fin-form-error">{error}</p>}

          <div className="fin-modal-actions">
            <button
              type="button"
              className="fin-btn fin-btn-ghost"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="fin-btn fin-btn-primary"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Add jurisdiction'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
