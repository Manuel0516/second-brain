// Pure filter/sort/group helpers for database views. All evaluation happens in
// the frontend over the loaded record list (single user, small corpora).
import type { DatabaseProperty, Page, ViewConfig } from '../types'

export function recordValue(record: Page, propertyId: string): unknown {
  return record.properties?.[propertyId]
}

export function applyFilters(records: Page[], config: ViewConfig): Page[] {
  const filters = config.filters ?? []
  if (!filters.length) return records
  return records.filter((record) =>
    filters.every((filter) => {
      const value = recordValue(record, filter.property)
      if (Array.isArray(value)) return value.includes(filter.equals)
      return (value ?? null) === (filter.equals ?? null)
    }),
  )
}

export function applySort(
  records: Page[],
  config: ViewConfig,
  properties: DatabaseProperty[],
): Page[] {
  const sort = config.sort
  if (!sort) return records
  const property = properties.find((item) => item.id === sort.property)
  const direction = sort.dir === 'desc' ? -1 : 1
  return [...records].sort((a, b) => {
    const left = recordValue(a, sort.property)
    const right = recordValue(b, sort.property)
    if (left == null && right == null) return 0
    if (left == null) return 1
    if (right == null) return -1
    if (property?.type === 'number')
      return (Number(left) - Number(right)) * direction
    if (property?.type === 'checkbox')
      return (Number(Boolean(left)) - Number(Boolean(right))) * direction
    return String(left).localeCompare(String(right)) * direction
  })
}

/** Group records by a select property. Records without a value land in ''. */
export function groupRecords(
  records: Page[],
  propertyId: string | undefined,
  options: string[],
): Map<string, Page[]> {
  const groups = new Map<string, Page[]>()
  for (const option of ['', ...options]) groups.set(option, [])
  for (const record of records) {
    const raw = propertyId ? recordValue(record, propertyId) : undefined
    const key = typeof raw === 'string' && options.includes(raw) ? raw : ''
    groups.get(key)!.push(record)
  }
  return groups
}
