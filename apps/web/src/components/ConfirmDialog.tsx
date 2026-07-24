import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useDialogFocus } from './useDialogFocus'

interface ConfirmDialogProps {
  message: string
  /** Optional explanation below the title */
  detail?: string
  confirmLabel?: string
  cancelLabel?: string
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
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  danger = true,
  open,
}: ConfirmDialogProps) {
  const titleId = useId()
  const detailId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useDialogFocus({
    open,
    dialogRef,
    initialFocusRef: danger ? cancelRef : confirmRef,
    onEscape: onCancel,
  })

  if (!open) return null
  return createPortal(
    <div
      className="scope-prompt"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={detail ? detailId : undefined}
    >
      <div className="scope-card" ref={dialogRef}>
        <h3 id={titleId}>{message}</h3>
        {detail && <p id={detailId}>{detail}</p>}
        <div
          className="cal-card-actions"
          style={{ marginTop: detail ? 0 : 14 }}
        >
          <button
            type="button"
            className="ghost"
            ref={cancelRef}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'danger' : 'primary'}
            ref={confirmRef}
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
