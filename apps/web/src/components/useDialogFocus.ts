import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Elements like the meal-log modal's hidden file inputs match the selector
 * above but are never reachable by Tab — exclude anything `hidden`. */
function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => !el.hasAttribute('hidden') && !el.closest('[hidden]'))
}

interface DialogFocusOptions {
  open: boolean
  dialogRef: RefObject<HTMLElement | null>
  /** Focused first when the dialog opens; falls back to the first focusable element. */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** Called when Escape is pressed — the caller decides whether that means close. */
  onEscape?: () => void
}

/**
 * Shared modal behavior for ConfirmDialog, LogPastModal, and MealLogModal:
 * focuses into the dialog on open, traps Tab/Shift+Tab, routes Escape through
 * the caller's close policy, restores focus to the opener on close, and
 * locks body scroll for as long as the dialog is open.
 */
export function useDialogFocus({
  open,
  dialogRef,
  initialFocusRef,
  onEscape,
}: DialogFocusOptions) {
  const onEscapeRef = useRef(onEscape)
  useEffect(() => {
    onEscapeRef.current = onEscape
  })

  useEffect(() => {
    if (!open) return

    const opener = document.activeElement as HTMLElement | null
    const focusTarget =
      initialFocusRef?.current ??
      (dialogRef.current && getFocusable(dialogRef.current)[0])
    focusTarget?.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onEscapeRef.current?.()
        return
      }
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = getFocusable(dialog)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      opener?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}
