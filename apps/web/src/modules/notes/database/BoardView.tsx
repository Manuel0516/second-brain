import { useState } from 'react'
import { Dropdown } from '../../../components/Dropdown'
import { groupRecords } from './filters'
import type { DatabaseProperty, Page, ViewConfig } from '../types'

interface BoardViewProps {
  properties: DatabaseProperty[]
  records: Page[]
  config: ViewConfig
  onOpenRecord: (id: string) => void
  onPatchRecord: (id: string, properties: Record<string, unknown>) => void
  onCreateRecord?: () => void
  onGroupBy: (propertyId: string) => void
}

/** Kanban board grouped by a select property; drag cards between columns. */
export function BoardView({
  properties,
  records,
  config,
  onOpenRecord,
  onPatchRecord,
  onCreateRecord,
  onGroupBy,
}: BoardViewProps) {
  const [dragged, setDragged] = useState<string | null>(null)
  const selects = properties.filter((property) => property.type === 'select')
  const groupProperty =
    selects.find((property) => property.id === config.group_by) ?? selects[0]

  if (!groupProperty) {
    return (
      <p className="notes-board-hint">
        Add a select property to group this board.
      </p>
    )
  }
  const options = groupProperty.config.options ?? []
  const groups = groupRecords(records, groupProperty.id, options)

  const drop = (option: string) => {
    const record = records.find((item) => item.id === dragged)
    setDragged(null)
    if (!record) return
    onPatchRecord(record.id, {
      ...record.properties,
      [groupProperty.id]: option || null,
    })
  }

  return (
    <div className="notes-board">
      {selects.length > 1 && (
        <div className="notes-board-groupby">
          <label>
            Group by{' '}
            <Dropdown
              ariaLabel="Group by"
              value={groupProperty.id}
              onChange={(value) => onGroupBy(value)}
              options={selects.map((property) => ({
                value: property.id,
                label: property.name,
              }))}
            />
          </label>
        </div>
      )}
      <div className="notes-board-columns">
        {[...groups.entries()].map(([option, group]) => (
          <section
            key={option || '(none)'}
            className="notes-board-column"
            aria-label={option || 'No value'}
            onDragOver={(event) => dragged && event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              drop(option)
            }}
          >
            <h3>
              {option || 'No value'}
              <span className="notes-board-count">{group.length}</span>
            </h3>
            {group.map((record) => (
              <button
                key={record.id}
                type="button"
                className="notes-board-card"
                draggable
                onDragStart={() => setDragged(record.id)}
                onDragEnd={() => setDragged(null)}
                onClick={() => onOpenRecord(record.id)}
              >
                <span aria-hidden="true">{record.icon || '▧'}</span>
                {record.title || 'Untitled'}
              </button>
            ))}
            {onCreateRecord && !option && (
              <button
                type="button"
                className="notes-new-record"
                onClick={onCreateRecord}
              >
                + New
              </button>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
