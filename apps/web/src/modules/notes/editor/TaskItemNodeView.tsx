import {
  NodeViewContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
} from '@tiptap/react'

export function TaskItemNodeView({
  editor,
  node,
  updateAttributes,
}: ReactNodeViewProps) {
  const checked = Boolean(node.attrs.checked)

  return (
    <NodeViewWrapper
      as="li"
      className="notes-task-item"
      data-type="taskItem"
      data-checked={String(checked)}
    >
      <label className="notes-task-check" contentEditable={false}>
        <input
          type="checkbox"
          checked={checked}
          disabled={!editor.isEditable}
          aria-label={`Toggle task: ${node.textContent || 'Untitled'}`}
          onChange={(event) =>
            updateAttributes({ checked: event.target.checked })
          }
        />
        <span className="notes-task-checkmark" aria-hidden="true">
          <svg
            width="11"
            height="11"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 6.5l2.5 2.5L10 3" />
          </svg>
        </span>
      </label>
      <NodeViewContent
        as="div"
        className="notes-task-content"
        contentEditable={editor.isEditable}
      />
    </NodeViewWrapper>
  )
}
