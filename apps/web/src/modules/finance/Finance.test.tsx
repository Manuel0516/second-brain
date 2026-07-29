import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import { Finance } from './Finance'

vi.mock('../../context/settings', () => ({
  useSettings: () => ({
    settings: { visual_style: 'neon' },
    loading: false,
  }),
}))

function emptyPage() {
  return {
    items: [],
    page: { limit: 50, offset: 0, total: 0, has_more: false },
    completeness: { is_complete: true, warnings: [], blockers: [] },
    empty_state: null,
  }
}

vi.mock('./api', () => ({
  fetchFinanceAccounts: vi.fn().mockResolvedValue(emptyPage()),
  fetchFinanceActivity: vi.fn().mockResolvedValue(emptyPage()),
  createFinanceAccount: vi.fn(),
  fetchFinanceSummary: vi.fn().mockResolvedValue({
    tax_year: 2026,
    jurisdiction: null,
    reporting_currency: 'EUR',
    totals: {
      income: '0',
      expense: '0',
      rewards: '0',
      transfers: '0',
      net: '0',
      net_worth: null,
    },
    counts: {
      accounts: 0,
      assets: 0,
      raw_records: 0,
      confirmed_events: 0,
      pending_review_groups: 0,
      blocking_reconciliations: 0,
      missing_evidence: 0,
    },
    readiness: {
      status: 'ready',
      blocking_count: 0,
      warning_count: 0,
      blockers: [],
      warnings: [],
    },
    completeness: { is_complete: true, warnings: [], blockers: [] },
    empty_state: {
      code: 'finance_not_started',
      title: 'Build your financial source of truth',
      message:
        'Add an account, upload a statement, then review the first group.',
      next_action: 'add_account',
    },
  }),
}))

test('renders the authenticated Finance empty state', async () => {
  render(
    <MemoryRouter>
      <Finance />
    </MemoryRouter>,
  )

  await waitFor(() =>
    expect(
      screen.getByText('Build your financial source of truth'),
    ).toBeInTheDocument(),
  )
  expect(
    screen.getByRole('navigation', { name: 'Finance navigation' }),
  ).toBeInTheDocument()
})
