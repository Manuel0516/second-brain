import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { expect, test } from 'vitest'
import { applyColumnDrop, Column, ColumnList } from './ColumnNodes'

const paragraph = (text: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
})

const twoColumns = {
  type: 'doc',
  content: [
    {
      type: 'columnList',
      content: [
        { type: 'column', content: [paragraph('alpha')] },
        { type: 'column', content: [paragraph('beta')] },
      ],
    },
  ],
}

function createEditor(content: object) {
  return new Editor({
    extensions: [StarterKit, ColumnList, Column],
    content,
  })
}

test('setColumnLayout wraps the block once and puts the caret in the new column', () => {
  const editor = createEditor({ type: 'doc', content: [paragraph('alpha')] })
  editor.commands.setTextSelection(3)

  expect(editor.commands.setColumnLayout(2)).toBe(true)
  const doc = editor.state.doc
  // 'alpha' exists exactly once — the block was wrapped, not duplicated.
  expect(doc.textContent).toBe('alpha')
  const list = doc.firstChild!
  expect(list.type.name).toBe('columnList')
  expect(list.childCount).toBe(2)
  expect(list.child(0).textContent).toBe('alpha')
  expect(list.child(1).textContent).toBe('')
  // Caret sits in the empty column, which also keeps it from dissolving.
  const { $from } = editor.state.selection
  expect($from.node(2).eq(list.child(1))).toBe(true)
})

test('dropping a block on the right edge of another creates a two-column row', () => {
  const editor = createEditor({
    type: 'doc',
    content: [paragraph('alpha'), paragraph('beta')],
  })
  const betaPos = editor.state.doc.firstChild!.nodeSize
  const selection = NodeSelection.create(editor.state.doc, betaPos)
  editor.view.dispatch(editor.state.tr.setSelection(selection))

  expect(
    applyColumnDrop(
      editor.view,
      { pos: 0, side: 'right' },
      selection.content(),
    ),
  ).toBe(true)
  const doc = editor.state.doc
  // The dragged block moved — it exists only inside the new column.
  expect(doc.textContent).toBe('alphabeta')
  const list = doc.firstChild!
  expect(list.type.name).toBe('columnList')
  expect(list.child(0).textContent).toBe('alpha')
  expect(list.child(1).textContent).toBe('beta')
})

test('dropping onto a columnList edge appends a third column', () => {
  const editor = createEditor({
    type: 'doc',
    content: [...twoColumns.content, paragraph('gamma')],
  })
  const gammaPos = editor.state.doc.firstChild!.nodeSize
  const selection = NodeSelection.create(editor.state.doc, gammaPos)
  editor.view.dispatch(editor.state.tr.setSelection(selection))

  expect(
    applyColumnDrop(
      editor.view,
      { pos: 0, side: 'right' },
      selection.content(),
    ),
  ).toBe(true)
  const list = editor.state.doc.firstChild!
  expect(list.childCount).toBe(3)
  expect(list.child(2).textContent).toBe('gamma')
})

test('removing the last block of a column dissolves the layout without losing content', () => {
  const editor = createEditor(twoColumns)
  // Delete the beta paragraph (as a drag out of the column would).
  const list = editor.state.doc.firstChild!
  const betaPos = 1 + list.child(0).nodeSize + 1
  editor.view.dispatch(
    editor.state.tr.setSelection(
      NodeSelection.create(editor.state.doc, betaPos),
    ),
  )
  editor.commands.deleteSelection()
  // The caret guard keeps the now-empty column alive; the next edit
  // elsewhere dissolves it.
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 3)),
  )
  editor.commands.insertContent('!')

  const doc = editor.state.doc
  expect(doc.firstChild!.type.name).toBe('paragraph')
  expect(doc.textContent).toBe('al!pha')
  expect(JSON.stringify(editor.getJSON()).includes('columnList')).toBe(false)
})
