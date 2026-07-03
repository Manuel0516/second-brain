import { useRef, useState } from 'react'
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

/** One column header owning its popover anchor ref. */
function PropertyHeader({
  property,
  sort,
  open,
  onToggle,
  onPatch,
  onSort,
  onDelete,
  onClose,
}: {
  property: DatabaseProperty
  sort: ViewConfig['sort']
  open: boolean
  onToggle: () => void
  onPatch: (
    input: Partial<Pick<DatabaseProperty, 'name' | 'type' | 'config'>>,
  ) => void
  onSort: (dir: 'asc' | 'desc' | null) => void
  onDelete: () => void
  onClose: () => void
}) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  return (
    <th>
      <button
        ref={anchorRef}
        type="button"
        className="notes-table-head-btn"
        aria-expanded={open}
        onClick={onToggle}
      >
        {property.name}
        {sort?.property === property.id && (sort.dir === 'asc' ? ' ↑' : ' ↓')}
      </button>
      <PropertyConfig
        property={property}
        sort={sort}
        anchorRef={anchorRef}
        open={open}
        onPatch={onPatch}
        onSort={onSort}
        onDelete={onDelete}
        onClose={onClose}
      />
    </th>
  )
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
              <PropertyHeader
                key={property.id}
                property={property}
                sort={config.sort}
                open={configFor === property.id}
                onToggle={() =>
                  setConfigFor(configFor === property.id ? null : property.id)
                }
                onPatch={(input) => onPatchProperty(property.id, input)}
                onSort={(dir) => onSort(property.id, dir)}
                onDelete={() => {
                  setConfigFor(null)
                  onDeleteProperty(property.id)
                }}
                onClose={() => setConfigFor(null)}
              />
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
