import { ReactNodeViewRenderer } from '@tiptap/react'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'
import { CodeBlockNodeView } from './CodeBlockNodeView'

const lowlight = createLowlight(common)

/** Code block with lowlight syntax highlighting + a language picker. */
export const NotesCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView)
  },
}).configure({ lowlight, defaultLanguage: 'plaintext' })
