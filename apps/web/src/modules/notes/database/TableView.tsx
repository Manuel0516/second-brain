import { useState } from 'react'
import { PropertyCell } from './PropertyCell'
import { PropertyConfig } from './PropertyConfig'
import type { DatabaseProperty, Page, ViewConfig } from '../types'

interface TableViewProps {
  properties: DatabaseProperty[]
  records: Page[]
  config: ViewConfig
  onOpenRecord: (id: string) => void
  onPatchRecord: (id: string, properties: Record<string, unknown>) => void
  onCreateRecord?: () => void
  onCreateProperty: () => void
  onPatchProperty: (
    id: string,
    input: Partial<Pick<DatabaseProperty, 'name' | 'type' | 'config'>>,
  ) => void
  onDeleteProperty: (id: string) => void
  onSort: (property: string, dir: 'asc' | 'desc' | null) => void
}

export function TableView({
  properties,
  records,
  config,
  onOpenRecord,
  onPatchRecord,
  onCreateRecord,
  onCreateProperty,
  onPatchProperty,
  onDeleteProperty,
  onSort,
}: TableViewProps) {
  const [configFor, setConfigFor] = useState<string | null>(null)

  const setValue = (record: Page, propertyId: string, value: unknown) =>
    onPatchRecord(record.id, { ...record.properties, [propertyId]: value })

  return (
    <div className="notes-table-wrap">
      <table className="notes-table">
        <thead>
          <tr>
            <th className="notes-table-title-col">Name</th>
            {properties.map((property) => (
              <th key={property.id}>
                <button
                  type="button"
                  className="notes-table-head-btn"
                  aria-expanded={configFor === property.id}
                  onClick={() =>
                    setConfigFor(configFor === property.id ? null : property.id)
                  }
                >
                  {property.name}
                  {config.sort?.property === property.id &&
                    (config.sort.dir === 'asc' ? ' ↑' : ' ↓')}
                </button>
                {configFor === property.id && (
                  <PropertyConfig
                    property={property}
                    sort={config.sort}
                    onPatch={(input) => onPatchProperty(property.id, input)}
                    onSort={(dir) => onSort(property.id, dir)}
                    onDelete={() => {
                      setConfigFor(null)
                      onDeleteProperty(property.id)
                    }}
                    onClose={() => setConfigFor(null)}
                  />
                )}
              </th>
            ))}
            <th className="notes-table-add-col">
              <button
                type="button"
                className="notes-table-head-btn"
                aria-label="Add property"
                onClick={onCreateProperty}
              >
                +
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td className="notes-table-title-col">
                <button
                  type="button"
                  className="notes-record-title"
                  onClick={() => onOpenRecord(record.id)}
                >
                  <span aria-hidden="true">{record.icon || '▧'}</span>
                  {record.title || 'Untitled'}
                </button>
              </td>
              {properties.map((property) => (
                <td key={property.id}>
                  <PropertyCell
                    property={property}
                    value={record.properties?.[property.id]}
                    onChange={(value) => setValue(record, property.id, value)}
                  />
                </td>
              ))}
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      {onCreateRecord && (
        <button
          type="button"
          className="notes-new-record"
          onClick={onCreateRecord}
        >
          + New
        </button>
      )}
    </div>
  )
}
