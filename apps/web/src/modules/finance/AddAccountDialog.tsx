import { useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Field } from '../../components/Field'
import { useDialogFocus } from '../../components/useDialogFocus'
import { createFinanceAccount } from './api'
import { JURISDICTIONS } from './navigation'
import type { FinanceAccount, FinanceAccountType } from './types'

const ACCOUNT_TYPES: FinanceAccountType[] = [
  'bank',
  'broker',
  'exchange',
  'wallet',
  'bot',
  'cash',
]

/** Creates a source account — bank, broker, exchange, wallet, bot or cash. */
export function AddAccountDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: (account: FinanceAccount) => void
}) {
  const [name, setName] = useState('')
  const [institution, setInstitution] = useState('')
  const [accountType, setAccountType] = useState<FinanceAccountType>('exchange')
  const [countryCode, setCountryCode] = useState('SE')
  const [currency, setCurrency] = useState('EUR')
  const [jurisdiction, setJurisdiction] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocus({ open: true, dialogRef, onEscape: onClose })
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim() || !institution.trim()) {
      setError('Name and institution are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { account } = await createFinanceAccount(
        {
          name: name.trim(),
          institution: institution.trim(),
          account_type: accountType,
          country_code: countryCode.trim().toUpperCase(),
          base_currency: currency.trim().toUpperCase(),
          tax_jurisdiction: jurisdiction || null,
          provider: 'manual',
          external_reference: null,
          opened_at: null,
        },
        idempotencyKey,
      )
      onSaved(account)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the account')
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
        <h3 id={titleId}>Add account</h3>
        <form className="fin-import-form" onSubmit={submit}>
          <div className="fin-form-grid">
            <Field label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Kraken staking"
                required
              />
            </Field>
            <Field label="Institution">
              <input
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="Kraken"
                required
              />
            </Field>
            <Field label="Type">
              <select
                value={accountType}
                onChange={(e) =>
                  setAccountType(e.target.value as FinanceAccountType)
                }
              >
                {ACCOUNT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Country">
              <input
                className="finance-mono"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                placeholder="SE"
                maxLength={2}
                required
              />
            </Field>
            <Field label="Base currency">
              <input
                className="finance-mono"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                placeholder="EUR"
                maxLength={3}
                required
              />
            </Field>
            <Field label="Tax jurisdiction">
              <select
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
              >
                <option value="">None</option>
                {JURISDICTIONS.map((j) => (
                  <option key={j.code} value={j.code}>
                    {j.label}
                  </option>
                ))}
              </select>
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
              {saving ? 'Saving…' : 'Add account'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
