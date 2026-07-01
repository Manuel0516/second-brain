import { createPortal } from 'react-dom'

interface ConfirmDialogProps {
  message: string
  /** Optional explanation below the title */
  detail?: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  /** Show the confirm button in danger red — default true */
  danger?: boolean
  open: boolean
}

/**
 * Confirmation dialog — the `.scope-prompt` / `.scope-card` pattern.
 *
 * Portalled to `document.body`. Covers the entire viewport with a backdrop
 * and a centered card asking for confirmation before a destructive action.
 */
export function ConfirmDialog({
  message,
  detail,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
  danger = true,
  open,
}: ConfirmDialogProps) {
  if (!open) return null
  return createPortal(
    <div
      className="scope-prompt"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="scope-card">
        <h3 id="confirm-dialog-title">{message}</h3>
        {detail && <p>{detail}</p>}
        <div
          className="cal-card-actions"
          style={{ marginTop: detail ? 0 : 14 }}
        >
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? 'danger' : 'primary'}
            style={
              danger
                ? {
                    borderColor: 'rgba(217,87,63,0.35)',
                    background: 'rgba(217,87,63,0.1)',
                  }
                : undefined
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
