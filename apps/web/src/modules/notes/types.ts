import type { JSONContent } from '@tiptap/react'

export type NodeType = 'page' | 'event'

export interface Page {
  id: string
  title: string
  icon: string | null
  content: JSONContent
  parent_page_id: string | null
  position: string
  type: 'page' | 'database' | 'folder'
  is_template: boolean
  cover: string | null
  properties: Record<string, unknown>
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export type PropertyType =
  | 'text'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'date'
  | 'checkbox'
  | 'url'
  | 'relation'

export interface DatabaseProperty {
  id: string
  page_id: string
  name: string
  type: PropertyType
  config: { options?: string[] }
  position: string
}

export type ViewType = 'table' | 'list' | 'board' | 'calendar' | 'gallery'

export interface ViewConfig {
  group_by?: string
  date_by?: string
  sort?: { property: string; dir: 'asc' | 'desc' }
  filters?: PropertyFilter[]
}

export interface PropertyFilter {
  property: string
  equals: unknown
}

export interface DatabaseView {
  id: string
  page_id: string
  name: string
  type: ViewType
  config: ViewConfig
  position: string
}

export interface Backlink {
  id: string
  source_type: NodeType
  source_id: string
  title: string
  relation: string
  parent_title?: string | null
}

export interface SearchResult {
  id: string
  type: NodeType
  title: string
  parent_title?: string | null
}

export const EMPTY_DOCUMENT: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}
