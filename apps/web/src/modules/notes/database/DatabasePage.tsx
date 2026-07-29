import { useEffect, useMemo, useRef, useState } from 'react'
import { Popover } from '../../../components/Popover'
import { notesApi } from '../api'
import { applyFilters, applySort } from './filters'
import { TableView } from './TableView'
import { ListView } from './ListView'
import { BoardView } from './BoardView'
import { GalleryView } from './GalleryView'
import { CalendarView } from './CalendarView'
import type {
  DatabaseProperty,
  DatabaseView,
  Page,
  ViewConfig,
  ViewType,
} from '../types'

// A view that exists before the user saves any: not persisted until edited.
const DEFAULT_VIEW: DatabaseView = {
  id: '',
  page_id: '',
  name: 'Table',
  type: 'table',
  config: {},
  position: 'a0',
}

const ADDABLE_VIEWS: { type: ViewType; label: string }[] = [
  { type: 'table', label: 'Table' },
  { type: 'list', label: 'List' },
  { type: 'board', label: 'Board' },
  { type: 'gallery', label: 'Gallery' },
  { type: 'calendar', label: 'Calendar' },
]

interface DatabasePageProps {
  page: Page
  records: Page[]
  onOpenPage: (id: string) => void
  onPatchRecord: (
    id: string,
    input: Partial<Pick<Page, 'properties'>>,
  ) => Promise<void> | void
  onCreateRecord?: () => void
}

export function DatabasePage({
  page,
  records,
  onOpenPage,
  onPatchRecord,
  onCreateRecord,
}: DatabasePageProps) {
  const [properties, setProperties] = useState<DatabaseProperty[]>([])
  const [views, setViews] = useState<DatabaseView[]>([])
  const [activeViewId, setActiveViewId] = useState<string>('')
  const [addingView, setAddingView] = useState(false)
  const addViewRef = useRef<HTMLButtonElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([notesApi.properties(page.id), notesApi.views(page.id)])
      .then(([props, loadedViews]) => {
        if (!active) return
        setProperties(props)
        setViews(loadedViews)
        setActiveViewId(loadedViews[0]?.id ?? '')
      })
      .catch(
        (reason) =>
          active &&
          setError(
            reason instanceof Error
              ? reason.message
              : 'Could not load database',
          ),
      )
    return () => {
      active = false
    }
  }, [page.id])

  const view =
    views.find((item) => item.id === activeViewId) ?? views[0] ?? DEFAULT_VIEW
  const config = useMemo<ViewConfig>(() => view.config ?? {}, [view.config])

  const visibleRecords = useMemo(
    () => applySort(applyFilters(records, config), config, properties),
    [records, config, properties],
  )

  const fail = (reason: unknown) =>
    setError(reason instanceof Error ? reason.message : 'Request failed')

  const patchConfig = async (partial: Partial<ViewConfig>) => {
    const nextConfig = { ...config, ...partial }
    if (view.id) {
      setViews((current) =>
        current.map((item) =>
          item.id === view.id ? { ...item, config: nextConfig } : item,
        ),
      )
      notesApi.patchView(view.id, { config: nextConfig }).catch(fail)
    } else {
      // First edit of the virtual default view persists it.
      try {
        const created = await notesApi.createView(page.id, {
          name: view.name,
          type: view.type,
          config: nextConfig,
        })
        setViews([created])
        setActiveViewId(created.id)
      } catch (reason) {
        fail(reason)
      }
    }
  }

  const addView = async (type: ViewType, label: string) => {
    setAddingView(false)
    try {
      const created = await notesApi.createView(page.id, { name: label, type })
      setViews((current) => [...current, created])
      setActiveViewId(created.id)
    } catch (reason) {
      fail(reason)
    }
  }

  const removeView = async (id: string) => {
    try {
      await notesApi.removeView(id)
      setViews((current) => {
        const next = current.filter((item) => item.id !== id)
        setActiveViewId(next[0]?.id ?? '')
        return next
      })
    } catch (reason) {
      fail(reason)
    }
  }

  const createProperty = async () => {
    try {
      const created = await notesApi.createProperty(page.id, {
        name: `Property ${properties.length + 1}`,
        type: 'text',
      })
      setProperties((current) => [...current, created])
    } catch (reason) {
      fail(reason)
    }
  }

  const patchProperty = (
    id: string,
    input: Partial<Pick<DatabaseProperty, 'name' | 'type' | 'config'>>,
  ) => {
    setProperties((current) =>
      current.map((item) => (item.id === id ? { ...item, ...input } : item)),
    )
    notesApi.patchProperty(id, input).catch(fail)
  }

  const deleteProperty = (id: string) => {
    setProperties((current) => current.filter((item) => item.id !== id))
    notesApi.removeProperty(id).catch(fail)
  }

  const patchRecord = (id: string, values: Record<string, unknown>) =>
    void onPatchRecord(id, { properties: values })

  const shared = {
    records: visibleRecords,
    onOpenRecord: onOpenPage,
    onPatchRecord: patchRecord,
    onCreateRecord,
  }

  return (
    <div className="notes-database">
      <div className="notes-view-bar">
        <div
          className="notes-view-tabs"
          role="tablist"
          aria-label="Database views"
        >
          {(views.length ? views : [DEFAULT_VIEW]).map((item) => (
            <button
              key={item.id || 'default'}
              type="button"
              role="tab"
              aria-selected={item.id === view.id}
              onClick={() => setActiveViewId(item.id)}
            >
              {item.name}
              {views.length > 1 && item.id === view.id && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Delete ${item.name} view`}
                  className="notes-view-remove"
                  onClick={(event) => {
                    event.stopPropagation()
                    void removeView(item.id)
                  }}
                  onKeyDown={(event) =>
                    event.key === 'Enter' && void removeView(item.id)
                  }
                >
                  ×
                </span>
              )}
            </button>
          ))}
          <button
            ref={addViewRef}
            type="button"
            aria-label="Add view"
            aria-expanded={addingView}
            onClick={() => setAddingView(!addingView)}
          >
            +
          </button>
          <Popover
            anchorRef={addViewRef}
            open={addingView}
            onClose={() => setAddingView(false)}
            className="notes-cell-popover"
            role="menu"
            ariaLabel="View type"
          >
            {ADDABLE_VIEWS.map((item) => (
              <button
                key={item.type}
                type="button"
                role="menuitem"
                onClick={() => void addView(item.type, item.label)}
              >
                {item.label}
              </button>
            ))}
          </Popover>
        </div>
      </div>
      {error && (
        <p className="notes-error" role="alert">
          {error}
        </p>
      )}
      {view.type === 'board' ? (
        <BoardView
          {...shared}
          properties={properties}
          config={config}
          onGroupBy={(propertyId) => void patchConfig({ group_by: propertyId })}
        />
      ) : view.type === 'list' ? (
        <ListView {...shared} />
      ) : view.type === 'gallery' ? (
        <GalleryView {...shared} />
      ) : view.type === 'calendar' ? (
        <CalendarView
          properties={properties}
          records={visibleRecords}
          config={config}
          onOpenRecord={onOpenPage}
          onDateBy={(propertyId) => void patchConfig({ date_by: propertyId })}
        />
      ) : (
        <TableView
          {...shared}
          properties={properties}
          config={config}
          onCreateProperty={() => void createProperty()}
          onPatchProperty={patchProperty}
          onDeleteProperty={deleteProperty}
          onSort={(property, dir) =>
            void patchConfig({ sort: dir ? { property, dir } : undefined })
          }
        />
      )}
    </div>
  )
}
