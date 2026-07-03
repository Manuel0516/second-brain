import { useEffect, useRef, useState } from 'react'

interface EmojiPickerProps {
  icon: string
  onChange: (icon: string) => void
  presets: string[]
  label?: string
  onOpenChange?: (open: boolean) => void
}

export function EmojiPicker({
  icon,
  onChange,
  presets,
  label = 'icon',
  onOpenChange,
}: EmojiPickerProps) {
  const [open, setOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const toggle = (next: boolean) => {
    setOpen(next)
    onOpenChange?.(next)
  }

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
        onOpenChange?.(false)
      }
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open, onOpenChange])

  const pick = (value: string) => {
    onChange(value)
    toggle(false)
  }

  const clear = () => {
    onChange('')
    toggle(false)
  }

  return (
    <div className="editor-icon-picker" ref={pickerRef}>
      <button
        type="button"
        className="editor-icon-trigger"
        aria-label={`Choose ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => toggle(!open)}
      >
        {icon ? (
          <span className="event-icon-glyph" aria-hidden="true">
            {icon}
          </span>
        ) : (
          <svg
            className="editor-icon-empty"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M8.5 14.5a4 4 0 0 0 7 0" />
            <path d="M9 9.5h.01M15 9.5h.01" />
          </svg>
        )}
      </button>
      {open && (
        <div
          className="editor-icon-popover"
          role="dialog"
          aria-label={`${label} picker`}
        >
          <div className="editor-icon-grid">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`editor-icon-choice ${icon === preset ? 'active' : ''}`}
                aria-pressed={icon === preset}
                onClick={() => pick(preset)}
              >
                {preset}
              </button>
            ))}
          </div>
          <input
            className="editor-icon-custom"
            aria-label="Custom icon — type or paste any emoji or Nerd Font glyph"
            placeholder="Type or paste emoji / glyph…"
            inputMode="text"
            title="macOS: Ctrl+Cmd+Space for emoji picker"
            value={icon}
            onChange={(e) => onChange(e.target.value.slice(0, 32))}
          />
          {icon && (
            <button type="button" className="editor-icon-clear" onClick={clear}>
              Remove icon
            </button>
          )}
        </div>
      )}
    </div>
  )
}
