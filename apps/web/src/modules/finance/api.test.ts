import { afterEach, expect, test, vi } from 'vitest'

import {
  fetchFinanceSummary,
  runFinanceAssistantTool,
  runFinanceReconciliation,
  uploadFinanceEvidence,
} from './api'

afterEach(() => {
  vi.restoreAllMocks()
})

function jsonResponse() {
  return new Response('{}', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('requests the summary from the authenticated same-origin API', async () => {
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(jsonResponse())

  await fetchFinanceSummary(2026, 'SE', 'EUR')

  expect(fetchMock).toHaveBeenCalledWith(
    '/api/finance/summary?tax_year=2026&jurisdiction=SE&reporting_currency=EUR',
    expect.objectContaining({ credentials: 'include' }),
  )
})

test('sends mutation idempotency and preserves decimal strings', async () => {
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(jsonResponse())

  await runFinanceReconciliation(
    {
      account_id: 'account-id',
      asset_id: null,
      period_start: '2026-01-01',
      period_end: '2026-12-31',
      opening_balance: '1.2300',
      closing_balance: '4.5600',
      tolerance: '0.0100',
      source_revision_ids: ['revision-id'],
    },
    'reconciliation-key',
  )

  const [, options] = fetchMock.mock.calls[0]
  expect(options).toEqual(
    expect.objectContaining({
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'reconciliation-key',
      },
    }),
  )
  expect(JSON.parse(String(options?.body))).toEqual(
    expect.objectContaining({
      opening_balance: '1.2300',
      closing_balance: '4.5600',
      tolerance: '0.0100',
    }),
  )
})

test('uploads evidence as FormData without overriding its content type', async () => {
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(jsonResponse())
  const file = new File(['date,amount'], 'statement.csv', { type: 'text/csv' })

  await uploadFinanceEvidence(
    {
      file,
      source_kind: 'bank_statement',
      captured_at: '2026-07-29T10:00:00+02:00',
      coverage_start: '2026-01-01',
      coverage_end: '2026-06-30',
    },
    'evidence-key',
  )

  const [, options] = fetchMock.mock.calls[0]
  expect(options).toEqual(
    expect.objectContaining({
      credentials: 'include',
      headers: { 'Idempotency-Key': 'evidence-key' },
    }),
  )
  const form = options?.body as FormData
  expect(form.get('file')).toBe(file)
  expect(form.get('source_kind')).toBe('bank_statement')
  expect(form.get('coverage_start')).toBe('2026-01-01')
  expect(form.get('coverage_end')).toBe('2026-06-30')
})

test('calls read-only assistant tools without a mutation idempotency key', async () => {
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(jsonResponse())

  await runFinanceAssistantTool('list_accounts', {
    scope: { type: 'finance', tax_year: null, jurisdiction: null },
    arguments: {},
  })

  const [, options] = fetchMock.mock.calls[0]
  expect(options).toEqual(
    expect.objectContaining({
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    }),
  )
})
