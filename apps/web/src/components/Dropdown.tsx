import { useEffect, useRef, useState } from 'react'

export interface DropdownOption<V = string> {
  value: V
  label: string
}

interface DropdownProps<V = string> {
  options: DropdownOption<V>[]
  value: V
  onChange: (value: V) => void
  ariaLabel: string
  className?: string
  placeholder?: string
}

/**
 * Custom dropdown — replaces native `<select>`.
 *
 * Renders a styled trigger button (matching `.cal-field` input language)
 * and an absolute-positioned popover that sticks to the input on scroll.
 */
export function Dropdown<V = string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = '',
  placeholder = '',
}: DropdownProps<V>) {
  const [open, setOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [flipRight, setFlipRight] = useState(false)
  const [flipUp, setFlipUp] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)
  const selectedIndex = selected ? options.indexOf(selected) : -1

  // Outside click
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  // Focus first selected option when opening
  useEffect(() => {
    if (open && listRef.current) {
      const idx = selectedIndex >= 0 ? selectedIndex : 0
      setFocusedIndex(idx)
      const child = listRef.current.children[idx] as HTMLElement | undefined
      child?.focus()
    }
  }, [open, selectedIndex])

  const toggle = () => {
    setOpen((prev) => {
      if (!prev) {
        requestAnimationFrame(() => {
          const rect = triggerRef.current?.getBoundingClientRect()
          if (!rect) return
          const estimatedHeight = Math.min(options.length * 38 + 12, 270)
          const pw = Math.min(Math.max(rect.width, 180), 320)
          setFlipRight(rect.left + pw > window.innerWidth - 16)
          setFlipUp(rect.bottom + estimatedHeight > window.innerHeight - 8)
        })
      }
      if (prev) setFocusedIndex(-1)
      return !prev
    })
  }

  const select = (option: DropdownOption<V>) => {
    onChange(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (event.key === 'Enter' || event.key === 'ArrowDown') {
        event.preventDefault()
        setOpen(true)
      }
      return
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setFocusedIndex((prev) => Math.min(prev + 1, options.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setFocusedIndex((prev) => Math.max(prev - 1, 0))
        break
      case 'Enter':
        event.preventDefault()
        if (focusedIndex >= 0 && focusedIndex < options.length) {
          select(options[focusedIndex])
        }
        break
      case 'Escape':
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
        break
    }
  }

  // Scroll focused option into view
  useEffect(() => {
    if (!open || !listRef.current) return
    const child = listRef.current.children[focusedIndex] as
      | HTMLElement
      | undefined
    child?.scrollIntoView({ block: 'nearest' })
  }, [focusedIndex, open])

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={className}
        onClick={toggle}
        onKeyDown={onKeyDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          minHeight: 38,
          width: '100%',
          padding: '8px 10px',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--r-md)',
          background: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          font: '400 13px var(--font-ui)',
          textTransform: 'none',
          letterSpacing: 'normal',
          cursor: 'pointer',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: selected ? 'var(--text-primary)' : 'var(--text-tertiary)',
          }}
        >
          {selected?.label ?? placeholder}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
          style={{
            flex: '0 0 auto',
            color: 'var(--text-tertiary)',
            transition: 'transform 0.14s',
            transform: open ? 'rotate(180deg)' : undefined,
          }}
        >
          <path d="M5 7.5l5 5 5-5" />
        </svg>
      </button>
      {open && (
        <div
          ref={popoverRef}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={0}
          style={{
            position: 'absolute',
            zIndex: 120,
            top: flipUp ? undefined : 'calc(100% + 4px)',
            bottom: flipUp ? 'calc(100% + 4px)' : undefined,
            left: flipRight ? undefined : 0,
            right: flipRight ? 0 : undefined,
            minWidth: '100%',
            maxWidth: 'min(320px, 90vw)',
            maxHeight: 260,
            display: 'grid',
            gap: 2,
            padding: 6,
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--r-lg)',
            background: 'var(--bg-elevated)',
            boxShadow: 'var(--shadow-md)',
            overflow: 'auto',
            animation: 'popIn 120ms ease-out both',
          }}
          onKeyDown={onKeyDown}
        >
          {options.map((option, index) => {
            const active = option.value === value
            return (
              <button
                key={String(option.value)}
                ref={index === focusedIndex ? (el) => el?.focus() : undefined}
                type="button"
                role="option"
                aria-selected={active}
                tabIndex={-1}
                onClick={() => select(option)}
                onMouseEnter={() => setFocusedIndex(index)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  minHeight: 32,
                  padding: '6px 10px',
                  border: 0,
                  borderRadius: 'var(--r-sm)',
                  background:
                    focusedIndex === index ? 'var(--bg-raised)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'background 0.12s, color 0.12s',
                }}
              >
                <span>{option.label}</span>
                {active && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M4 10.5l4 4 8-8" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
