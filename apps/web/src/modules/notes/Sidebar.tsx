import { useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '../../components/Card'
import { Field } from '../../components/Field'
import { IconButton } from '../../components/IconButton'
import { SidebarShell } from '../../components/SidebarShell'
import { Dropdown } from '../../components/Dropdown'
import type { Page } from './types'

// Same long-press delay as the calendar sidebar reorder.
const LONG_PRESS_DELAY = 375

const CloseIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M5 5l10 10M15 5L5 15" />
  </svg>
)

const ChevronIcon = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M7 4l6 6-6 6" />
  </svg>
)

export interface SidebarProps {
  pages: Page[]
  selectedId?: string
  onSelect: (id: string) => void
  onCreate: (parentId: string | null) => void
  onRename: (id: string, title: string) => void
  onSetType?: (id: string, type: Page['type']) => void
  onSetTemplate?: (id: string, is_template: boolean) => void
  onUseTemplate?: (id: string) => void
  onMove: (id: string, parentId: string | null, position: string) => void
  onDelete: (page: Page) => void
  onOpenTrash: () => void
  open?: boolean
  onClose?: () => void
}

export function Sidebar({
  pages,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onSetType,
  onSetTemplate,
  onUseTemplate,
  onMove,
  onDelete,
  onOpenTrash,
  open = true,
  onClose,
}: SidebarProps) {
  // Explicit user toggles; anything not toggled falls back to "expanded when
  // it is an ancestor of the selected page", so deep links are always visible.
  const [toggled, setToggled] = useState<Map<string, boolean>>(() => new Map())
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ id: string; y: number } | null>(
    null,
  )
  const treeRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    id: string
    pointerId: number
    startX: number
    startY: number
    x: number
    y: number
    active: boolean
    timer: ReturnType<typeof setTimeout>
  } | null>(null)
  const suppressMenuClickRef = useRef<string | null>(null)

  const children = useMemo(() => {
    const byId = new Map(pages.map((page) => [page.id, page]))
    const map = new Map<string | null, Page[]>()
    for (const page of pages) {
      // Database records live inside their database view, not in the tree;
      // templates live in their own sidebar section.
      if (
        page.is_template ||
        (page.parent_page_id &&
          byId.get(page.parent_page_id)?.type === 'database')
      )
        continue
      const siblings = map.get(page.parent_page_id) ?? []
      siblings.push(page)
      map.set(page.parent_page_id, siblings)
    }
    for (const siblings of map.values()) {
      siblings.sort((a, b) => a.position.localeCompare(b.position))
    }
    return map
  }, [pages])

  const selectedAncestors = useMemo(() => {
    const ids = new Set<string>()
    let current = pages.find((page) => page.id === selectedId)
    while (current?.parent_page_id) {
      ids.add(current.parent_page_id)
      current = pages.find((page) => page.id === current?.parent_page_id)
    }
    return ids
  }, [pages, selectedId])

  const isExpanded = (id: string) =>
    toggled.get(id) ?? selectedAncestors.has(id)

  useEffect(() => {
    const tree = treeRef.current
    if (!tree) return
    const preventScrollWhileDragging = (event: TouchEvent) => {
      if (dragRef.current?.active) event.preventDefault()
    }
    tree.addEventListener('touchmove', preventScrollWhileDragging, {
      passive: false,
    })
    return () => {
      tree.removeEventListener('touchmove', preventScrollWhileDragging)
      if (dragRef.current) clearTimeout(dragRef.current.timer)
    }
  }, [])

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
    if (nest) {
      setToggled((previous) => new Map(previous).set(target.id, true))
    }
  }

  const startReorder = (
    pointer: React.PointerEvent<HTMLButtonElement>,
    page: Page,
  ) => {
    if (pointer.button !== 0) return
    pointer.currentTarget.setPointerCapture(pointer.pointerId)
    const pending = {
      id: page.id,
      pointerId: pointer.pointerId,
      startX: pointer.clientX,
      startY: pointer.clientY,
      x: pointer.clientX,
      y: pointer.clientY,
      active: false,
      timer: 0 as unknown as ReturnType<typeof setTimeout>,
    }
    pending.timer = setTimeout(() => {
      if (dragRef.current !== pending) return
      pending.active = true
      suppressMenuClickRef.current = page.id
      setMenuFor(null)
      setDragging({ id: page.id, y: 0 })
    }, LONG_PRESS_DELAY)
    dragRef.current = pending
  }

  const moveReorder = (pointer: React.PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current
    if (!current || current.pointerId !== pointer.pointerId) return
    current.x = pointer.clientX
    current.y = pointer.clientY
    // Before the long-press fires, any real movement is a scroll — bail out.
    if (!current.active) {
      if (
        Math.hypot(current.x - current.startX, current.y - current.startY) > 8
      ) {
        clearTimeout(current.timer)
        dragRef.current = null
      }
      return
    }
    pointer.preventDefault()
    setDragging({ id: current.id, y: current.y - current.startY })
  }

  const finishReorder = (pointer: React.PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current
    if (!current || current.pointerId !== pointer.pointerId) return
    clearTimeout(current.timer)
    dragRef.current = null
    setDragging(null)
    if (!current.active) return
    const rows = [
      ...(treeRef.current?.querySelectorAll<HTMLElement>('[data-page-id]') ??
        []),
    ].filter(
      (row) =>
        row.dataset.pageId !== current.id &&
        !isDescendant(row.dataset.pageId!, current.id),
    )
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
    if (!target) return
    const rect = targetRow!.getBoundingClientRect()
    const depth = Number(targetRow!.dataset.depth)
    move(
      current.id,
      target,
      // Dragging past the title indent nests under the target.
      current.x > rect.left + 34 + depth * 14,
      current.y > rect.top + targetRow!.offsetHeight / 2,
    )
  }

  const cancelReorder = () => {
    if (dragRef.current) clearTimeout(dragRef.current.timer)
    dragRef.current = null
    setDragging(null)
  }

  const keyboardReorder = (event: React.KeyboardEvent, page: Page) => {
    if (!event.altKey) return
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    const siblings = children.get(page.parent_page_id) ?? []
    const index = siblings.findIndex((item) => item.id === page.id)
    const target = siblings[index + (event.key === 'ArrowUp' ? -1 : 1)]
    if (!target) return
    event.preventDefault()
    move(page.id, target, false, event.key === 'ArrowDown')
  }

  const renderLevel = (
    parentId: string | null,
    depth: number,
  ): React.ReactNode =>
    (children.get(parentId) ?? []).map((page) => {
      const nested = children.get(page.id) ?? []
      const isOpen = isExpanded(page.id)
      return (
        <div
          key={page.id}
          role="treeitem"
          aria-selected={selectedId === page.id}
          aria-expanded={nested.length ? isOpen : undefined}
        >
          <div
            className={`calendar-row notes-tree-row${selectedId === page.id ? ' selected' : ''}${dragging?.id === page.id ? ' reordering' : ''}`}
            data-page-id={page.id}
            data-depth={depth}
            style={{
              paddingLeft: 8 + depth * 14,
              transform:
                dragging?.id === page.id
                  ? `translateY(${dragging.y}px) scale(1.03)`
                  : undefined,
            }}
          >
            <button
              type="button"
              className={`notes-tree-toggle${isOpen ? ' open' : ''}`}
              aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${page.title}`}
              disabled={!nested.length}
              onClick={() =>
                setToggled((current) => new Map(current).set(page.id, !isOpen))
              }
            >
              {nested.length > 0 && <ChevronIcon />}
            </button>
            <button
              type="button"
              className="notes-tree-title"
              onClick={() => onSelect(page.id)}
            >
              {page.icon ? (
                <span className="notes-tree-icon" aria-hidden="true">
                  {page.icon}
                </span>
              ) : (
                page.type === 'folder' && (
                  <span className="notes-tree-icon" aria-hidden="true">
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2.5 5.5a1 1 0 011-1h4l2 2h7a1 1 0 011 1v8a1 1 0 01-1 1h-13a1 1 0 01-1-1z" />
                    </svg>
                  </span>
                )
              )}
              <span className="calendar-name">{page.title || 'Untitled'}</span>
            </button>
            <button
              type="button"
              className="calendar-menu-btn"
              aria-label={`${page.title || 'Untitled'} options`}
              aria-haspopup="menu"
              aria-expanded={menuFor === page.id}
              onPointerDown={(pointer) => startReorder(pointer, page)}
              onPointerMove={moveReorder}
              onPointerUp={finishReorder}
              onPointerCancel={cancelReorder}
              onClick={() => {
                if (suppressMenuClickRef.current === page.id) {
                  suppressMenuClickRef.current = null
                  return
                }
                setMenuFor((current) => (current === page.id ? null : page.id))
              }}
              onKeyDown={(event) => keyboardReorder(event, page)}
            >
              ⋯
            </button>
            {menuFor === page.id && (
              <Card className="calendar-menu" animate={false}>
                <div className="cal-card-head">
                  <h3>Edit page</h3>
                  <IconButton
                    icon={<CloseIcon />}
                    label="Close"
                    onClick={() => setMenuFor(null)}
                    size="sm"
                  />
                </div>
                <Field label="Title">
                  <input
                    aria-label={`Rename ${page.title || 'Untitled'}`}
                    defaultValue={page.title}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                      if (event.key === 'Escape') setMenuFor(null)
                    }}
                    onBlur={(event) => {
                      const title = event.target.value.trim()
                      if (title && title !== page.title)
                        onRename(page.id, title)
                    }}
                  />
                </Field>
                {onSetType && (
                  <Field label="Type">
                    <Dropdown
                      ariaLabel={`${page.title || 'Untitled'} type`}
                      value={page.type}
                      onChange={(value) =>
                        onSetType(page.id, value as Page['type'])
                      }
                      options={[
                        { value: 'page', label: 'Page' },
                        { value: 'database', label: 'Database' },
                        { value: 'folder', label: 'Folder' },
                      ]}
                    />
                  </Field>
                )}
                <div className="cal-card-actions">
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      setMenuFor(null)
                      onDelete(page)
                    }}
                  >
                    Delete
                  </button>
                  {onSetTemplate && (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setMenuFor(null)
                        onSetTemplate(page.id, true)
                      }}
                    >
                      Template
                    </button>
                  )}
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setMenuFor(null)
                      onCreate(page.id)
                    }}
                  >
                    Sub-page
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setMenuFor(null)}
                  >
                    Done
                  </button>
                </div>
              </Card>
            )}
          </div>
          {isOpen && <div role="group">{renderLevel(page.id, depth + 1)}</div>}
        </div>
      )
    })

  return (
    <SidebarShell
      title="Pages"
      open={open}
      className="notes-sidebar"
      ariaLabel="Notes pages"
      actions={
        <>
          <IconButton
            icon="+"
            label="New page"
            onClick={() => onCreate(null)}
            size="md"
          />
          <IconButton
            icon={<CloseIcon />}
            label="Close navigation"
            onClick={() => onClose?.()}
            size="md"
            className="sidebar-close"
          />
        </>
      }
      footer={
        <div className="notes-trash-section">
          {pages.some((page) => page.is_template) && (
            <div className="notes-templates" aria-label="Templates">
              <span className="notes-templates-title">Templates</span>
              {pages
                .filter((page) => page.is_template)
                .map((template) => (
                  <div key={template.id} className="notes-template-row">
                    <button
                      type="button"
                      className="notes-tree-title"
                      onClick={() => onSelect(template.id)}
                    >
                      {template.icon && (
                        <span className="notes-tree-icon" aria-hidden="true">
                          {template.icon}
                        </span>
                      )}
                      <span className="calendar-name">
                        {template.title || 'Untitled'}
                      </span>
                    </button>
                    {onUseTemplate && (
                      <IconButton
                        icon="⧉"
                        label={`Use template ${template.title || 'Untitled'}`}
                        onClick={() => onUseTemplate(template.id)}
                        size="sm"
                      />
                    )}
                    {onSetTemplate && (
                      <IconButton
                        icon={<CloseIcon />}
                        label={`Remove template ${template.title || 'Untitled'}`}
                        onClick={() => onSetTemplate(template.id, false)}
                        size="sm"
                      />
                    )}
                  </div>
                ))}
            </div>
          )}
          <button
            type="button"
            className="notes-trash-link"
            onClick={onOpenTrash}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3.5 5.5h13M8 5V3.5h4V5M5 5.5l.8 11a1 1 0 001 .9h6.4a1 1 0 001-.9l.8-11M8.2 8.5v6M11.8 8.5v6" />
            </svg>
            Trash
          </button>
        </div>
      }
    >
      {menuFor && (
        <div
          className="calendar-menu-overlay"
          role="presentation"
          onClick={() => setMenuFor(null)}
        />
      )}
      <div className="notes-tree" role="tree" ref={treeRef}>
        {renderLevel(null, 0)}
      </div>
      {!pages.length && <p className="notes-empty">No pages yet.</p>}
    </SidebarShell>
  )
}
