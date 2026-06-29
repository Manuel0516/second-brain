/**
 * Segmented control with a single highlight that slides between options
 * (instead of the background snapping). Equal-width options.
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
      {options.map((option) => {
        const active = value === option
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            className={active ? 'active' : ''}
            onClick={() => onChange(option)}
          >
            {labels?.[option] ?? option}
          </button>
        )
      })}
    </div>
  )
}
