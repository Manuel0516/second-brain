import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'
import { Dropdown } from '../../../components/Dropdown'

const lowlight = createLowlight(common)

// Curated subset of lowlight's common bundle; plaintext is the safe default.
const LANGUAGES = [
  'plaintext',
  'bash',
  'c',
  'cpp',
  'css',
  'go',
  'html',
  'java',
  'javascript',
  'json',
  'markdown',
  'python',
  'rust',
  'sql',
  'typescript',
  'yaml',
].map((value) => ({ value, label: value }))

function CodeBlockNodeView({ node, updateAttributes }: NodeViewProps) {
  return (
    <NodeViewWrapper className="notes-codeblock">
      <div className="notes-codeblock-header" contentEditable={false}>
        <Dropdown
          ariaLabel="Code language"
          className="notes-codeblock-lang"
          value={(node.attrs.language as string) || 'plaintext'}
          onChange={(language) => updateAttributes({ language })}
          options={LANGUAGES}
        />
      </div>
      <pre>
        <NodeViewContent as={'code' as never} />
      </pre>
    </NodeViewWrapper>
  )
}

/** Code block with lowlight syntax highlighting + a language picker. */
export const NotesCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView)
  },
}).configure({ lowlight, defaultLanguage: 'plaintext' })
