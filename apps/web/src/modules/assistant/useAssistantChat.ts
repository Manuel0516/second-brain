import { useCallback, useRef, useState } from 'react'
import { apiCall, apiErrorMessage } from '../../lib/api'

export type Conversation = {
  id: string
  title: string
  created_at?: string
  updated_at: string
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  created_at: string
  toolName?: string
  ok?: boolean
}

export type PendingConfirmation = {
  actionId: string
  tool: string
  preview: unknown
  status:
    | 'pending'
    | 'applying'
    | 'executed'
    | 'rejecting'
    | 'rejected'
    | 'undone'
}

type ConversationDetail = Conversation & { messages: ChatMessage[] }

type StreamEvent =
  | { type: 'conversation'; id: string; title: string }
  | { type: 'text_delta'; content: string }
  | { type: 'tool_call'; name: string; args: unknown }
  | { type: 'tool_result'; name: string; ok: boolean; summary: string }
  | {
      type: 'confirm_required'
      action_id: string
      tool: string
      preview: unknown
    }
  | { type: 'message_done'; message_id: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

const now = () => new Date().toISOString()

async function requireOk(response: Response, fallback: string) {
  if (!response.ok) throw new Error(await apiErrorMessage(response, fallback))
  return response
}

export function useAssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [pendingConfirmations, setPendingConfirmations] = useState<
    PendingConfirmation[]
  >([])
  const [error, setError] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const streamTextRef = useRef('')

  const consumeStream = useCallback(async (response: Response) => {
    await requireOk(response, 'The assistant could not respond.')
    if (!response.body)
      throw new Error('The assistant returned an empty stream.')

    setIsStreaming(true)
    setError(null)
    streamTextRef.current = ''
    setStreamingText('')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const handleEvent = (event: StreamEvent) => {
      switch (event.type) {
        case 'conversation':
          setConversationId(event.id)
          break
        case 'text_delta':
          streamTextRef.current += event.content
          setStreamingText(streamTextRef.current)
          break
        case 'tool_call':
          setMessages((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              role: 'tool',
              toolName: event.name,
              content: 'Working…',
              created_at: now(),
            },
          ])
          break
        case 'tool_result':
          setMessages((current) => {
            let index = -1
            for (
              let candidate = current.length - 1;
              candidate >= 0;
              candidate -= 1
            ) {
              const message = current[candidate]
              if (
                message.role === 'tool' &&
                message.toolName === event.name &&
                message.content === 'Working…'
              ) {
                index = candidate
                break
              }
            }
            if (index < 0)
              return [
                ...current,
                {
                  id: crypto.randomUUID(),
                  role: 'tool',
                  toolName: event.name,
                  content: event.summary,
                  ok: event.ok,
                  created_at: now(),
                },
              ]
            return current.map((message, messageIndex) =>
              messageIndex === index
                ? { ...message, content: event.summary, ok: event.ok }
                : message,
            )
          })
          break
        case 'confirm_required':
          setPendingConfirmations((current) => [
            ...current.filter((item) => item.actionId !== event.action_id),
            {
              actionId: event.action_id,
              tool: event.tool,
              preview: event.preview,
              status: 'pending',
            },
          ])
          break
        case 'message_done':
          if (streamTextRef.current) {
            setMessages((current) => [
              ...current,
              {
                id: event.message_id,
                role: 'assistant',
                content: streamTextRef.current,
                created_at: now(),
              },
            ])
            streamTextRef.current = ''
            setStreamingText('')
          }
          break
        case 'error':
          setError(event.message)
          break
        case 'done':
          break
      }
    }

    try {
      while (true) {
        const { done, value } = await reader.read()
        buffer += decoder
          .decode(value, { stream: !done })
          .replace(/\r\n/g, '\n')
        let boundary = buffer.indexOf('\n\n')
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          const payload = block
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n')
          if (payload) handleEvent(JSON.parse(payload) as StreamEvent)
          boundary = buffer.indexOf('\n\n')
        }
        if (done) break
      }
    } catch (streamError) {
      setError(
        streamError instanceof Error
          ? streamError.message
          : 'The assistant stream was interrupted.',
      )
    } finally {
      setIsStreaming(false)
    }
  }, [])

  const loadConversation = useCallback(async (id: string) => {
    setError(null)
    const response = await requireOk(
      await apiCall(`/api/ai/conversations/${id}`),
      'Could not load this conversation.',
    )
    const conversation = (await response.json()) as ConversationDetail
    setConversationId(id)
    setMessages(conversation.messages ?? [])
    setPendingConfirmations([])
    setStreamingText('')
  }, [])

  const startConversation = useCallback(() => {
    setConversationId(null)
    setMessages([])
    setPendingConfirmations([])
    setStreamingText('')
    setError(null)
  }, [])

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim()
      if (!trimmed || isStreaming) return
      setError(null)
      let id = conversationId
      try {
        if (!id) {
          const response = await requireOk(
            await apiCall('/api/ai/conversations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            }),
            'Could not start a conversation.',
          )
          const conversation = (await response.json()) as Conversation
          id = conversation.id
          setConversationId(id)
        }
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: 'user',
            content: trimmed,
            created_at: now(),
          },
        ])
        await consumeStream(
          await apiCall(`/api/ai/conversations/${id}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: trimmed }),
          }),
        )
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'The assistant could not respond.',
        )
        setIsStreaming(false)
      }
    },
    [consumeStream, conversationId, isStreaming],
  )

  const continueAction = useCallback(
    async (actionId: string, decision: 'confirm' | 'reject') => {
      if (!conversationId) return
      const busyStatus = decision === 'confirm' ? 'applying' : 'rejecting'
      setPendingConfirmations((current) =>
        current.map((item) =>
          item.actionId === actionId ? { ...item, status: busyStatus } : item,
        ),
      )
      try {
        const response = await apiCall(
          `/api/ai/conversations/${conversationId}/${decision}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action_id: actionId }),
          },
        )
        setPendingConfirmations((current) =>
          current.map((item) =>
            item.actionId === actionId
              ? {
                  ...item,
                  status: decision === 'confirm' ? 'executed' : 'rejected',
                }
              : item,
          ),
        )
        await consumeStream(response)
      } catch (requestError) {
        setPendingConfirmations((current) =>
          current.map((item) =>
            item.actionId === actionId ? { ...item, status: 'pending' } : item,
          ),
        )
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Could not continue the assistant.',
        )
      }
    },
    [consumeStream, conversationId],
  )

  const undoAction = useCallback(async (actionId: string) => {
    try {
      await requireOk(
        await apiCall(`/api/ai/actions/${actionId}/undo`, { method: 'POST' }),
        'Could not undo this change.',
      )
      setPendingConfirmations((current) =>
        current.map((item) =>
          item.actionId === actionId ? { ...item, status: 'undone' } : item,
        ),
      )
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not undo this change.',
      )
    }
  }, [])

  return {
    messages,
    streamingText,
    pendingConfirmations,
    error,
    isStreaming,
    conversationId,
    sendMessage,
    confirmAction: (actionId: string) => continueAction(actionId, 'confirm'),
    rejectAction: (actionId: string) => continueAction(actionId, 'reject'),
    undoAction,
    loadConversation,
    startConversation,
  }
}
