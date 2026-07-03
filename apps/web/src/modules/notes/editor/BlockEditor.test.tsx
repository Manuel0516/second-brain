import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import { expect, test, vi } from 'vitest'
import { BlockEditor, deleteBlock, duplicateBlock } from './BlockEditor'
import { BlockColor, setSelectedBlockColor } from './ColorExtensions'
import {
  collapsedHeadingRange,
  CollapsibleHeading,
  selectCollapsedHeadingSection,
} from './CollapsibleHeading'
import { stripDetails } from './migrateContent'
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

test('stripDetails rewrites legacy toggle blocks into headings', () => {
  const migrated = stripDetails({
    type: 'doc',
    content: [
      {
        type: 'details',
        content: [
          {
            type: 'detailsSummary',
            content: [{ type: 'text', text: 'Section' }],
          },
          {
            type: 'detailsContent',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
            ],
          },
        ],
      },
      { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
    ],
  })
  expect(migrated.content).toEqual([
    {
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Section' }],
    },
    { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
  ])
  // Idempotent: running it again changes nothing.
  expect(stripDetails(migrated)).toEqual(migrated)
})

test('a collapsed heading hides following blocks until a peer heading', () => {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ heading: false }),
      CollapsibleHeading.configure({ levels: [1, 2, 3] }),
    ],
    content: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2, collapsed: true },
          content: [{ type: 'text', text: 'Hidden section' }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'covered' }] },
        {
          type: 'heading',
          attrs: { level: 3, collapsed: false },
          content: [{ type: 'text', text: 'Deeper' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'also covered' }],
        },
        {
          type: 'heading',
          attrs: { level: 2, collapsed: false },
          content: [{ type: 'text', text: 'Visible peer' }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'visible' }] },
      ],
    },
  })
  const html = document.createElement('div')
  html.appendChild(editor.view.dom)
  const hidden = editor.view.dom.querySelectorAll('.notes-collapsed-hidden')
  // Paragraph + h3 + paragraph are covered; the peer h2 and its text are not.
  expect(hidden).toHaveLength(3)
  expect(
    editor.view.dom.querySelectorAll('.notes-heading-toggle'),
  ).toHaveLength(3)
  editor.destroy()
})

test('main headings collapse independently and keep toggling repeatedly', async () => {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ heading: false }),
      CollapsibleHeading.configure({ levels: [1, 2, 3] }),
    ],
    content: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'First' }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'First body' }] },
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Second' }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second body' }] },
      ],
    },
  })
  const headingPositions: number[] = []
  editor.state.doc.forEach((node, pos) => {
    if (node.type.name === 'heading') headingPositions.push(pos)
  })

  editor.commands.setTextSelection(
    (editor.state.doc.nodeAt(headingPositions[0])?.nodeSize ?? 0) + 1,
  )
  const dispatch = vi.spyOn(editor.view, 'dispatch')
  fireEvent.pointerDown(
    editor.view.dom.querySelectorAll('.notes-heading-toggle')[0],
  )
  fireEvent.pointerDown(
    editor.view.dom.querySelectorAll('.notes-heading-toggle')[1],
  )

  expect(editor.state.doc.nodeAt(headingPositions[0])?.attrs.collapsed).toBe(
    true,
  )
  expect(editor.state.doc.nodeAt(headingPositions[1])?.attrs.collapsed).toBe(
    true,
  )
  expect(
    editor.view.dom.querySelectorAll('.notes-collapsed-hidden'),
  ).toHaveLength(2)
  expect(editor.view.dom.lastElementChild).toHaveClass(
    'notes-drag-handle-sentinel',
  )
  expect(
    dispatch.mock.calls.some(
      ([transaction]) => transaction.getMeta('lockDragHandle') === true,
    ),
  ).toBe(true)
  await waitFor(() =>
    expect(
      dispatch.mock.calls.some(
        ([transaction]) => transaction.getMeta('lockDragHandle') === false,
      ),
    ).toBe(true),
  )

  for (let index = 0; index < 6; index += 1) {
    fireEvent.pointerDown(
      editor.view.dom.querySelectorAll('.notes-heading-toggle')[0],
    )
    expect(editor.state.doc.nodeAt(headingPositions[0])?.attrs.collapsed).toBe(
      index % 2 === 1,
    )
    expect(editor.state.doc.nodeAt(headingPositions[1])?.attrs.collapsed).toBe(
      true,
    )
  }
  editor.destroy()
})

