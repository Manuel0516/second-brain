import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Field } from '../../components/Field'
import { useDialogFocus } from '../../components/useDialogFocus'
import { AddAccountDialog } from './AddAccountDialog'
import {
  createFinanceEvent,
  fetchFinanceAccounts,
  patchFinanceEvent,
} from './api'
import { IconPlus } from './primitives'
import type { DecimalString, FinanceAccount, FinanceEventType } from './types'

const DECIMAL_RE = /^-?[0-9]+(\.[0-9]+)?$/

const EVENT_TYPES: FinanceEventType[] = [
  'income',
  'expense',
  'transfer',
  'trade',
  'staking_reward',
  'interest',
  'dividend',
  'fee',
  'withholding',
  'other',
]

const JURISDICTION_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'SE', label: 'Sweden' },
  { value: 'ES', label: 'Spain' },
]

export interface AddRecordEdit {
  eventId: string
  expectedRevisionId: string
  initial: {
    occurred_at: string
    event_type: FinanceEventType
    amount: DecimalString
    currency: string
    source_account_id: string
    description: string
    jurisdiction: string | null
  }
}

/** Manual "Add record" dialog — also serves as the edit form (append-revision) for manual events. */
export function AddRecordDialog({
  taxYear,
  edit,
  onClose,
  onSaved,
}: {
  taxYear: number
  edit?: AddRecordEdit
  onClose: () => void
  onSaved: () => void
}) {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [date, setDate] = useState(
    edit ? edit.initial.occurred_at.slice(0, 10) : `${taxYear}-01-01`,
  )
  const [eventType, setEventType] = useState<FinanceEventType>(
    edit?.initial.event_type ?? 'income',
  )
  const [amount, setAmount] = useState(edit?.initial.amount ?? '')
  const [currency, setCurrency] = useState(edit?.initial.currency ?? '')
  const [accountId, setAccountId] = useState(
    edit?.initial.source_account_id ?? '',
  )
  const [description, setDescription] = useState(
    edit?.initial.description ?? '',
  )
  const [jurisdiction, setJurisdiction] = useState(
    edit?.initial.jurisdiction ?? '',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addAccountOpen, setAddAccountOpen] = useState(false)

  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocus({ open: true, dialogRef, onEscape: onClose })

  // One idempotency key per dialog open — stable across retries of this submit.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [])

  useEffect(() => {
    void fetchFinanceAccounts({ limit: 200 }).then((page) => {
      setAccounts(page.items)
      const first = page.items[0]
      if (first) {
        setAccountId((prev) => prev || first.id)
        // Default currency/jurisdiction from the account, unless editing or already typed.
        if (!edit) {
          setCurrency((prev) => prev || first.base_currency)
          setJurisdiction((prev) => prev || (first.tax_jurisdiction ?? ''))
        }
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once per dialog open
  }, [])

  function selectAccount(id: string) {
    setAccountId(id)
    const account = accounts.find((a) => a.id === id)
    if (account && !edit) {
      setCurrency(account.base_currency)
      setJurisdiction(account.tax_jurisdiction ?? '')
    }
  }

  const amountValid = DECIMAL_RE.test(amount.trim())

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!accountId) {
      setError('An account is required.')
      return
    }
    if (!amountValid) {
      setError('Amount must be a plain decimal, e.g. 1240.50')
      return
    }
    setSaving(true)
    setError(null)
    // ponytail: date-only input sent as midday UTC — same local tax day in SE/ES;
    // switch to datetime-local if intra-day time ever matters for manual records.
    const occurredAt = `${date}T12:00:00Z`
    try {
      if (edit) {
        await patchFinanceEvent(
          edit.eventId,
          {
            expected_revision_id: edit.expectedRevisionId,
            occurred_at: occurredAt,
            event_type: eventType,
            amount: amount.trim(),
            currency: currency.trim().toUpperCase(),
            source_account_id: accountId,
            description,
            jurisdiction: jurisdiction || null,
          },
          idempotencyKey,
        )
      } else {
        await createFinanceEvent(
          {
            tax_year: taxYear,
            occurred_at: occurredAt,
            event_type: eventType,
            amount: amount.trim(),
            currency: currency.trim().toUpperCase(),
            source_account_id: accountId,
            description,
            jurisdiction: jurisdiction || null,
            asset_id: null,
          },
          idempotencyKey,
        )
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the record')
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
        <h3 id={titleId}>{edit ? 'Edit record' : 'Add record'}</h3>
        <form className="fin-import-form" onSubmit={submit}>
          <div className="fin-form-grid">
            <Field label="Date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </Field>
            <Field label="Type">
              <select
                value={eventType}
                onChange={(e) =>
                  setEventType(e.target.value as FinanceEventType)
                }
              >
                {EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount">
              <input
                className="finance-mono"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1240.50"
                aria-invalid={amount !== '' && !amountValid}
                required
              />
            </Field>
            <Field label="Currency">
              <input
                className="finance-mono"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                placeholder="EUR"
                maxLength={8}
                required
              />
            </Field>
            <Field label="Account">
              <div className="fin-select-with-action">
                <select
                  value={accountId}
                  onChange={(e) => selectAccount(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="fin-side-add"
                  aria-label="Add account"
                  onClick={() => setAddAccountOpen(true)}
                >
                  <IconPlus />
                </button>
              </div>
            </Field>
            <Field label="Jurisdiction">
              <select
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
              >
                {JURISDICTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Description">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="University salary"
              required
            />
          </Field>

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
              disabled={saving || accounts.length === 0}
            >
              {saving ? 'Saving…' : edit ? 'Save changes' : 'Add record'}
            </button>
          </div>
          {accounts.length === 0 && (
            <p className="finance-muted">
              No accounts yet — use the + next to Account to add one.
            </p>
          )}
        </form>
      </div>
      {addAccountOpen && (
        <AddAccountDialog
          onClose={() => setAddAccountOpen(false)}
          onSaved={(account) => {
            setAccounts((prev) => [...prev, account])
            setAccountId(account.id)
            if (!edit) {
              setCurrency(account.base_currency)
              setJurisdiction(account.tax_jurisdiction ?? '')
            }
          }}
        />
      )}
    </div>,
    document.body,
  )
}
