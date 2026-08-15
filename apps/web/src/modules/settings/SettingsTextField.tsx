import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

interface SettingsTextFieldProps {
  id: string
  label: string
  value: string
  onCommit: (value: string) => void
  multiline?: boolean
  /** Distinct "procedure/prompt" treatment — monospace, raised background. */
  prompt?: boolean
}

export interface SettingsTextFieldHandle {
  /** Commit the current draft immediately (e.g. from an external Save button). */
  commit: () => void
}

/**
 * Settings text input with a local draft: typing never PATCHes, only blur
 * (or Enter, single-line only) commits, and Escape reverts to the last
 * committed value. Same idiom as SettingsNumberField, for string fields.
 */
export const SettingsTextField = forwardRef<
  SettingsTextFieldHandle,
  SettingsTextFieldProps
>(function SettingsTextField(
  { id, label, value, onCommit, multiline = false, prompt = false },
  ref,
) {
  const [draft, setDraft] = useState(value)
  const committedRef = useRef(value)
  const focusedRef = useRef(false)

  useImperativeHandle(ref, () => ({ commit }))

  useEffect(() => {
    committedRef.current = value
    if (!focusedRef.current) setDraft(value)
  }, [value])

  function resetDraft() {
    setDraft(committedRef.current)
  }

  function commit() {
    const trimmed = draft.trim()
    if (!trimmed) {
      resetDraft()
      return
    }
    if (trimmed !== committedRef.current) {
      committedRef.current = trimmed
      onCommit(trimmed)
    }
    setDraft(trimmed)
  }

  const sharedProps = {
    id,
    value: draft,
    onFocus: () => {
      focusedRef.current = true
    },
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setDraft(event.target.value),
    onBlur: () => {
      focusedRef.current = false
      commit()
    },
  }

  return (
    <label
      className={`cal-field${prompt ? ' settings-prompt-field' : ''}`}
      htmlFor={id}
    >
      {label}
      {multiline ? (
        <textarea
          {...sharedProps}
          onKeyDown={(event) => {
            if (event.key === 'Escape') resetDraft()
          }}
        />
      ) : (
        <input
          {...sharedProps}
          type="text"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            } else if (event.key === 'Escape') {
              resetDraft()
            }
          }}
        />
      )}
    </label>
  )
})
