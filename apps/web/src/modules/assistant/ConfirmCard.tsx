import { useState } from 'react'
import type { PendingConfirmation } from './useAssistantChat'

type Props = {
  confirmation: PendingConfirmation
  onConfirm: (actionId: string) => Promise<void>
  onReject: (actionId: string) => Promise<void>
  onUndo: (actionId: string) => Promise<void>
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
  const busy =
    confirmation.status === 'applying' || confirmation.status === 'rejecting'

  if (confirmation.status === 'rejected') {
    return <p className="assistant-confirm-skipped">Skipped proposed change</p>
  }

  if (confirmation.status === 'undone') {
    return <p className="assistant-confirm-skipped">Change undone</p>
  }

  return (
    <section
      className="assistant-confirm-card"
      aria-label="Confirm proposed change"
    >
      <div className="assistant-confirm-label">Confirmation required</div>
      <strong>{previewText(confirmation.preview, confirmation.tool)}</strong>
      <span className="assistant-confirm-tool">
        {confirmation.tool.replaceAll('_', ' ')}
      </span>
      <details>
        <summary>Details</summary>
        <pre>{JSON.stringify(confirmation.preview, null, 2)}</pre>
      </details>
      {confirmation.status === 'executed' ? (
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
      ) : (
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
            onClick={() => onConfirm(confirmation.actionId)}
          >
            {confirmation.status === 'applying' ? 'Applying…' : 'Apply'}
          </button>
        </div>
      )}
    </section>
  )
}
