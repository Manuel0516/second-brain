import type { JSONContent } from '@tiptap/react'

export type NodeType = 'page' | 'event'

export interface Page {
  id: string
  title: string
  icon: string | null
  content: JSONContent
  parent_page_id: string | null
  position: string
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export interface Backlink {
  id: string
  source_type: NodeType
  source_id: string
  title: string
  relation: string
}

export interface SearchResult {
  id: string
  type: NodeType
  title: string
}

export const EMPTY_DOCUMENT: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}
