import { useEffect, useRef, useState } from 'react'
import { Popover } from './Popover'

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
 * Trigger styled like a `.cal-field` input; options render in a portalled
 * `Popover` so they never clip inside scroll containers.
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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = options.find((option) => option.value === value)
  const selectedIndex = selected ? options.indexOf(selected) : -1

  const close = () => {
    setOpen(false)
    setFocusedIndex(-1)
    triggerRef.current?.focus()
  }

  // Focus the selected option when opening.
  useEffect(() => {
    if (open && listRef.current) {
      const index = selectedIndex >= 0 ? selectedIndex : 0
      setFocusedIndex(index)
      const child = listRef.current.children[index] as HTMLElement | undefined
      child?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const select = (option: DropdownOption<V>) => {
    onChange(option.value)
    close()
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
      case 'Home':
        event.preventDefault()
        setFocusedIndex(0)
        break
      case 'End':
        event.preventDefault()
        setFocusedIndex(options.length - 1)
        break
      case 'Enter':
        event.preventDefault()
        if (focusedIndex >= 0 && focusedIndex < options.length) {
          select(options[focusedIndex])
        }
        break
      case 'Escape':
        event.preventDefault()
        close()
        break
    }
  }

  // Keep the focused option visible + focused as arrows move.
  useEffect(() => {
    if (!open || !listRef.current || focusedIndex < 0) return
    const child = listRef.current.children[focusedIndex] as
      | HTMLElement
      | undefined
    child?.focus()
    child?.scrollIntoView?.({ block: 'nearest' })
  }, [focusedIndex, open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`dropdown-trigger${className ? ` ${className}` : ''}`}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={onKeyDown}
      >
        <span
          className={`dropdown-trigger-label${selected ? '' : ' placeholder'}`}
        >
          {selected?.label ?? placeholder}
        </span>
        <svg
          className="dropdown-chevron"
          width="12"
          height="12"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M5 7.5l5 5 5-5" />
        </svg>
      </button>
      <Popover
        anchorRef={triggerRef}
        open={open}
        onClose={close}
        className="dropdown-popover"
        matchAnchorWidth
        ariaLabel={ariaLabel}
      >
        <div
          className="dropdown-list"
          ref={listRef}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={onKeyDown}
        >
          {options.map((option, index) => {
            const active = option.value === value
            return (
              <button
                key={String(option.value)}
                type="button"
                role="option"
                aria-selected={active}
                tabIndex={-1}
                className={`dropdown-option${active ? ' active' : ''}${focusedIndex === index ? ' focused' : ''}`}
                onClick={() => select(option)}
                onMouseEnter={() => setFocusedIndex(index)}
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
      </Popover>
    </>
  )
}
