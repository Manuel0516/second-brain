import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { apiCall, apiErrorMessage } from '../../lib/api'
import { ConfirmCard } from './ConfirmCard'
import {
  useAssistantChat,
  type Conversation,
  type ChatMessage,
} from './useAssistantChat'
import './assistant.css'

function SparkleIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 2.5 11.2 7.5 16 10l-4.8 2.5L10 17.5l-1.2-5L4 10l4.8-2.5L10 2.5Z" />
      <circle cx="16" cy="4" r="1" />
    </svg>
  )
}

function relativeTime(value?: string) {
  if (!value) return ''
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000)
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second')
  const minutes = Math.round(seconds / 60)
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour')
  return formatter.format(Math.round(hours / 24), 'day')
}

function messageTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function Message({ message }: { message: ChatMessage }) {
  if (message.role === 'tool') {
    return (
      <div
        className={`assistant-tool-chip${message.ok === false ? ' failed' : ''}`}
      >
        <span aria-hidden="true">{message.ok === false ? '!' : '⌁'}</span>
        <strong>{message.toolName}</strong>
        <span>— {message.content}</span>
      </div>
    )
  }
  return (
    <article className={`assistant-message ${message.role}`}>
      <div>{message.content}</div>
      <time dateTime={message.created_at}>
        {messageTime(message.created_at)}
      </time>
    </article>
  )
}

