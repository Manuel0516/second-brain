import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { PageTree } from './PageTree'
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
  created_at: '',
  updated_at: '',
  deleted_at: null,
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

test('renders nesting and supports inline rename and child creation', () => {
  const onCreate = vi.fn()
  const onRename = vi.fn()
  render(
    <PageTree
      pages={[
        page('one', 'Projects', null, 'a0'),
        page('two', 'Launch', 'one', 'a0'),
      ]}
      onSelect={vi.fn()}
      onCreate={onCreate}
      onRename={onRename}
      onMove={vi.fn()}
      onDelete={vi.fn()}
      onOpenTrash={vi.fn()}
    />,
  )

  expect(screen.getByRole('button', { name: 'Launch' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Add child to Projects' }))
  expect(onCreate).toHaveBeenCalledWith('one')
  fireEvent.doubleClick(screen.getByRole('button', { name: 'Projects' }))
  const input = screen.getByRole('textbox', { name: 'Rename Projects' })
  fireEvent.change(input, { target: { value: 'Work' } })
  fireEvent.blur(input)
  expect(onRename).toHaveBeenCalledWith('one', 'Work')
})

test('reorders pages after a stationary touch hold', () => {
  Element.prototype.setPointerCapture = vi.fn()
  const onMove = vi.fn()
  const onSelect = vi.fn()
  const { container } = render(
    <PageTree
      pages={[
        page('one', 'One', null, 'a000000'),
        page('two', 'Two', null, 'a000001'),
        page('three', 'Three', null, 'a000002'),
      ]}
      onSelect={onSelect}
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
  const title = screen.getByRole('button', { name: 'One' })
  vi.useFakeTimers()

  fireEvent.pointerDown(title, {
    pointerType: 'touch',
    pointerId: 1,
    clientX: 10,
    clientY: 0,
  })
  act(() => vi.advanceTimersByTime(650))
  fireEvent.pointerMove(title, {
    pointerType: 'touch',
    pointerId: 1,
    clientX: 10,
    clientY: 90,
  })
  expect(rows[0]).toHaveStyle({ transform: 'translateY(90px) scale(1.02)' })
  fireEvent.pointerUp(title, {
    pointerType: 'touch',
    pointerId: 1,
    clientX: 10,
    clientY: 90,
  })
  fireEvent.click(title)

  expect(onMove).toHaveBeenCalledWith('one', null, 'a000002')
  expect(onSelect).not.toHaveBeenCalled()
})
