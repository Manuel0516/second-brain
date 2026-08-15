import { useState } from 'react'
import type { PendingConfirmation } from './useAssistantChat'

type Props = {
  confirmation: PendingConfirmation
  onConfirm: (
    actionId: string,
    secureArgs?: Record<string, string>,
  ) => Promise<void>
  onReject: (actionId: string) => Promise<void>
  onUndo: (actionId: string) => Promise<void>
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)
  ) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
    }
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function previewEntries(preview: unknown): [string, string][] {
  if (!preview || typeof preview !== 'object') return []
  return Object.entries(preview as Record<string, unknown>).map(
    ([key, value]) => [key.replaceAll('_', ' '), formatValue(value)],
  )
}

function previewText(preview: unknown, tool: string): string {
  if (typeof preview === 'string') return preview
  if (preview && typeof preview === 'object') {
    const record = preview as Record<string, unknown>
    for (const key of ['summary', 'description', 'title', 'name']) {
      if (typeof record[key] === 'string') return record[key]
    }
    const facts = Object.entries(record)
      .filter(([, value]) =>
        ['string', 'number', 'boolean'].includes(typeof value),
      )
      .slice(0, 4)
      .map(([key, value]) => `${key.replaceAll('_', ' ')}: ${String(value)}`)
    if (facts.length) {
      return `${tool.replaceAll('_', ' ')} — ${facts.join(', ')}`
    }
  }
  return `Apply the proposed ${tool.replaceAll('_', ' ')} change.`
}

export function ConfirmCard({
  confirmation,
  onConfirm,
  onReject,
  onUndo,
}: Props) {
  const [confirmUndo, setConfirmUndo] = useState(false)
  const [secureArgs, setSecureArgs] = useState<Record<string, string>>({})
  const busy =
    confirmation.status === 'applying' || confirmation.status === 'rejecting'
  const secureFields =
    confirmation.preview && typeof confirmation.preview === 'object'
      ? (((confirmation.preview as Record<string, unknown>)._secure_fields as
          | string[]
          | undefined) ?? [])
      : []

  if (confirmation.status === 'rejected') {
    return <p className="assistant-confirm-skipped">Skipped proposed change</p>
  }

  if (confirmation.status === 'undone') {
    return <p className="assistant-confirm-skipped">Change undone</p>
  }

  if (confirmation.status === 'executed') {
    return (
      <div className="assistant-confirm-applied">
        <span>✓ {previewText(confirmation.preview, confirmation.tool)}</span>
        <div className="assistant-undo">
          {confirmUndo ? (
            <>
              <span>Undo this change?</span>
              <button
                type="button"
                onClick={() => onUndo(confirmation.actionId)}
              >
                Yes, undo
              </button>
              <button type="button" onClick={() => setConfirmUndo(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmUndo(true)}>
              Undo
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <section
      className="assistant-confirm-card"
      aria-label="Confirm proposed change"
      data-action-id={confirmation.actionId}
    >
      <div className="assistant-confirm-label">Confirmation required</div>
      <strong>{previewText(confirmation.preview, confirmation.tool)}</strong>
      <span className="assistant-confirm-tool">
        {confirmation.tool.replaceAll('_', ' ')}
      </span>
      <details>
        <summary>Details</summary>
        {previewEntries(confirmation.preview).length ? (
          <dl className="assistant-confirm-details">
            {previewEntries(confirmation.preview).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <pre>{JSON.stringify(confirmation.preview, null, 2)}</pre>
        )}
      </details>
      {secureFields.map((field) => (
        <label className="assistant-secure-field" key={field}>
          <span>{field.replaceAll('_', ' ')}</span>
          <input
            type="password"
            autoComplete="off"
            value={secureArgs[field] ?? ''}
            onChange={(event) =>
              setSecureArgs((current) => ({
                ...current,
                [field]: event.target.value,
              }))
            }
          />
        </label>
      ))}
      <div className="assistant-confirm-actions">
        <button
          className="assistant-secondary-button"
          type="button"
          disabled={busy}
          onClick={() => onReject(confirmation.actionId)}
        >
          {confirmation.status === 'rejecting' ? 'Rejecting…' : 'Reject'}
        </button>
        <button
          className="assistant-primary-button"
          type="button"
          disabled={busy}
          onClick={() => onConfirm(confirmation.actionId, secureArgs)}
        >
          {confirmation.status === 'applying' ? 'Applying…' : 'Apply'}
        </button>
      </div>
    </section>
  )
}