export function AssistantPanel() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingConversations, setLoadingConversations] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [mobileChatVisible, setMobileChatVisible] = useState(false)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const [lastPrompt, setLastPrompt] = useState('')
  const chat = useAssistantChat()

  const close = useCallback(() => {
    setOpen(false)
    window.setTimeout(() => launcherRef.current?.focus(), 0)
  }, [])

  const loadConversations = useCallback(async () => {
    setLoadingConversations(true)
    setListError(null)
    try {
      const response = await apiCall('/api/ai/conversations')
      if (!response.ok)
        throw new Error(
          await apiErrorMessage(response, 'Could not load conversations.'),
        )
      setConversations((await response.json()) as Conversation[])
    } catch (requestError) {
      setListError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not load conversations.',
      )
    } finally {
      setLoadingConversations(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
      if (event.key !== 'Tab') return
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [close, open])

  useEffect(() => {
    // jsdom/test environments do not implement Element.scrollTo.
    messagesRef.current?.scrollTo?.({ top: messagesRef.current.scrollHeight })
  }, [chat.messages, chat.streamingText, chat.pendingConfirmations])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const prompt = input.trim()
    if (!prompt || chat.isStreaming) return
    setInput('')
    setLastPrompt(prompt)
    await chat.sendMessage(prompt)
    await loadConversations()
  }

  async function selectConversation(id: string) {
    setMobileChatVisible(true)
    await chat.loadConversation(id)
  }

  async function deleteConversation(id: string) {
    const response = await apiCall(`/api/ai/conversations/${id}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      setListError(
        await apiErrorMessage(response, 'Could not delete the conversation.'),
      )
      return
    }
    setConversations((current) => current.filter((item) => item.id !== id))
    if (chat.conversationId === id) chat.startConversation()
  }

  function startNewConversation(prompt?: string) {
    chat.startConversation()
    setMobileChatVisible(true)
    if (prompt) setInput(prompt)
  }

  return (
    <>
      <button
        ref={launcherRef}
        className="assistant-launcher"
        type="button"
        aria-label="Open AI assistant"
        aria-expanded={open}
        onClick={() => {
          setOpen(true)
          void loadConversations()
        }}
      >
        <SparkleIcon />
      </button>
      {open && (
        <div className="assistant-overlay">
          <section
            ref={panelRef}
            className="assistant-panel"
            role="dialog"
            aria-modal="true"
            aria-label="AI Assistant"
          >
            <aside
              className={`assistant-conversations${mobileChatVisible ? ' mobile-hidden' : ''}`}
              aria-label="Conversations"
            >
              <header className="assistant-list-header">
                <div>
                  <span>Assistant</span>
                  <h2>Conversations</h2>
                </div>
                <button
                  type="button"
                  aria-label="Start new conversation"
                  onClick={() => startNewConversation()}
                >
                  +
                </button>
              </header>
              <div className="assistant-conversation-list">
                {loadingConversations ? (
                  <div
                    className="assistant-list-skeleton"
                    aria-label="Loading conversations"
                  >
                    <span className="skeleton" />
                    <span className="skeleton" />
                    <span className="skeleton" />
                  </div>
                ) : conversations.length ? (
                  conversations.map((conversation) => (
                    <div
                      className={`assistant-conversation-row${chat.conversationId === conversation.id ? ' active' : ''}`}
                      key={conversation.id}
                    >
                      <button
                        className="assistant-conversation-select"
                        type="button"
                        onClick={() => selectConversation(conversation.id)}
                      >
                        <strong>{conversation.title}</strong>
                        <time dateTime={conversation.updated_at}>
                          {relativeTime(conversation.updated_at)}
                        </time>
                      </button>
                      <button
                        className="assistant-conversation-delete"
                        type="button"
                        aria-label={`Delete ${conversation.title}`}
                        onClick={() => deleteConversation(conversation.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="assistant-list-empty">No conversations yet.</p>
                )}
                {listError && (
                  <p className="assistant-list-error">{listError}</p>
                )}
              </div>
            </aside>

            <main
              className={`assistant-chat${mobileChatVisible ? ' mobile-visible' : ''}`}
            >
              <header className="assistant-chat-header">
                <button
                  className="assistant-mobile-back"
                  type="button"
                  aria-label="Back to conversations"
                  onClick={() => setMobileChatVisible(false)}
                >
                  ‹
                </button>
                <div className="assistant-title-icon">
                  <SparkleIcon />
                </div>
                <div>
                  <h2>AI Assistant</h2>
                  <span>{chat.isStreaming ? 'Working' : 'Ready'}</span>
                </div>
                <button
                  ref={closeRef}
                  className="assistant-close"
                  type="button"
                  aria-label="Close AI assistant"
                  onClick={close}
                >
                  ×
                </button>
              </header>

              <div className="assistant-messages" ref={messagesRef}>
                {!chat.messages.length && !chat.streamingText ? (
                  <div className="assistant-empty-state">
                    <div className="assistant-empty-icon">
                      <SparkleIcon />
                    </div>
                    <h3>Start a conversation</h3>
                    <p>
                      Ask about your notes, calendar, food, or fitness — or
                      propose a change.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        startNewConversation("What's on my calendar this week?")
                      }
                    >
                      What&apos;s on my calendar this week?
                    </button>
                  </div>
                ) : (
                  chat.messages.map((message) => (
                    <Message message={message} key={message.id} />
                  ))
                )}
                {chat.streamingText && (
                  <article className="assistant-message assistant streaming">
                    <div>{chat.streamingText}</div>
                  </article>
                )}
                {chat.isStreaming && (
                  <div
                    className="assistant-working"
                    aria-label="Assistant is working"
                  >
                    <span className="skeleton" />
                    <span>Working…</span>
                  </div>
                )}
                {chat.pendingConfirmations.map((confirmation) => (
                  <ConfirmCard
                    key={confirmation.actionId}
                    confirmation={confirmation}
                    onConfirm={chat.confirmAction}
                    onReject={chat.rejectAction}
                    onUndo={chat.undoAction}
                  />
                ))}
                {chat.error && (
                  <div className="assistant-error" role="alert">
                    <span>{chat.error}</span>
                    {lastPrompt && (
                      <button
                        type="button"
                        onClick={() => chat.sendMessage(lastPrompt)}
                      >
                        Retry
                      </button>
                    )}
                  </div>
                )}
                <div
                  className="assistant-live"
                  aria-live="polite"
                  aria-atomic="false"
                >
                  {chat.streamingText}
                </div>
              </div>

              <form className="assistant-composer" onSubmit={submit}>
                <label htmlFor="assistant-input">Message the assistant</label>
                <div>
                  <textarea
                    id="assistant-input"
                    rows={1}
                    value={input}
                    disabled={chat.isStreaming}
                    placeholder="Ask anything…"
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        event.currentTarget.form?.requestSubmit()
                      }
                    }}
                  />
                  <button
                    type="submit"
                    aria-label="Send message"
                    disabled={chat.isStreaming || !input.trim()}
                  >
                    →
                  </button>
                </div>
              </form>
            </main>
          </section>
        </div>
      )}
    </>
  )
}
