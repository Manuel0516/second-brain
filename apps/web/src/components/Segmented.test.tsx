import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'
import { Segmented } from './Segmented'

function Controlled({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState('a')
  return (
    <Segmented
      value={value}
      options={['a', 'b', 'c']}
      onChange={(v) => {
        setValue(v)
        onChange?.(v)
      }}
      ariaLabel="Letters"
    />
  )
}

test('only the checked option is a tab stop', () => {
  render(<Controlled />)
  const [a, b, c] = screen.getAllByRole('radio')
  expect(a).toHaveAttribute('tabIndex', '0')
  expect(b).toHaveAttribute('tabIndex', '-1')
  expect(c).toHaveAttribute('tabIndex', '-1')
  expect(a).toHaveAttribute('aria-checked', 'true')
})

test('ArrowRight/ArrowDown move forward and wrap at the end', () => {
  const onChange = vi.fn()
  render(<Controlled onChange={onChange} />)
  const [a, b, c] = screen.getAllByRole('radio')

  fireEvent.keyDown(a, { key: 'ArrowRight' })
  expect(onChange).toHaveBeenLastCalledWith('b')
  expect(b).toHaveFocus()

  fireEvent.keyDown(b, { key: 'ArrowDown' })
  expect(onChange).toHaveBeenLastCalledWith('c')
  expect(c).toHaveFocus()

  fireEvent.keyDown(c, { key: 'ArrowRight' })
  expect(onChange).toHaveBeenLastCalledWith('a')
  expect(a).toHaveFocus()
})

test('ArrowLeft/ArrowUp move backward and wrap at the start', () => {
  const onChange = vi.fn()
  render(<Controlled onChange={onChange} />)
  const [a] = screen.getAllByRole('radio')

  fireEvent.keyDown(a, { key: 'ArrowLeft' })
  expect(onChange).toHaveBeenLastCalledWith('c')
  expect(screen.getAllByRole('radio')[2]).toHaveFocus()
})

test('Home and End jump to the first and last option', () => {
  const onChange = vi.fn()
  render(<Controlled onChange={onChange} />)
  const [a, , c] = screen.getAllByRole('radio')

  fireEvent.keyDown(a, { key: 'End' })
  expect(onChange).toHaveBeenLastCalledWith('c')
  expect(c).toHaveFocus()

  fireEvent.keyDown(c, { key: 'Home' })
  expect(onChange).toHaveBeenLastCalledWith('a')
  expect(a).toHaveFocus()
})

test('keyboard selection calls onChange exactly once', () => {
  const onChange = vi.fn()
  render(<Controlled onChange={onChange} />)
  fireEvent.keyDown(screen.getAllByRole('radio')[0], { key: 'ArrowRight' })
  expect(onChange).toHaveBeenCalledTimes(1)
})

test('click still selects without requiring keyboard focus first', () => {
  const onChange = vi.fn()
  render(<Controlled onChange={onChange} />)
  fireEvent.click(screen.getAllByRole('radio')[2])
  expect(onChange).toHaveBeenCalledWith('c')
})
