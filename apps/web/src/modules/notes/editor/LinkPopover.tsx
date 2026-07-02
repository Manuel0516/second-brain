import { useEffect, useRef, useState, type FormEvent } from 'react'

interface LinkPopoverProps {
  initialHref: string
  onApply: (href: string) => void
  onRemove?: () => void
  onCancel: () => void
}

function normalizeHref(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const href =
    /^[a-z][a-z\d+.-]*:/i.test(trimmed) ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('#')
      ? trimmed
      : `https://${trimmed}`
  try {
    const protocol = new URL(href, window.location.origin).protocol
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(protocol) ||
      href.startsWith('#')
      ? href
      : null
  } catch {
    return null
  }
}

export function LinkPopover({
  initialHref,
  onApply,
  onRemove,
  onCancel,
}: LinkPopoverProps) {
  const [href, setHref] = useState(initialHref)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => inputRef.current?.focus(), [])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const normalized = normalizeHref(href)
    if (!normalized) {
      setError('Enter a valid web, email, phone, or page link.')
      return
    }
    onApply(normalized)
  }

  return (
    <form
      className="notes-link-popover"
      aria-label="Edit link"
      onSubmit={submit}
    >
      <label>
        <span>Link URL</span>
        <input
          ref={inputRef}
          aria-label="Link URL"
          value={href}
          placeholder="https://example.com"
          onChange={(event) => {
            setHref(event.target.value)
            setError('')
          }}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape') onCancel()
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="notes-link-actions">
        {onRemove && (
          <button type="button" className="danger" onClick={onRemove}>
            Remove
          </button>
        )}
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary">
          Apply
        </button>
      </div>
    </form>
  )
}
