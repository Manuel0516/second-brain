import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'
import { SettingsNumberField } from './SettingsNumberField'

function Controlled({
  onCommit,
  ...props
}: Partial<React.ComponentProps<typeof SettingsNumberField>> & {
  onCommit?: (v: number | null) => void
}) {
  const [value, setValue] = useState<number | null>(props.value ?? 90)
  return (
    <SettingsNumberField
      id="n"
      label="Rest duration"
      min={10}
      max={600}
      value={value}
      onCommit={(v) => {
        setValue(v)
        onCommit?.(v)
      }}
      {...props}
    />
  )
}

test('keeps a local draft while typing without committing', () => {
  const onCommit = vi.fn()
  render(<Controlled onCommit={onCommit} />)
  const input = screen.getByLabelText('Rest duration') as HTMLInputElement
  fireEvent.change(input, { target: { value: '12' } })
  fireEvent.change(input, { target: { value: '120' } })
  expect(input.value).toBe('120')
  expect(onCommit).not.toHaveBeenCalled()
})

test('commits once on blur', () => {
  const onCommit = vi.fn()
  render(<Controlled onCommit={onCommit} />)
  const input = screen.getByLabelText('Rest duration')
  fireEvent.change(input, { target: { value: '120' } })
  fireEvent.blur(input)
  expect(onCommit).toHaveBeenCalledTimes(1)
  expect(onCommit).toHaveBeenCalledWith(120)
})

test('commits once on Enter and does not double-commit on the following blur', () => {
  const onCommit = vi.fn()
  render(<Controlled onCommit={onCommit} />)
  const input = screen.getByLabelText('Rest duration')
  fireEvent.change(input, { target: { value: '120' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  fireEvent.blur(input)
  expect(onCommit).toHaveBeenCalledTimes(1)
})

test('unchanged blur does not commit', () => {
  const onCommit = vi.fn()
  render(<Controlled onCommit={onCommit} />)
  fireEvent.blur(screen.getByLabelText('Rest duration'))
  expect(onCommit).not.toHaveBeenCalled()
})

test('Escape restores the last committed value without committing', () => {
  const onCommit = vi.fn()
  render(<Controlled onCommit={onCommit} />)
  const input = screen.getByLabelText('Rest duration') as HTMLInputElement
  fireEvent.change(input, { target: { value: '250' } })
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(input.value).toBe('90')
  expect(onCommit).not.toHaveBeenCalled()
})

test('nullable field commits null when cleared', () => {
  const onCommit = vi.fn()
  render(<Controlled nullable onCommit={onCommit} />)
  const input = screen.getByLabelText('Rest duration')
  fireEvent.change(input, { target: { value: '' } })
  fireEvent.blur(input)
  expect(onCommit).toHaveBeenCalledWith(null)
})

test('required field rejects an empty draft and restores the previous value', () => {
  const onCommit = vi.fn()
  render(<Controlled onCommit={onCommit} />)
  const input = screen.getByLabelText('Rest duration') as HTMLInputElement
  fireEvent.change(input, { target: { value: '' } })
  fireEvent.blur(input)
  expect(onCommit).not.toHaveBeenCalled()
  expect(input.value).toBe('90')
})

test('an out-of-range draft is rejected and the previous value restored', () => {
  const onCommit = vi.fn()
  render(<Controlled onCommit={onCommit} />)
  const input = screen.getByLabelText('Rest duration') as HTMLInputElement
  fireEvent.change(input, { target: { value: '9999' } })
  fireEvent.blur(input)
  expect(onCommit).not.toHaveBeenCalled()
  expect(input.value).toBe('90')
})

test('supports decimal steps', () => {
  const onCommit = vi.fn()
  render(
    <Controlled value={10} step={0.1} min={0} max={100} onCommit={onCommit} />,
  )
  const input = screen.getByLabelText('Rest duration')
  fireEvent.change(input, { target: { value: '12.5' } })
  fireEvent.blur(input)
  expect(onCommit).toHaveBeenCalledWith(12.5)
})

test('resyncs the draft when the external value changes while unfocused', () => {
  const { rerender } = render(
    <SettingsNumberField
      id="n"
      label="Rest duration"
      min={10}
      max={600}
      value={90}
      onCommit={vi.fn()}
    />,
  )
  rerender(
    <SettingsNumberField
      id="n"
      label="Rest duration"
      min={10}
      max={600}
      value={150}
      onCommit={vi.fn()}
    />,
  )
  expect(
    (screen.getByLabelText('Rest duration') as HTMLInputElement).value,
  ).toBe('150')
})

test('does not resync the draft while the input has focus', () => {
  const { rerender } = render(
    <SettingsNumberField
      id="n"
      label="Rest duration"
      min={10}
      max={600}
      value={90}
      onCommit={vi.fn()}
    />,
  )
  const input = screen.getByLabelText('Rest duration') as HTMLInputElement
  input.focus()
  fireEvent.change(input, { target: { value: '42' } })
  rerender(
    <SettingsNumberField
      id="n"
      label="Rest duration"
      min={10}
      max={600}
      value={150}
      onCommit={vi.fn()}
    />,
  )
  expect(input.value).toBe('42')
})

test('shows a non-editable suffix label', () => {
  render(<Controlled suffix="seconds" />)
  expect(screen.getByText('seconds')).toBeInTheDocument()
})
