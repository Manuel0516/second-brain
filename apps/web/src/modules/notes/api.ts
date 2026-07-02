import { apiCall } from '../../lib/api'
import type {
  Backlink,
  DatabaseProperty,
  DatabaseView,
  Page,
  SearchResult,
} from './types'

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      detail?: string | { msg?: string }[]
    } | null
    const detail = body?.detail
    const message = Array.isArray(detail)
      ? detail[0]?.msg
      : detail || `Request failed (${response.status})`
    throw new Error(message || 'Request failed')
  }
  return response.json() as Promise<T>
}

export const notesApi = {
  list: () => apiCall('/api/pages').then(json<Page[]>),
  get: (id: string) => apiCall(`/api/pages/${id}`).then(json<Page>),
  create: (
    input: Partial<Pick<Page, 'title' | 'icon' | 'parent_page_id' | 'type'>>,
  ) =>
    apiCall('/api/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(json<Page>),
  patch: (
    id: string,
    input: Partial<
      Pick<
        Page,
        | 'title'
        | 'icon'
        | 'content'
        | 'parent_page_id'
        | 'position'
        | 'type'
        | 'is_template'
        | 'cover'
        | 'properties'
      >
    >,
  ) =>
    apiCall(`/api/pages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(json<Page>),
  remove: (id: string) =>
    apiCall(`/api/pages/${id}`, { method: 'DELETE' }).then((response) => {
      if (!response.ok) return json<never>(response)
    }),
  trash: () => apiCall('/api/pages/trash').then(json<Page[]>),
  restore: (id: string) =>
    apiCall(`/api/pages/${id}/restore`, { method: 'POST' }).then(json<Page>),
  duplicate: (id: string) =>
    apiCall(`/api/pages/${id}/duplicate`, { method: 'POST' }).then(json<Page>),
  properties: (pageId: string) =>
    apiCall(`/api/pages/${pageId}/properties`).then(json<DatabaseProperty[]>),
  createProperty: (
    pageId: string,
    input: Pick<DatabaseProperty, 'name' | 'type'> &
      Partial<Pick<DatabaseProperty, 'config'>>,
  ) =>
    apiCall(`/api/pages/${pageId}/properties`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(json<DatabaseProperty>),
  patchProperty: (
    id: string,
    input: Partial<Pick<DatabaseProperty, 'name' | 'type' | 'config'>>,
  ) =>
    apiCall(`/api/properties/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(json<DatabaseProperty>),
  removeProperty: (id: string) =>
    apiCall(`/api/properties/${id}`, { method: 'DELETE' }).then((response) => {
      if (!response.ok) return json<never>(response)
    }),
  views: (pageId: string) =>
    apiCall(`/api/pages/${pageId}/views`).then(json<DatabaseView[]>),
  createView: (
    pageId: string,
    input: Partial<Pick<DatabaseView, 'name' | 'type' | 'config'>>,
  ) =>
    apiCall(`/api/pages/${pageId}/views`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(json<DatabaseView>),
  patchView: (
    id: string,
    input: Partial<Pick<DatabaseView, 'name' | 'type' | 'config'>>,
  ) =>
    apiCall(`/api/views/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(json<DatabaseView>),
  removeView: (id: string) =>
    apiCall(`/api/views/${id}`, { method: 'DELETE' }).then((response) => {
      if (!response.ok) return json<never>(response)
    }),
  backlinks: (type: string, id: string) =>
    apiCall(`/api/nodes/${type}/${id}/backlinks`).then(json<Backlink[]>),
  search: (query: string) =>
    query.trim()
      ? apiCall(`/api/search?q=${encodeURIComponent(query)}`).then(
          json<SearchResult[]>,
        )
      : apiCall('/api/pages')
          .then(json<Page[]>)
          .then((pages) =>
            pages.slice(0, 50).map(({ id, title }) => ({
              id,
              title,
              type: 'page' as const,
            })),
          ),
}
