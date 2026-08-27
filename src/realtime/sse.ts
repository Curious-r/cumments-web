import type { SseData } from "../api/contract/sse"

export type SseEventHandler = (data: SseData) => void

export interface SseOptions {
  endpoint: string
  siteId: string
  pageSlug: string
  onEvent: SseEventHandler
  onStatus?: (connected: boolean) => void
}

export class SseClient {
  private es: EventSource | null = null
  private seenIds = new Set<string>()
  private seenIdsOrder: string[] = []
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private closed = false

  constructor(private readonly opts: SseOptions) {}

  connect(): void {
    if (this.es) return
    this.closed = false
    const url = `${this.opts.endpoint.replace(/\/$/, "")}/api/v1/sites/${encodeURIComponent(this.opts.siteId)}/pages/${encodeURIComponent(this.opts.pageSlug)}/sse`
    const es = new EventSource(url)
    this.es = es

    const handle = (e: MessageEvent) => {
      // dedupe by lastEventId with LRU bound
      const id = (e as MessageEvent & { lastEventId?: string }).lastEventId ?? ""
      if (id && this.seenIds.has(id)) return
      if (id) {
        this.seenIds.add(id)
        this.seenIdsOrder.push(id)
        if (this.seenIdsOrder.length > 500) {
          const oldest = this.seenIdsOrder.shift()
          if (oldest) this.seenIds.delete(oldest)
        }
      }
      try {
        const parsed = JSON.parse(e.data) as { type?: string; payload?: unknown } | SseData
        const data = (parsed as unknown as { data?: unknown }).data
          ? (parsed as unknown as { data: SseData }).data
          : (parsed as SseData)
        const sseData = (parsed as SseData).type ? (parsed as SseData) : (data as SseData)
        if (sseData && typeof sseData.type === "string") {
          this.opts.onEvent(sseData)
        }
      } catch {
        // ignore parse errors
      }
    }

    es.addEventListener("message_created", handle as EventListener)
    es.addEventListener("message_updated", handle as EventListener)
    es.addEventListener("message_deleted", handle as EventListener)
    es.addEventListener("message_annotations_changed", handle as EventListener)
    es.addEventListener("ephemeral", handle as EventListener)

    es.onopen = () => {
      this.reconnectAttempts = 0
      this.opts.onStatus?.(true)
    }
    es.onerror = () => {
      this.opts.onStatus?.(false)
      if (this.closed) return
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.es?.close()
    this.es = null
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000)
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.closed) this.connect()
    }, delay)
  }

  close(): void {
    this.closed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.es?.close()
    this.es = null
    this.opts.onStatus?.(false)
  }

  get connected(): boolean {
    return !!this.es && this.es.readyState === 1
  }
}
