import { useEffect, useState } from 'react'
import { notesApi } from './api'
import type { Backlink } from './types'

interface BacklinksProps {
  nodeType: 'page' | 'event'
  nodeId: string
  onOpen?: (backlink: Backlink) => void
}

export function Backlinks({ nodeType, nodeId, onOpen }: BacklinksProps) {
  const [items, setItems] = useState<Backlink[]>([])

  useEffect(() => {
    let active = true
    notesApi
      .backlinks(nodeType, nodeId)
      .then((result) => active && setItems(result))
      .catch(() => active && setItems([]))
    return () => {
      active = false
    }
  }, [nodeId, nodeType])

  return (
    <section className="notes-linked" aria-labelledby={`linked-${nodeId}`}>
      <h2 id={`linked-${nodeId}`}>Linked</h2>
      {!items.length && <p>No linked pages or events.</p>}
      <div className="notes-linked-list">
        {items.map((item) => (
          <button key={item.id} type="button" onClick={() => onOpen?.(item)}>
            <span aria-hidden="true">
              {item.source_type === 'event' ? '◷' : '▧'}
            </span>
            {item.title || 'Untitled'}
          </button>
        ))}
      </div>
    </section>
  )
}
