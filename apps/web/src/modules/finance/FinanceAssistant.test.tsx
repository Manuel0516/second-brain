import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { FinanceAssistantLauncher } from './FinanceAssistant'

vi.mock('./api', () => ({
  fetchFinanceAccounts: vi.fn().mockResolvedValue({ items: [] }),
  runFinanceAssistantTool: vi.fn(),
  createFinanceAssistantProposal: vi.fn(),
  confirmFinanceAssistantProposal: vi.fn(),
  rejectFinanceAssistantProposal: vi.fn(),
}))

test('selecting a tool moves an unsupported scope to the tool default', async () => {
  render(<FinanceAssistantLauncher />)

  fireEvent.click(
    screen.getByRole('button', { name: 'Open Finance assistant' }),
  )

  const tool = await screen.findByLabelText('Tool')
  const scope = screen.getByLabelText('Scope')
  expect(scope).toHaveValue('finance')

  fireEvent.change(tool, { target: { value: 'get_reconciliation_status' } })

  await waitFor(() => expect(scope).toHaveValue('account'))
})
