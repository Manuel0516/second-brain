import { useEffect, useRef, useState } from 'react'
import type { Page } from './types'

type PagePatch = Partial<Pick<Page, 'title' | 'icon' | 'cover' | 'content'>>

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 10_000

class NoteRelay {
  private socket: WebSocket | null = null
  private destroyed = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = RECONNECT_BASE_MS

  constructor(
    private pageId: string,
    private onStatus: (status: 'connecting' | 'online' | 'offline') => void,
    private onPresence: (count: number) => void,
    private onPagePatch: (patch: PagePatch) => void,
  ) {}

  connect() {
    // Reset in case a prior connect()/destroy() pair (e.g. React StrictMode's
    // dev-only double-invoke of the mount effect) already flipped this flag —
    // otherwise every handler below stays permanently gated off.
    this.destroyed = false
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    this.socket = new WebSocket(
      `${protocol}//${location.host}/api/pages/${this.pageId}/collaboration`,
    )
    this.socket.onopen = () => {
      if (this.destroyed) return
      this.reconnectDelay = RECONNECT_BASE_MS
      this.onStatus('online')
    }
    this.socket.onclose = () => {
      if (this.destroyed) return
      this.onStatus('offline')
      this.scheduleReconnect()
    }
    this.socket.onerror = () => !this.destroyed && this.onStatus('offline')
    this.socket.onmessage = (event) => {
      if (this.destroyed) return
      const message = JSON.parse(event.data) as {
        type: string
        count?: number
        page?: PagePatch
      }
      if (message.type === 'presence') this.onPresence(message.count || 0)
      if (message.type === 'page' && message.page)
        this.onPagePatch(message.page)
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.destroyed) return
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS)
      this.connect()
    }, this.reconnectDelay)
  }

  destroy() {
    this.destroyed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.socket?.close()
  }
}

export function useNoteCollaboration(
  pageId: string,
  onPagePatch: (patch: PagePatch) => void = () => {},
) {
  const [status, setStatus] = useState<'connecting' | 'online' | 'offline'>(
    'connecting',
  )
  const [presence, setPresence] = useState(1)
  const onPagePatchRef = useRef(onPagePatch)
  useEffect(() => {
    onPagePatchRef.current = onPagePatch
  }, [onPagePatch])
  useEffect(() => {
    const relay = new NoteRelay(pageId, setStatus, setPresence, (patch) =>
      onPagePatchRef.current(patch),
    )
    relay.connect()
    return () => relay.destroy()
  }, [pageId])
  return { status, presence }
}
