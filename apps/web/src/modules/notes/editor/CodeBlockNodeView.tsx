import {
  NodeViewContent,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react'
import { Dropdown } from '../../../components/Dropdown'

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

export function CodeBlockNodeView({ node, updateAttributes }: NodeViewProps) {
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
