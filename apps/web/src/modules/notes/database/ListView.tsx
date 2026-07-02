import type { Page } from '../types'

interface ListViewProps {
  records: Page[]
  onOpenRecord: (id: string) => void
  onCreateRecord?: () => void
}

/** The table minus columns: a plain list of records. */
export function ListView({
  records,
  onOpenRecord,
  onCreateRecord,
}: ListViewProps) {
  return (
    <div className="notes-list-view">
      {records.map((record) => (
        <button
          key={record.id}
          type="button"
          className="notes-record-title notes-list-row"
          onClick={() => onOpenRecord(record.id)}
        >
          <span aria-hidden="true">{record.icon || '▧'}</span>
          {record.title || 'Untitled'}
        </button>
      ))}
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
