import { useRef } from 'react'

/**
 * Segmented control with a single highlight that slides between options
 * (instead of the background snapping). Equal-width options.
 *
 * Follows radio-group keyboard conventions: one tab stop (the checked
 * option), Left/Right/Up/Down move and select with wrap-around, Home/End
 * jump to the first/last option.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  labels,
  ariaLabel,
}: {
  value: T
  options: T[]
  onChange: (value: T) => void
  labels?: Record<string, string>
  ariaLabel?: string
}) {
  const index = Math.max(0, options.indexOf(value))
  const count = options.length
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])

  function selectAt(i: number) {
    onChange(options[i])
    buttonRefs.current[i]?.focus()
  }

  function handleKeyDown(event: React.KeyboardEvent, i: number) {
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault()
        selectAt((i - 1 + count) % count)
        break
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault()
        selectAt((i + 1) % count)
        break
      case 'Home':
        event.preventDefault()
        selectAt(0)
        break
      case 'End':
        event.preventDefault()
        selectAt(count - 1)
        break
    }
  }

  return (
    <div className="repeat-segmented" role="radiogroup" aria-label={ariaLabel}>
      <span
        className="seg-indicator"
        aria-hidden="true"
        style={{
          left: `calc(3px + ${index} * (100% - 6px) / ${count})`,
          width: `calc((100% - 6px) / ${count})`,
        }}
      />
      {options.map((option, i) => {
        const active = value === option
        return (
          <button
            key={option}
            ref={(el) => {
              buttonRefs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            className={active ? 'active' : ''}
            onClick={() => onChange(option)}
            onKeyDown={(event) => handleKeyDown(event, i)}
          >
            {labels?.[option] ?? option}
          </button>
        )
      })}
    </div>
  )
}
