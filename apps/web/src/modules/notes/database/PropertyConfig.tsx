import { Card } from '../../../components/Card'
import { Dropdown } from '../../../components/Dropdown'
import { Field } from '../../../components/Field'
import type { DatabaseProperty, PropertyType, ViewConfig } from '../types'

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Select' },
  { value: 'multi_select', label: 'Multi-select' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'url', label: 'URL' },
  { value: 'relation', label: 'Relation' },
]

interface PropertyConfigProps {
  property: DatabaseProperty
  sort: ViewConfig['sort']
  onPatch: (
    input: Partial<Pick<DatabaseProperty, 'name' | 'type' | 'config'>>,
  ) => void
  onSort: (dir: 'asc' | 'desc' | null) => void
  onDelete: () => void
  onClose: () => void
}

/** Column header popover: rename, retype, options, sort, delete. */
export function PropertyConfig({
  property,
  sort,
  onPatch,
  onSort,
  onDelete,
  onClose,
}: PropertyConfigProps) {
  const sortedDir = sort?.property === property.id ? sort.dir : null
  const hasOptions =
    property.type === 'select' || property.type === 'multi_select'
  return (
    <Card className="notes-property-config" animate={false}>
      <Field label="Name">
        <input
          aria-label={`Rename ${property.name}`}
          defaultValue={property.name}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') onClose()
          }}
          onBlur={(event) => {
            const name = event.target.value.trim()
            if (name && name !== property.name) onPatch({ name })
          }}
        />
      </Field>
      <Field label="Type">
        <Dropdown
          ariaLabel={`${property.name} type`}
          value={property.type}
          onChange={(value) => onPatch({ type: value as PropertyType })}
          options={PROPERTY_TYPES}
        />
      </Field>
      {hasOptions && (
        <Field label="Options (one per line)">
          <textarea
            aria-label={`${property.name} options`}
            rows={4}
            defaultValue={(property.config.options ?? []).join('\n')}
            onBlur={(event) =>
              onPatch({
                config: {
                  ...property.config,
                  options: event.target.value
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean),
                },
              })
            }
          />
        </Field>
      )}
      <Field label="Sort">
        <div className="notes-sort-buttons">
          {(['asc', 'desc'] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              aria-pressed={sortedDir === dir}
              onClick={() => onSort(sortedDir === dir ? null : dir)}
            >
              {dir === 'asc' ? '↑ Ascending' : '↓ Descending'}
            </button>
          ))}
        </div>
      </Field>
      <div className="cal-card-actions">
        <button type="button" className="danger" onClick={onDelete}>
          Delete
        </button>
        <button type="button" className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Card>
  )
}
