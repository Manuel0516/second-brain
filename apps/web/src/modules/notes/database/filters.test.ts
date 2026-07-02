import { expect, test } from 'vitest'
import { applyFilters, applySort, groupRecords } from './filters'
import type { DatabaseProperty, Page } from '../types'

const record = (id: string, properties: Record<string, unknown>): Page => ({
  id,
  title: id,
  icon: null,
  content: { type: 'doc', content: [] },
  parent_page_id: 'db',
  position: 'a0',
  type: 'page',
  is_template: false,
  cover: null,
  properties,
  created_at: '',
  updated_at: '',
})

const numberProp: DatabaseProperty = {
  id: 'n',
  page_id: 'db',
  name: 'Amount',
  type: 'number',
  config: {},
  position: 'a0',
}

test('filters match scalars and multi-select arrays', () => {
  const records = [
    record('a', { s: 'Todo', tags: ['x'] }),
    record('b', { s: 'Done', tags: ['x', 'y'] }),
    record('c', {}),
  ]
  expect(
    applyFilters(records, { filters: [{ property: 's', equals: 'Done' }] }),
  ).toEqual([records[1]])
  expect(
    applyFilters(records, { filters: [{ property: 'tags', equals: 'x' }] }),
  ).toHaveLength(2)
})

test('sorts numbers numerically and puts empty values last', () => {
  const records = [
    record('a', { n: 10 }),
    record('b', {}),
    record('c', { n: 2 }),
  ]
  const sorted = applySort(records, { sort: { property: 'n', dir: 'asc' } }, [
    numberProp,
  ])
  expect(sorted.map((r) => r.id)).toEqual(['c', 'a', 'b'])
  const reversed = applySort(
    records,
    { sort: { property: 'n', dir: 'desc' } },
    [numberProp],
  )
  expect(reversed.map((r) => r.id)).toEqual(['a', 'c', 'b'])
})

test('groups by select option with unknown values in the empty group', () => {
  const records = [
    record('a', { s: 'Todo' }),
    record('b', { s: 'Gone' }),
    record('c', {}),
  ]
  const groups = groupRecords(records, 's', ['Todo', 'Done'])
  expect([...groups.keys()]).toEqual(['', 'Todo', 'Done'])
  expect(groups.get('Todo')!.map((r) => r.id)).toEqual(['a'])
  expect(groups.get('')!.map((r) => r.id)).toEqual(['b', 'c'])
})
