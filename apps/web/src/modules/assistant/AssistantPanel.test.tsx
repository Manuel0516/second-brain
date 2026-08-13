import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssistantPanel } from './AssistantPanel'

afterEach(() => vi.restoreAllMocks())

describe('AssistantPanel', () => {
  it('mounts globally and opens a dismissible assistant slide-over', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    render(<AssistantPanel />)

    const launcher = screen.getByRole('button', { name: 'Open AI assistant' })
    expect(launcher).toBeInTheDocument()

    fireEvent.click(launcher)
    expect(
      await screen.findByRole('dialog', { name: 'AI Assistant' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Start a conversation')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'AI Assistant' }),
      ).not.toBeInTheDocument(),
    )
    expect(launcher).toHaveFocus()
  })
})
