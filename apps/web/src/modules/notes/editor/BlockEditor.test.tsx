import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import { expect, test, vi } from 'vitest'
import { BlockEditor } from './BlockEditor'
import { EditableInlineMath, insertEditableInlineMath } from './MathExtensions'
import { EditableTaskItem } from './TaskItemExtension'
import { LinkPopover } from './LinkPopover'

test('link form normalizes web addresses and rejects unsafe protocols', () => {
  const onApply = vi.fn()
  const { rerender } = render(
    <LinkPopover
      key="safe"
      initialHref=""
      onApply={onApply}
      onCancel={vi.fn()}
    />,
  )
  fireEvent.change(screen.getByRole('textbox', { name: 'Link URL' }), {
    target: { value: 'example.com' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
  expect(onApply).toHaveBeenCalledWith('https://example.com')

  onApply.mockClear()
  rerender(
    <LinkPopover
      key="unsafe"
      initialHref="javascript:alert(1)"
      onApply={onApply}
      onCancel={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
  expect(onApply).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid')
})

test('linked words render as links in the editor', async () => {
  render(
    <BlockEditor
      onChange={vi.fn()}
      content={{
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'OpenAI',
                marks: [
                  {
                    type: 'link',
                    attrs: { href: 'https://openai.com' },
                  },
                ],
              },
            ],
          },
        ],
      }}
    />,
  )

  expect(await screen.findByRole('link', { name: 'OpenAI' })).toHaveAttribute(
    'href',
    'https://openai.com',
  )
})

test('selected text becomes the editable inline equation source', () => {
  const editor = new Editor({
    extensions: [StarterKit, EditableInlineMath],
    content: '<p>x+y</p>',
  })
  editor.commands.setTextSelection({ from: 1, to: 4 })

  expect(insertEditableInlineMath(editor)).toBe(true)
  expect(editor.getJSON().content?.[0].content?.[0]).toMatchObject({
    type: 'inlineMath',
    attrs: { latex: 'x+y' },
  })
  expect(editor.state.selection.from).toBe(1)
  expect(editor.state.selection.to).toBe(2)
  editor.destroy()
})

test('a new todo keeps an editable text paragraph', () => {
  const editor = new Editor({
    extensions: [StarterKit, TaskList, EditableTaskItem],
    content: '<p></p>',
  })

  expect(editor.commands.toggleTaskList()).toBe(true)
  expect(editor.commands.insertContent('Write this task')).toBe(true)
  expect(editor.getJSON().content?.[0]).toMatchObject({
    type: 'taskList',
    content: [
      {
        type: 'taskItem',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Write this task' }],
          },
        ],
      },
    ],
  })
  editor.destroy()
})

test('renders and edits inline and block mathematics in place', async () => {
  const onChange = vi.fn()
  const { container } = render(
    <BlockEditor
      onChange={onChange}
      debounceMs={0}
      content={{
        type: 'doc',
        content: [
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: false },
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Ship it' }],
                  },
                ],
              },
            ],
          },
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableHeader',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Name' }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'paragraph',
            content: [{ type: 'inlineMath', attrs: { latex: 'x^2' } }],
          },
          { type: 'blockMath', attrs: { latex: '\\sum_i x_i' } },
        ],
      }}
    />,
  )

  expect(await screen.findByText('Ship it')).toBeVisible()
  expect(
    screen.getByText('Ship it').closest('.notes-task-content'),
  ).toHaveAttribute('contenteditable', 'true')
  const task = screen.getByRole('checkbox')
  expect(task).toBeVisible()
  fireEvent.click(task)
  expect(screen.getByRole('table')).toBeVisible()
  await waitFor(() =>
    expect(container.querySelectorAll('.katex')).toHaveLength(2),
  )
  expect(screen.getByText('(1)')).toBeVisible()

  fireEvent.click(screen.getByRole('button', { name: 'Edit inline equation' }))
  const inlineInput = screen.getByRole('textbox', { name: 'Inline LaTeX' })
  fireEvent.change(inlineInput, { target: { value: 'y^3' } })
  fireEvent.keyDown(inlineInput, { key: 'Enter' })
  expect(
    screen.queryByRole('textbox', { name: 'Inline LaTeX' }),
  ).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Edit inline equation' }))
  const reopenedInline = screen.getByRole('textbox', { name: 'Inline LaTeX' })
  fireEvent.change(reopenedInline, { target: { value: 'z^4' } })
  fireEvent.blur(reopenedInline)
  expect(
    screen.queryByRole('textbox', { name: 'Inline LaTeX' }),
  ).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Edit block equation' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Equation LaTeX' }), {
    target: { value: 'E=mc^2' },
  })
  fireEvent.change(screen.getByRole('textbox', { name: 'Equation label' }), {
    target: { value: 'energy' },
  })
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Equation LaTeX' }), {
    key: 'Enter',
  })
  expect(screen.getByText('(energy)')).toBeVisible()

  await waitFor(() => {
    const saved = onChange.mock.calls.at(-1)?.[0]
    expect(saved.content[0].content[0].attrs.checked).toBe(true)
    expect(saved.content[2].content[0].attrs.latex).toBe('z^4')
    expect(saved.content[3].attrs).toMatchObject({
      latex: 'E=mc^2',
      label: 'energy',
    })
  })
})
