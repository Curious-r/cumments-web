import type { Message, PaginatedResponse, PaginationMeta } from "../api/contract/query"
import type { SseData } from "../api/contract/sse"
import { isProjectorEvent } from "../api/contract/sse"

export interface PendingSubmission {
  submissionId: number | null
  publicKey: string
  content: string
  submittedAt: number
}

export interface CommentStoreState {
  byId: Map<string, Message>
  order: string[]
  meta: PaginationMeta | null
  pending: PendingSubmission | null
  error: Error | null
}

export class CommentStore {
  private state: CommentStoreState = {
    byId: new Map(),
    order: [],
    meta: null,
    pending: null,
    error: null,
  }
  private listeners = new Set<() => void>()

  get snapshot(): Readonly<CommentStoreState> {
    return this.state
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(): void {
    for (const cb of this.listeners) cb()
  }

  setError(error: Error | null): void {
    this.state.error = error
    this.emit()
  }

  setPending(pending: PendingSubmission | null): void {
    this.state.pending = pending
    this.emit()
  }

  loadPage(res: PaginatedResponse): void {
    this.state.byId = new Map(res.data.map((m) => [m.event_id, m]))
    this.state.order = res.data.map((m) => m.event_id)
    this.state.meta = res.meta
    this.state.error = null
    this.checkPendingSynced(res.data)
    this.emit()
  }

  mergeRealtime(data: SseData): void {
    if (isProjectorEvent(data)) {
      if (data.type === "message_created") {
        const msg = data.payload.message
        if (!this.state.byId.has(msg.event_id)) {
          this.state.byId.set(msg.event_id, msg)
          this.state.order.unshift(msg.event_id)
          this.checkPendingSynced([msg])
        }
      } else if (data.type === "message_updated") {
        const msg = data.payload.message
        if (this.state.byId.has(msg.event_id)) {
          this.state.byId.set(msg.event_id, msg)
        }
      } else if (data.type === "message_deleted") {
        const { event_id } = data.payload as unknown as { event_id: string }
        this.state.byId.delete(event_id)
        this.state.order = this.state.order.filter((id) => id !== event_id)
      } else if (data.type === "message_annotations_changed") {
        // quiet refresh — caller should re-fetch; we just mark pending check
        this.checkPendingSynced(Array.from(this.state.byId.values()))
      }
      this.emit()
    }
  }

  private checkPendingSynced(messages: Message[]): void {
    const pending = this.state.pending
    if (!pending) return
    const found = messages.some((m) => {
      if (pending.submissionId !== null && m.submission_id === pending.submissionId) return true
      // fallback: match by public key and content within 5min window
      if (
        m.author?.public_key === pending.publicKey &&
        (m.content as unknown as { body?: string })?.body === pending.content
      ) {
        const ts = m.timestamp ? Date.parse(m.timestamp) : NaN
        if (!Number.isNaN(ts) && Math.abs(ts - pending.submittedAt) < 5 * 60 * 1000) return true
      }
      return false
    })
    if (found) this.state.pending = null
  }

  getOrdered(): Message[] {
    return this.state.order.map((id) => this.state.byId.get(id)).filter(Boolean) as Message[]
  }

  clear(): void {
    this.state.byId.clear()
    this.state.order = []
    this.state.meta = null
    this.state.pending = null
    this.state.error = null
    this.emit()
  }
}
