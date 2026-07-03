import type { JSONContent } from '@tiptap/react'

/**
 * The details/toggle block was removed (replaced by collapsible headings).
 * TipTap throws on unknown node types, so stored documents containing
 * `details` nodes are rewritten on load: the summary becomes an h3 and the
 * hidden content is unwrapped in place. Idempotent — a no-op for documents
 * without details nodes; the migrated doc persists on the next save.
 */
export function stripDetails(doc: JSONContent): JSONContent {
  if (!doc.content) return doc
  return { ...doc, content: doc.content.flatMap(stripDetailsNode) }
}

function stripDetailsNode(node: JSONContent): JSONContent[] {
  if (node.type === 'details') {
    const summary = node.content?.find(
      (child) => child.type === 'detailsSummary',
    )
    const body = node.content?.find((child) => child.type === 'detailsContent')
    const heading: JSONContent = {
      type: 'heading',
      attrs: { level: 3 },
      ...(summary?.content ? { content: summary.content } : {}),
    }
    return [heading, ...(body?.content ?? []).flatMap(stripDetailsNode)]
  }
  if (node.content) {
    return [{ ...node, content: node.content.flatMap(stripDetailsNode) }]
  }
  return [node]
}
