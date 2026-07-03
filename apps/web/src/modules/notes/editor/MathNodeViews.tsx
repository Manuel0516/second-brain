import { useEffect, useRef, useState, type FocusEvent } from 'react'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import katex from 'katex'

function renderLatex(latex: string, displayMode: boolean) {
  return {
    __html: katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
    }),
  }
}

function focusNode({ editor, getPos }: ReactNodeViewProps, after = false) {
  requestAnimationFrame(() => {
    if (editor.isDestroyed) return
    try {
      const pos = getPos()
      if (pos == null) return
      if (after)
        editor
          .chain()
          .focus()
          .setTextSelection(pos + 1)
          .run()
      else editor.chain().focus().setNodeSelection(pos).run()
    } catch {
      // ponytail: deleting a node invalidates getPos; its transaction already
      // mapped the selection, so only restore editor focus.
      editor.commands.focus()
    }
  })
}

export function InlineMathView(props: ReactNodeViewProps) {
  const { editor, node, updateAttributes, deleteNode } = props
  const [editing, setEditing] = useState(!node.attrs.latex || props.selected)
  const [latex, setLatex] = useState(node.attrs.latex as string)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = (restoreFocus = true) => {
    const value = latex.trim()
    if (!value) deleteNode()
    else updateAttributes({ latex: value })
    setEditing(false)
    if (restoreFocus) focusNode(props, true)
  }

  if (editing && editor.isEditable) {
    return (
      <NodeViewWrapper as="span" className="math-node math-node-inline">
        <input
          ref={inputRef}
          className="math-node-inline-input"
          aria-label="Inline LaTeX"
          value={latex}
          placeholder="LaTeX"
          onChange={(event) => setLatex(event.target.value)}
          onBlur={() => commit(false)}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
            if (event.key === 'Escape') {
              setEditing(false)
              setLatex(node.attrs.latex as string)
              focusNode(props, true)
            }
          }}
        />
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper as="span" className="math-node math-node-inline">
      <button
        type="button"
        className="math-node-rendered math-node-inline-rendered"
        aria-label="Edit inline equation"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (!editor.isEditable) return
          setLatex(node.attrs.latex as string)
          setEditing(true)
        }}
        dangerouslySetInnerHTML={renderLatex(node.attrs.latex as string, false)}
      />
    </NodeViewWrapper>
  )
}

function equationNumber({ editor, getPos }: ReactNodeViewProps) {
  const current = getPos()
  let number = 0
  if (current == null) return number
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'blockMath' && pos <= current) number += 1
  })
  return number
}

export function BlockMathView(props: ReactNodeViewProps) {
  const { editor, node, updateAttributes, deleteNode } = props
  const [editing, setEditing] = useState(!node.attrs.latex)
  const [latex, setLatex] = useState(node.attrs.latex as string)
  const [label, setLabel] = useState((node.attrs.label as string) ?? '')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = (restoreFocus = true) => {
    const value = latex.trim()
    if (!value) deleteNode()
    else updateAttributes({ latex: value, label: label.trim() })
    setEditing(false)
    if (restoreFocus) focusNode(props)
  }

  if (editing && editor.isEditable) {
    return (
      <NodeViewWrapper
        className="math-node math-node-block math-node-block-editing"
        onBlur={(event: FocusEvent<HTMLDivElement>) => {
          if (!event.currentTarget.contains(event.relatedTarget)) commit(false)
        }}
      >
        <textarea
          ref={inputRef}
          className="math-node-block-input"
          aria-label="Equation LaTeX"
          value={latex}
          placeholder="Write LaTeX…"
          onChange={(event) => setLatex(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              commit()
            }
            if (event.key === 'Escape') {
              setEditing(false)
              setLatex(node.attrs.latex as string)
              setLabel((node.attrs.label as string) ?? '')
              focusNode(props)
            }
          }}
        />
        <label className="math-node-label-field">
          <span>Equation label</span>
          <input
            aria-label="Equation label"
            value={label}
            placeholder="Auto"
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter') {
                event.preventDefault()
                commit()
              }
            }}
          />
        </label>
      </NodeViewWrapper>
    )
  }

  const displayedLabel =
    (node.attrs.label as string) || String(equationNumber(props))
  return (
    <NodeViewWrapper className="math-node math-node-block">
      <button
        type="button"
        className="math-node-rendered math-node-block-rendered"
        aria-label="Edit block equation"
        onClick={() => {
          if (!editor.isEditable) return
          setLatex(node.attrs.latex as string)
          setLabel((node.attrs.label as string) ?? '')
          setEditing(true)
        }}
      >
        <span
          className="math-node-block-output"
          dangerouslySetInnerHTML={renderLatex(
            node.attrs.latex as string,
            true,
          )}
        />
        <span className="math-node-equation-number">({displayedLabel})</span>
      </button>
    </NodeViewWrapper>
  )
}