test('collapsed heading drag selects its complete hidden section', () => {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ heading: false }),
      CollapsibleHeading.configure({ levels: [1, 2, 3] }),
    ],
    content: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1, collapsed: true },
          content: [{ type: 'text', text: 'Section' }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Child' }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'Child body' }] },
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Next section' }],
        },
      ],
    },
  })

  const range = collapsedHeadingRange(editor.state.doc, 0)
  expect(range).not.toBeNull()
  expect(
    editor.state.doc.slice(range!.from, range!.to).content.childCount,
  ).toBe(4)
  expect(selectCollapsedHeadingSection(editor, 0)).toBe(true)
  expect(editor.state.selection.empty).toBe(false)
  expect(editor.state.selection.content().content.childCount).toBe(4)
  expect(editor.state.doc.nodeAt(0)?.attrs.collapsed).toBe(true)
  editor.destroy()
})

test('duplicate and delete act on the block at the cursor', () => {
  const editor = new Editor({
    extensions: [StarterKit],
    content: '<p>alpha</p><p>beta</p>',
  })
  editor.commands.setTextSelection(3) // inside "alpha"

  duplicateBlock(editor)
  expect(editor.getJSON().content?.map((n) => n.content?.[0])).toEqual([
    { type: 'text', text: 'alpha' },
    { type: 'text', text: 'alpha' },
    { type: 'text', text: 'beta' },
  ])

  editor.commands.setTextSelection(3)
  deleteBlock(editor)
  expect(editor.getJSON().content?.map((n) => n.content?.[0])).toEqual([
    { type: 'text', text: 'alpha' },
    { type: 'text', text: 'beta' },
  ])
  editor.destroy()
})

test('block color targets the paragraph inside nested list items', () => {
  const editor = new Editor({
    extensions: [StarterKit, BlockColor],
    content: '<ul><li><p>nested</p></li></ul>',
  })
  editor.commands.setTextSelection(4)

  setSelectedBlockColor(editor, 'accent')

  const { $from } = editor.state.selection
  expect($from.node($from.depth).attrs.blockColor).toBe('accent')
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

  fireEvent.click(screen.getByRole('button', { name: 'Edit inline equation' }))
  const emptyInline = screen.getByRole('textbox', { name: 'Inline LaTeX' })
  fireEvent.change(emptyInline, { target: { value: '' } })
  fireEvent.keyDown(emptyInline, { key: 'Enter' })
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  expect(container.querySelector('.notes-editor')).toBeInTheDocument()
})

test('pasting an image file uploads it and inserts an image block', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => ({ url: '/api/files/test-id' }),
  })
  vi.stubGlobal('fetch', fetchMock)
  try {
    const { container } = render(
      <BlockEditor
        onChange={vi.fn()}
        debounceMs={0}
        content={{ type: 'doc', content: [{ type: 'paragraph' }] }}
      />,
    )
    const surface = container.querySelector('.tiptap')!
    fireEvent.paste(surface, {
      clipboardData: {
        files: [new File(['png-bytes'], 'shot.png', { type: 'image/png' })],
        getData: () => '',
        types: ['Files'],
      },
    })

    await waitFor(() => {
      const image = container.querySelector<HTMLImageElement>(
        'figure.notes-image img',
      )
      expect(image).not.toBeNull()
      expect(image!.src).toContain('/api/files/test-id')
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/files',
      expect.objectContaining({ method: 'POST' }),
    )
  } finally {
    vi.unstubAllGlobals()
  }
})

test('deleting a block inside a list removes only that line, not the whole list', () => {
  const item = (text: string) => ({
    type: 'taskItem',
    attrs: { checked: false },
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })
  const editor = new Editor({
    extensions: [StarterKit, TaskList, EditableTaskItem],
    content: {
      type: 'doc',
      content: [
        {
          type: 'taskList',
          content: [item('one'), item('two'), item('three')],
        },
      ],
    },
  })
  let twoPos = -1
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === 'two') twoPos = pos
    return true
  })
  editor.commands.setTextSelection(twoPos + 1)

  deleteBlock(editor)

  expect(editor.state.doc.textContent).toBe('onethree')
  let items = 0
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'taskItem') items += 1
    return true
  })
  expect(items).toBe(2)
})
