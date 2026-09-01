import type { SseData } from "../api/contract/sse"

export interface SseTransportConfig {
  endpoint: string
  siteId: string
  pageSlug: string
}

export class SseTransport {
  private es: EventSource | null = null
  private seenIds = new Set<string>()
  private seenIdsOrder: string[] = []
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private closed = false
  private generation = 0
  private endpoint: string
  private siteId: string
  private pageSlug: string
  private onEvent: ((data: SseData) => void) | null = null
  private onStatus: ((connected: boolean) => void) | null = null

  constructor(config: SseTransportConfig) {
    this.endpoint = config.endpoint
    this.siteId = config.siteId
    this.pageSlug = config.pageSlug
  }

  connect(onEvent: (data: SseData) => void, onStatus?: (connected: boolean) => void): void {
    const ES = (globalThis as unknown as { EventSource?: typeof EventSource }).EventSource
    if (typeof ES === "undefined" || !ES) return
    if (this.es) return
    this.closed = false
    this.onEvent = onEvent
    this.onStatus = onStatus ?? null
    const gen = ++this.generation
    const url = `${this.endpoint.replace(/\/$/, "")}/api/v1/sites/${encodeURIComponent(this.siteId)}/pages/${encodeURIComponent(this.pageSlug)}/sse`
    const ES2 = (globalThis as unknown as { EventSource: typeof EventSource }).EventSource
    const es = new ES2(url)
    this.es = es

    const handle = (e: MessageEvent) => {
      if (gen !== this.generation) return
      if (this.closed) return
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
          if (gen !== this.generation) return
          if (this.closed) return
          this.onEvent?.(sseData)
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
      if (gen !== this.generation) return
      if (this.closed) return
      this.reconnectAttempts = 0
      this.onStatus?.(true)
    }
    es.onerror = () => {
      if (gen !== this.generation) return
      if (this.closed) return
      this.onStatus?.(false)
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    if (this.closed) return
    this.es?.close()
    this.es = null
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000)
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.closed && this.onEvent) {
        this.connect(this.onEvent, this.onStatus ?? undefined)
      }
    }, delay)
  }

  close(): void {
    this.closed = true
    this.generation++
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.es?.close()
    this.es = null
    this.onStatus?.(false)
    this.onEvent = null
    this.onStatus = null
  }

  get connected(): boolean {
    return !!this.es && this.es.readyState === 1
  }

  setEndpoint(endpoint: string): void {
    this.endpoint = endpoint
  }

  // For testing: expose seenIds size
  get _seenIdsSize(): number {
    return this.seenIds.size
  }

  get _generation(): number {
    return this.generation
  }
}
