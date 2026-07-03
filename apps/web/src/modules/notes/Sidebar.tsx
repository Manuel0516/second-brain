import { useEffect, useMemo, useRef, useState } from 'react'
import { Field } from '../../components/Field'
import { IconButton } from '../../components/IconButton'
import { SidebarShell } from '../../components/SidebarShell'
import { Dropdown } from '../../components/Dropdown'
import { Popover } from '../../components/Popover'
import { CreatePageMenu } from './CreatePageMenu'
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
  onCreate: (parentId: string | null, type?: Page['type']) => void
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
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const createAnchorRef = useRef<HTMLSpanElement>(null)
  const menuAnchorRef = useRef<HTMLElement>(null)
  const [dragging, setDragging] = useState<{ id: string; y: number } | null>(
    null,
  )
  // Live target while dragging: which gap the page would land in, at which depth.
  const [dropHint, setDropHint] = useState<{
    id: string
    position: 'before' | 'after'
    depth: number
  } | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    id: string
    pointerId: number
    startX: number
    startY: number
    x: number
    y: number
    active: boolean
    isTouch: boolean
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

  /** Insert a page as the index-th child of parentId, renumbering siblings. */
  const placeAt = (id: string, parentId: string | null, index: number) => {
    const siblings = (children.get(parentId) ?? []).filter(
      (page) => page.id !== id,
    )
    siblings.splice(
      Math.max(0, Math.min(index, siblings.length)),
      0,
      pages.find((page) => page.id === id)!,
    )
    siblings.forEach((page, position) => {
      const key = `a${String(position).padStart(6, '0')}`
      if (page.parent_page_id !== parentId || page.position !== key) {
        onMove(page.id, parentId, key)
      }
    })
    if (parentId) {
      setToggled((previous) => new Map(previous).set(parentId, true))
    }
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
    const index = nest
      ? siblings.length
      : Math.max(
          0,
          siblings.findIndex((page) => page.id === target.id) +
            (afterTarget ? 1 : 0),
        )
    placeAt(id, parentId, index)
  }

  /**
   * Where a drop at (x, y) would land. The gap between the two rows around
   * the pointer allows a RANGE of depths (from the below row's depth up to
   * one deeper than the above row); the pointer's x picks within it — a
   * plain vertical drag keeps the target's own level, a deliberate
   * rightward drag nests, a leftward drag out-dents.
   */
  const dropTargetAt = (
    x: number,
    y: number,
    draggedId: string,
  ): {
    pageId: string
    position: 'before' | 'after'
    depth: number
    parentId: string | null
    index: number
  } | null => {
    const rows = [
      ...(treeRef.current?.querySelectorAll<HTMLElement>('[data-page-id]') ??
        []),
    ].filter(
      (row) =>
        row.dataset.pageId !== draggedId &&
        !isDescendant(row.dataset.pageId!, draggedId),
    )
    if (!rows.length) return null
    let closestIndex = 0
    rows.forEach((row, index) => {
      const center = row.getBoundingClientRect().top + row.offsetHeight / 2
      const closest =
        rows[closestIndex].getBoundingClientRect().top +
        rows[closestIndex].offsetHeight / 2
      if (Math.abs(center - y) < Math.abs(closest - y)) closestIndex = index
    })
    const targetRow = rows[closestIndex]
    const rect = targetRow.getBoundingClientRect()
    const position: 'before' | 'after' =
      y > rect.top + targetRow.offsetHeight / 2 ? 'after' : 'before'
    // The gap's surrounding rows in visual order.
    const above = position === 'after' ? targetRow : rows[closestIndex - 1]
    const below = position === 'after' ? rows[closestIndex + 1] : targetRow
    const aboveDepth = above ? Number(above.dataset.depth) : -1
    const belowDepth = below ? Number(below.dataset.depth) : 0
    const treeLeft = treeRef.current?.getBoundingClientRect().left ?? 0
    const pointerDepth = Math.round((x - treeLeft - 34) / 14)
    const depth = Math.max(
      Math.min(belowDepth, aboveDepth + 1),
      Math.min(pointerDepth, aboveDepth + 1),
    )
    // Resolve parent + insertion index from the above row's ancestor chain.
    let parentId: string | null = null
    let index = 0
    if (above?.dataset.pageId) {
      if (depth === aboveDepth + 1) {
        // Nest: first child of the row above the gap.
        parentId = above.dataset.pageId
      } else {
        // Sibling of the above row's ancestor at the chosen depth.
        let ancestor = pages.find((page) => page.id === above.dataset.pageId)
        for (let level = aboveDepth; level > depth && ancestor; level -= 1) {
          ancestor = pages.find((page) => page.id === ancestor?.parent_page_id)
        }
        if (!ancestor) return null
        parentId = ancestor.parent_page_id
        const siblings = (children.get(parentId) ?? []).filter(
          (page) => page.id !== draggedId,
        )
        index = siblings.findIndex((page) => page.id === ancestor!.id) + 1 || 0
      }
    }
    return {
      pageId: targetRow.dataset.pageId!,
      position,
      depth: Math.max(0, depth),
      parentId,
      index,
    }
  }

  const activateDrag = (pending: NonNullable<typeof dragRef.current>) => {
    pending.active = true
    suppressMenuClickRef.current = pending.id
    setMenuFor(null)
    setDragging({ id: pending.id, y: pending.y - pending.startY })
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
      isTouch: pointer.pointerType === 'touch',
      timer: 0 as unknown as ReturnType<typeof setTimeout>,
    }
    // Touch: long-press before dragging so scrolling stays natural.
    // Mouse/pen: no hold — the drag arms as soon as the pointer moves.
    if (pending.isTouch) {
      pending.timer = setTimeout(() => {
        if (dragRef.current !== pending) return
        activateDrag(pending)
      }, LONG_PRESS_DELAY)
    }
    dragRef.current = pending
  }

  const moveReorder = (pointer: React.PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current
    if (!current || current.pointerId !== pointer.pointerId) return
    current.x = pointer.clientX
    current.y = pointer.clientY
    if (!current.active) {
      const distance = Math.hypot(
        current.x - current.startX,
        current.y - current.startY,
      )
      if (current.isTouch) {
        // Before the long-press fires, any real movement is a scroll.
        if (distance > 8) {
          clearTimeout(current.timer)
          dragRef.current = null
        }
      } else if (distance > 6) {
        // Mouse: instant drag once past the click threshold.
        activateDrag(current)
      }
      return
    }
    pointer.preventDefault()
    setDragging({ id: current.id, y: current.y - current.startY })
    const hint = dropTargetAt(current.x, current.y, current.id)
    setDropHint(
      hint
        ? { id: hint.pageId, position: hint.position, depth: hint.depth }
        : null,
    )
  }

  const finishReorder = (pointer: React.PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current
    if (!current || current.pointerId !== pointer.pointerId) return
    clearTimeout(current.timer)
    dragRef.current = null
    setDragging(null)
    setDropHint(null)
    if (!current.active) return
    const hint = dropTargetAt(current.x, current.y, current.id)
    if (!hint) return
    placeAt(current.id, hint.parentId, hint.index)
  }

  const cancelReorder = () => {
    if (dragRef.current) clearTimeout(dragRef.current.timer)
    dragRef.current = null
    setDragging(null)
    setDropHint(null)
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
            className={`calendar-row notes-tree-row${selectedId === page.id ? ' selected' : ''}${dragging?.id === page.id ? ' reordering' : ''}${dropHint?.id === page.id ? ` drop-${dropHint.position}` : ''}`}
            data-page-id={page.id}
            data-depth={depth}
            style={{
              paddingLeft: 8 + depth * 14,
              transform:
                dragging?.id === page.id
                  ? `translateY(${dragging.y}px) scale(1.03)`
                  : undefined,
              ...(dropHint?.id === page.id
                ? ({
                    '--drop-depth-indent': `${dropHint.depth * 14}px`,
                  } as React.CSSProperties)
                : {}),
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
              aria-haspopup="dialog"
              aria-expanded={menuFor === page.id}
              onPointerDown={(pointer) => startReorder(pointer, page)}
              onPointerMove={moveReorder}
              onPointerUp={finishReorder}
              onPointerCancel={cancelReorder}
              onClick={(event) => {
                if (suppressMenuClickRef.current === page.id) {
                  suppressMenuClickRef.current = null
                  return
                }
                menuAnchorRef.current = event.currentTarget.parentElement
                setMenuFor((current) => (current === page.id ? null : page.id))
              }}
              onKeyDown={(event) => keyboardReorder(event, page)}
            >
              ⋯
            </button>
            {menuFor === page.id && (
              <Popover
                anchorRef={menuAnchorRef}
                open
                onClose={() => setMenuFor(null)}
                className="cal-card calendar-menu"
                matchAnchorWidth
                role="dialog"
                ariaLabel={`Edit ${page.title || 'Untitled'}`}
              >
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
                </div>
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
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setMenuFor(null)}
                  >
                    Done
                  </button>
                </div>
              </Popover>
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
          <span ref={createAnchorRef}>
            <IconButton
              icon="+"
              label="New page"
              onClick={() => setCreateMenuOpen(!createMenuOpen)}
              size="md"
            />
          </span>
          <CreatePageMenu
            anchorRef={createAnchorRef}
            open={createMenuOpen}
            onClose={() => setCreateMenuOpen(false)}
            onCreate={(type) => onCreate(null, type)}
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
      <div className="notes-tree" role="tree" ref={treeRef}>
        {renderLevel(null, 0)}
      </div>
      {!pages.length && <p className="notes-empty">No pages yet.</p>}
    </SidebarShell>
  )
}
