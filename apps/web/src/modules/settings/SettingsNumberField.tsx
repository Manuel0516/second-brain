import { useEffect, useRef, useState } from 'react'

interface SettingsNumberFieldProps {
  id: string
  label: string
  value: number | null
  onCommit: (value: number | null) => void
  min?: number
  max?: number
  step?: number
  /** Non-editable unit shown after the input, e.g. "kcal", "g", "seconds". */
  suffix?: string
  /** Empty commits to null instead of being rejected as invalid. */
  nullable?: boolean
}

function formatValue(value: number | null): string {
  return value == null ? '' : String(value)
}

/**
 * Settings number input with a local text draft: typing never PATCHes, only
 * blur/Enter commits, and Escape reverts to the last committed value. Used
 * by every Food/Fitness number setting instead of a bare `<input>` that
 * PATCHes on every keystroke.
 */
export function SettingsNumberField({
  id,
  label,
  value,
  onCommit,
  min,
  max,
  step,
  suffix,
  nullable = false,
}: SettingsNumberFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const committedRef = useRef(value)
  const [draft, setDraft] = useState(formatValue(value))

  useEffect(() => {
    committedRef.current = value
    if (document.activeElement !== inputRef.current) {
      setDraft(formatValue(value))
    }
  }, [value])

  function resetDraft() {
    setDraft(formatValue(committedRef.current))
  }

  function commit() {
    const raw = draft.trim()
    if (raw === '') {
      if (nullable) {
        if (committedRef.current !== null) {
          committedRef.current = null
          onCommit(null)
        }
      } else {
        inputRef.current?.reportValidity()
        resetDraft()
      }
      return
    }
    const parsed = Number(raw)
    const invalid =
      !Number.isFinite(parsed) ||
      (min != null && parsed < min) ||
      (max != null && parsed > max)
    if (invalid) {
      inputRef.current?.reportValidity()
      resetDraft()
      return
    }
    if (parsed !== committedRef.current) {
      committedRef.current = parsed
      onCommit(parsed)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    } else if (event.key === 'Escape') {
      resetDraft()
    }
  }

  return (
    <label className="cal-field settings-number-field" htmlFor={id}>
      {label}
      <span className="settings-number-input">
        <input
          ref={inputRef}
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          required={!nullable}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
        />
        {suffix && <span className="settings-number-suffix">{suffix}</span>}
      </span>
    </label>
  )
}
