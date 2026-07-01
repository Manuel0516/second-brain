import { useEffect, useMemo, useRef, useState } from 'react'
import { IconButton } from '../../components/IconButton'
import type { Page } from './types'

export interface PageTreeProps {
  pages: Page[]
  selectedId?: string
  onSelect: (id: string) => void
  onCreate: (parentId: string | null) => void
  onRename: (id: string, title: string) => void
  onMove: (id: string, parentId: string | null, position: string) => void
  onDelete: (page: Page) => void
  onOpenTrash: () => void
  open?: boolean
  onClose?: () => void
}

export function PageTree({
  pages,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onMove,
  onDelete,
  onOpenTrash,
  open = true,
  onClose,
}: PageTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () =>
      new Set(
        pages.map((page) => page.parent_page_id).filter(Boolean) as string[],
      ),
  )
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dragged, setDragged] = useState<string | null>(null)
  const [touchDragged, setTouchDragged] = useState<{
    id: string
    y: number
  } | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)
  const touchRef = useRef<{
    id: string
    pointerId: number
    startX: number
    startY: number
    x: number
    y: number
    active: boolean
    timer: ReturnType<typeof setTimeout>
  } | null>(null)
  const suppressSelect = useRef<string | null>(null)
  const children = useMemo(() => {
    const map = new Map<string | null, Page[]>()
    for (const page of pages) {
      const siblings = map.get(page.parent_page_id) ?? []
      siblings.push(page)
      map.set(page.parent_page_id, siblings)
    }
    for (const siblings of map.values()) {
      siblings.sort((a, b) => a.position.localeCompare(b.position))
    }
    return map
  }, [pages])

  const isDescendant = (candidate: string, ancestor: string): boolean => {
    let page = pages.find((item) => item.id === candidate)
    while (page?.parent_page_id) {
      if (page.parent_page_id === ancestor) return true
      page = pages.find((item) => item.id === page?.parent_page_id)
    }
    return false
  }

  const move = (
    id: string,
    target: Page,
    nest: boolean,
    afterTarget: boolean,
  ) => {
    const parentId = nest ? target.id : target.parent_page_id
    const siblings = (children.get(parentId) ?? []).filter(
      (page) => page.id !== id,
    )
    const targetIndex = nest
      ? siblings.length
      : Math.max(
          0,
          siblings.findIndex((page) => page.id === target.id) +
            (afterTarget ? 1 : 0),
        )
    siblings.splice(targetIndex, 0, pages.find((page) => page.id === id)!)
    siblings.forEach((page, index) => {
      const position = `a${String(index).padStart(6, '0')}`
      if (page.parent_page_id !== parentId || page.position !== position) {
        onMove(page.id, parentId, position)
      }
    })
  }

  useEffect(() => {
    const tree = treeRef.current
    if (!tree) return
    const preventScroll = (event: TouchEvent) => {
      if (touchRef.current?.active) event.preventDefault()
    }
    tree.addEventListener('touchmove', preventScroll, { passive: false })
    return () => {
      tree.removeEventListener('touchmove', preventScroll)
      if (touchRef.current) clearTimeout(touchRef.current.timer)
    }
  }, [])

  const startTouchMove = (
    event: React.PointerEvent<HTMLButtonElement>,
    page: Page,
  ) => {
    if (event.pointerType !== 'touch') return
    event.currentTarget.setPointerCapture(event.pointerId)
    const pending = {
      id: page.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
      timer: 0 as unknown as ReturnType<typeof setTimeout>,
    }
    pending.timer = setTimeout(() => {
      if (touchRef.current !== pending) return
      pending.active = true
      setTouchDragged({ id: page.id, y: 0 })
    }, 650)
    touchRef.current = pending
  }

  const updateTouchMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = touchRef.current
    if (!current || current.pointerId !== event.pointerId) return
    current.x = event.clientX
    current.y = event.clientY
    if (!current.active) {
      if (
        Math.hypot(current.x - current.startX, current.y - current.startY) > 8
      ) {
        clearTimeout(current.timer)
        touchRef.current = null
      }
      return
    }
    event.preventDefault()
    setTouchDragged({ id: current.id, y: current.y - current.startY })
  }

  const finishTouchMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = touchRef.current
    if (!current || current.pointerId !== event.pointerId) return
    clearTimeout(current.timer)
    touchRef.current = null
    setTouchDragged(null)
    if (!current.active) return
    suppressSelect.current = current.id
    const rows = [
      ...(treeRef.current?.querySelectorAll<HTMLElement>('[data-page-id]') ??
        []),
    ].filter((row) => row.dataset.pageId !== current.id)
    const targetRow = rows.reduce<HTMLElement | null>((closest, row) => {
      const center = row.getBoundingClientRect().top + row.offsetHeight / 2
      if (!closest) return row
      const closestCenter =
        closest.getBoundingClientRect().top + closest.offsetHeight / 2
      return Math.abs(center - current.y) < Math.abs(closestCenter - current.y)
        ? row
        : closest
    }, null)
    const target = pages.find((page) => page.id === targetRow?.dataset.pageId)
    if (!target || isDescendant(target.id, current.id)) return
    const rect = targetRow!.getBoundingClientRect()
    const depth = Number(targetRow!.dataset.depth)
    move(
      current.id,
      target,
      current.x > rect.left + 44 + depth * 16,
      current.y > rect.top + targetRow!.offsetHeight / 2,
    )
  }

  const cancelTouchMove = () => {
    if (touchRef.current) clearTimeout(touchRef.current.timer)
    touchRef.current = null
    setTouchDragged(null)
  }

  const renderLevel = (
    parentId: string | null,
    depth: number,
  ): React.ReactNode =>
    (children.get(parentId) ?? []).map((page) => {
      const nested = children.get(page.id) ?? []
      const open = expanded.has(page.id)
      return (
        <div
          key={page.id}
          role="treeitem"
          aria-selected={selectedId === page.id}
          aria-expanded={nested.length ? open : undefined}
        >
          <div
            className={`notes-tree-row ${selectedId === page.id ? 'selected' : ''}`}
            data-page-id={page.id}
            data-depth={depth}
            style={{
              paddingLeft: 8 + depth * 16,
              transform:
                touchDragged?.id === page.id
                  ? `translateY(${touchDragged.y}px) scale(1.02)`
                  : undefined,
            }}
            draggable
            onDragStart={(event) => {
              setDragged(page.id)
              event.dataTransfer.effectAllowed = 'move'
            }}
            onDragEnd={() => setDragged(null)}
            onDragOver={(event) => {
              if (
                dragged &&
                dragged !== page.id &&
                !isDescendant(page.id, dragged)
              ) {
                event.preventDefault()
              }
            }}
            onDrop={(event) => {
              event.preventDefault()
              if (
                !dragged ||
                dragged === page.id ||
                isDescendant(page.id, dragged)
              )
                return
              const nest =
                event.clientX >
                event.currentTarget.getBoundingClientRect().left +
                  44 +
                  depth * 16
              move(
                dragged,
                page,
                nest,
                event.clientY >
                  event.currentTarget.getBoundingClientRect().top +
                    event.currentTarget.offsetHeight / 2,
              )
              setDragged(null)
            }}
          >
            <button
              type="button"
              className="notes-tree-toggle"
              aria-label={`${open ? 'Collapse' : 'Expand'} ${page.title}`}
              disabled={!nested.length}
              onClick={() =>
                setExpanded((current) => {
                  const next = new Set(current)
                  if (next.has(page.id)) next.delete(page.id)
                  else next.add(page.id)
                  return next
                })
              }
            >
              {nested.length ? (open ? '⌄' : '›') : ''}
            </button>
            <span aria-hidden="true">{page.icon || '▧'}</span>
            {renaming === page.id ? (
              <input
                className="notes-tree-rename"
                defaultValue={page.title}
                ref={(input) => input?.focus()}
                aria-label={`Rename ${page.title}`}
                onBlur={(event) => {
                  onRename(page.id, event.target.value.trim() || 'Untitled')
                  setRenaming(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                  if (event.key === 'Escape') setRenaming(null)
                }}
              />
            ) : (
              <button
                type="button"
                className="notes-tree-title"
                onPointerDown={(event) => startTouchMove(event, page)}
                onPointerMove={updateTouchMove}
                onPointerUp={finishTouchMove}
                onPointerCancel={cancelTouchMove}
                onClick={() => {
                  if (suppressSelect.current === page.id) {
                    suppressSelect.current = null
                    return
                  }
                  onSelect(page.id)
                }}
                onDoubleClick={() => setRenaming(page.id)}
              >
                {page.title}
              </button>
            )}
            <button
              type="button"
              className="notes-tree-action"
              aria-label={`Add child to ${page.title}`}
              onClick={() => onCreate(page.id)}
            >
              +
            </button>
            <button
              type="button"
              className="notes-tree-action"
              aria-label={`Delete ${page.title}`}
              onClick={() => onDelete(page)}
            >
              ×
            </button>
          </div>
          {open && <div role="group">{renderLevel(page.id, depth + 1)}</div>}
        </div>
      )
    })

  return (
    <nav
      className={`notes-sidebar ${open ? 'open' : ''}`}
      aria-label="Notes pages"
    >
      <div className="notes-sidebar-heading">
        <span>Pages</span>
        <span>
          <IconButton
            icon="+"
            label="New page"
            onClick={() => onCreate(null)}
            size="md"
          />
          {onClose && (
            <IconButton
              icon="×"
              label="Close page navigation"
              onClick={onClose}
              size="md"
            />
          )}
        </span>
      </div>
      <div className="notes-tree" role="tree" ref={treeRef}>
        {renderLevel(null, 0)}
      </div>
      {!pages.length && <p className="notes-empty">No pages yet.</p>}
      <button type="button" className="notes-trash-link" onClick={onOpenTrash}>
        Trash
      </button>
    </nav>
  )
}
