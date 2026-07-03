import { Field } from '../../components/Field'
import { Popover } from '../../components/Popover'

/** Preset cover tokens stored in pages.cover as "gradient:N". */
export const COVER_PRESETS = [1, 2, 3, 4, 5, 6] as const

export function coverClass(cover: string): string {
  const match = /^gradient:(\d+)$/.exec(cover)
  return match ? `notes-cover-g${match[1]}` : ''
}

interface CoverPickerProps {
  anchorRef: React.RefObject<HTMLElement | null>
  value: string | null
  onChange: (value: string | null) => void
  onClose: () => void
}

/** Popover with preset gradients + a pasted image URL. Uploads come later. */
export function CoverPicker({
  anchorRef,
  value,
  onChange,
  onClose,
}: CoverPickerProps) {
  return (
    <Popover
      anchorRef={anchorRef}
      open
      onClose={onClose}
      className="cal-card notes-cover-picker"
      align="end"
      role="dialog"
      ariaLabel="Change cover"
    >
      <Field label="Gradients">
        <div className="notes-cover-swatches">
          {COVER_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`notes-cover-swatch notes-cover-g${preset}`}
              aria-label={`Cover gradient ${preset}`}
              aria-pressed={value === `gradient:${preset}`}
              onClick={() => onChange(`gradient:${preset}`)}
            />
          ))}
        </div>
      </Field>
      <Field label="Image URL">
        <input
          type="url"
          placeholder="https://…"
          defaultValue={value && !value.startsWith('gradient:') ? value : ''}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') onClose()
          }}
          onBlur={(event) => {
            const url = event.target.value.trim()
            if (url) onChange(url)
          }}
        />
      </Field>
      <div className="cal-card-actions">
        {value && (
          <button
            type="button"
            className="danger"
            onClick={() => {
              onChange(null)
              onClose()
            }}
          >
            Remove
          </button>
        )}
        <button type="button" className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Popover>
  )
}
