import { coverClass } from '../CoverPicker'
import type { Page } from '../types'

interface GalleryViewProps {
  records: Page[]
  onOpenRecord: (id: string) => void
  onCreateRecord?: () => void
}

/** Card grid; record covers become card banners. */
export function GalleryView({
  records,
  onOpenRecord,
  onCreateRecord,
}: GalleryViewProps) {
  return (
    <div className="notes-gallery">
      {records.map((record) => (
        <button
          key={record.id}
          type="button"
          className="notes-gallery-card"
          onClick={() => onOpenRecord(record.id)}
        >
          <span
            className={`notes-gallery-cover ${
              record.cover ? coverClass(record.cover) : ''
            }`}
            style={
              record.cover && !record.cover.startsWith('gradient:')
                ? { backgroundImage: `url("${record.cover}")` }
                : undefined
            }
            aria-hidden="true"
          >
            {!record.cover && (record.icon || '▧')}
          </span>
          <span className="notes-gallery-title">
            {record.icon && <span aria-hidden="true">{record.icon} </span>}
            {record.title || 'Untitled'}
          </span>
        </button>
      ))}
      {onCreateRecord && (
        <button
          type="button"
          className="notes-gallery-card notes-gallery-new"
          onClick={onCreateRecord}
        >
          + New
        </button>
      )}
    </div>
  )
}
