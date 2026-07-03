import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { Sidebar } from './Sidebar'
import type { Page } from './types'

const page = (
  id: string,
  title: string,
  parent_page_id: string | null,
  position: string,
): Page => ({
  id,
  title,
  parent_page_id,
  position,
  icon: null,
  content: { type: 'doc', content: [{ type: 'paragraph' }] },
  type: 'page',
  is_template: false,
  cover: null,
  properties: {},
  created_at: '',
  updated_at: '',
  deleted_at: null,
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

test('expands ancestors of the selection and renames/creates via the row menu', () => {
  const onCreate = vi.fn()
  const onRename = vi.fn()
  render(
    <Sidebar
      pages={[
        page('one', 'Projects', null, 'a0'),
        page('two', 'Launch', 'one', 'a0'),
      ]}
      selectedId="two"
      onSelect={vi.fn()}
      onCreate={onCreate}
      onRename={onRename}
      onMove={vi.fn()}
      onDelete={vi.fn()}
      onOpenTrash={vi.fn()}
    />,
  )

  // The selected page's ancestor chain is auto-expanded.
  expect(screen.getByText('Launch')).toBeVisible()

  fireEvent.click(screen.getByRole('button', { name: 'Projects options' }))
  const input = screen.getByRole('textbox', { name: 'Rename Projects' })
  fireEvent.change(input, { target: { value: 'Work' } })
  fireEvent.blur(input)
  expect(onRename).toHaveBeenCalledWith('one', 'Work')

  fireEvent.click(screen.getByRole('button', { name: 'Sub-page' }))
  expect(onCreate).toHaveBeenCalledWith('one')
})

const renderTree = (onMove = vi.fn()) => {
  Element.prototype.setPointerCapture = vi.fn()
  const { container } = render(
    <Sidebar
      pages={[
        page('one', 'One', null, 'a000000'),
        page('two', 'Two', null, 'a000001'),
        page('three', 'Three', null, 'a000002'),
      ]}
      onSelect={vi.fn()}
      onCreate={vi.fn()}
      onRename={vi.fn()}
      onMove={onMove}
      onDelete={vi.fn()}
      onOpenTrash={vi.fn()}
    />,
  )
  const rows = [...container.querySelectorAll<HTMLElement>('[data-page-id]')]
  rows.forEach((row, index) => {
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      top: index * 40,
      bottom: index * 40 + 36,
      left: 0,
      right: 240,
      width: 240,
      height: 36,
      x: 0,
      y: index * 40,
      toJSON: () => ({}),
    })
  })
  return { rows, onMove }
}

test('mouse drag activates on movement and shows a live drop hint', () => {
  const { rows, onMove } = renderTree()
  const handle = screen.getByRole('button', { name: 'One options' })

  fireEvent.pointerDown(handle, { pointerId: 1, clientX: 10, clientY: 0 })
  // First move past the click threshold arms the drag…
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: 10, clientY: 90 })
  expect(rows[0]).toHaveStyle({ transform: 'translateY(90px) scale(1.03)' })
  // …and the next move paints the drop hint on the target row.
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: 10, clientY: 90 })
  expect(rows[2].className).toContain('drop-after')
  // Pointer at the left edge → the hint sits at root depth.
  expect(rows[2].style.getPropertyValue('--drop-depth-indent')).toBe('0px')
  fireEvent.pointerUp(handle, { pointerId: 1, clientX: 10, clientY: 90 })
  fireEvent.click(handle)

  expect(rows[2].className).not.toContain('drop-after')
  expect(onMove).toHaveBeenCalledWith('one', null, 'a000002')
  // The click after a drag is suppressed — no row menu opens.
  expect(screen.queryByText('Edit page')).toBeNull()
})

test('a deliberate rightward drag nests under the row above the gap', () => {
  const { onMove } = renderTree()
  const handle = screen.getByRole('button', { name: 'One options' })

  fireEvent.pointerDown(handle, { pointerId: 1, clientX: 10, clientY: 0 })
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: 100, clientY: 90 })
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: 100, clientY: 90 })
  fireEvent.pointerUp(handle, { pointerId: 1, clientX: 100, clientY: 90 })

  expect(onMove).toHaveBeenCalledWith('one', 'three', 'a000000')
})

test('touch reorders after a stationary long-press on the row handle', () => {
  const { rows, onMove } = renderTree()
  const handle = screen.getByRole('button', { name: 'One options' })
  vi.useFakeTimers()

  fireEvent.pointerDown(handle, {
    pointerType: 'touch',
    pointerId: 1,
    clientX: 10,
    clientY: 0,
  })
  act(() => vi.advanceTimersByTime(375))
  fireEvent.pointerMove(handle, {
    pointerType: 'touch',
    pointerId: 1,
    clientX: 10,
    clientY: 90,
  })
  expect(rows[0]).toHaveStyle({ transform: 'translateY(90px) scale(1.03)' })
  fireEvent.pointerUp(handle, {
    pointerType: 'touch',
    pointerId: 1,
    clientX: 10,
    clientY: 90,
  })

  expect(onMove).toHaveBeenCalledWith('one', null, 'a000002')
})

test('a plain click on the handle still opens the row menu', () => {
  renderTree()
  const handle = screen.getByRole('button', { name: 'One options' })

  fireEvent.pointerDown(handle, { pointerId: 1, clientX: 10, clientY: 0 })
  fireEvent.pointerUp(handle, { pointerId: 1, clientX: 10, clientY: 0 })
  fireEvent.click(handle)

  expect(screen.getByText('Edit page')).toBeVisible()
})
