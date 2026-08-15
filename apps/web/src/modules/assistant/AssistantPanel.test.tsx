import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssistantPanel } from './AssistantPanel'

function sseStream(events: object[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body))
        controller.close()
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    },
  )
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('AssistantPanel', () => {
  it('opens a handed-off conversation and restores its pending secure action', async () => {
    const convId = 'conversation-handoff'
    const actionId = 'action-handoff'
    window.history.replaceState(
      null,
      '',
      `/calendar?assistant=${convId}&action=${actionId}`,
    )
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith(`/api/ai/conversations/${convId}`))
          return Promise.resolve(
            jsonResponse({
              id: convId,
              title: 'Telegram handoff',
              updated_at: new Date().toISOString(),
              messages: [],
              pending_actions: [
                {
                  action_id: actionId,
                  tool: 'login',
                  preview: {
                    username: 'manuel',
                    _secure_fields: ['password'],
                  },
                  high_risk: true,
                  confirmation: 1,
                },
              ],
            }),
          )
        return Promise.resolve(jsonResponse([]))
      },
    )

    render(<AssistantPanel />)

    expect(
      await screen.findByRole('dialog', { name: 'AI Assistant' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('password')).toHaveAttribute(
      'type',
      'password',
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Reject' })).toHaveFocus(),
    )
    expect(window.location.search).toBe('')
  })

  it('mounts globally and opens a dismissible assistant slide-over', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([]))

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

  it('renders the streamed assistant answer (regression: message_done must capture text before clearing the ref)', async () => {
    const convId = 'conv-stream-1'
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = (init?.method ?? 'GET').toUpperCase()
        if (url.endsWith('/api/ai/conversations') && method === 'GET')
          return Promise.resolve(jsonResponse([]))
        if (url.endsWith('/api/ai/conversations') && method === 'POST')
          return Promise.resolve(
            jsonResponse({ id: convId, title: 'New conversation' }),
          )
        if (url.includes(`/conversations/${convId}/messages`))
          return Promise.resolve(
            sseStream([
              { type: 'conversation', id: convId, title: 'Say hello' },
              { type: 'text_delta', content: 'Hello! ' },
              { type: 'text_delta', content: 'How can I help?' },
              { type: 'message_done', message_id: 'msg-1' },
              { type: 'done' },
            ]),
          )
        return Promise.resolve(jsonResponse([]))
      },
    )

    render(<AssistantPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Open AI assistant' }))
    await screen.findByRole('dialog', { name: 'AI Assistant' })

    fireEvent.change(screen.getByLabelText('Message the assistant'), {
      target: { value: 'Say hello' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() =>
      expect(screen.getByText('Hello! How can I help?')).toBeInTheDocument(),
    )
  })
})
