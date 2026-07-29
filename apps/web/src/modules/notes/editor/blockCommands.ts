import type { Editor } from '@tiptap/react'

/** Finds the cursor's actionable block without treating a whole list as one block. */
function blockDepth(editor: Editor): number | null {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth >= 1; depth -= 1) {
    const name = $from.node(depth).type.name
    if (name === 'listItem' || name === 'taskItem') return depth
  }
  for (let depth = 1; depth <= $from.depth; depth += 1) {
    const name = $from.node(depth).type.name
    if (name !== 'columnList' && name !== 'column') return depth
  }
  return null
}

export function duplicateBlock(editor: Editor): void {
  const depth = blockDepth(editor)
  if (depth === null) return
  const { $from } = editor.state.selection
  editor
    .chain()
    .focus()
    .insertContentAt($from.after(depth), $from.node(depth).toJSON())
    .run()
}

export function deleteBlock(editor: Editor): void {
  const depth = blockDepth(editor)
  if (depth === null) return
  const { $from } = editor.state.selection
  editor
    .chain()
    .focus()
    .deleteRange({ from: $from.before(depth), to: $from.after(depth) })
    .run()
}
