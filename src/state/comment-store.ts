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
    // incremental merge: byId is session-scoped cache, keep all known messages
    // Do not clear byId; only update entries from the current page.
    // This allows cross-page reply/thread lookup via getMessage.
    for (const message of res.data) {
      this.state.byId.set(message.event_id, message)
    }
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
        } else {
          // Already known (e.g., from byId cache), ensure order contains it if on current page
          // If message was previously cached but not in current order (pagination), don't auto-insert
          // to keep page view authoritative; only ensure byId is up to date.
          this.state.byId.set(msg.event_id, msg)
        }
      } else if (data.type === "message_updated") {
        const msg = data.payload.message
        // Updated messages remain as tombstones if redacted; keep them
        this.state.byId.set(msg.event_id, msg)
      } else if (data.type === "message_deleted") {
        const { event_id } = data.payload
        // message_deleted is authoritative: remove from byId and order
        this.state.byId.delete(event_id)
        this.state.order = this.state.order.filter((id) => id !== event_id)
      } else if (data.type === "message_annotations_changed") {
        const msg = data.payload.message
        // annotations change (reactions/poll) may be for any cached message
        if (this.state.byId.has(msg.event_id)) {
          this.state.byId.set(msg.event_id, msg)
        }
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
      if (m.author.public_key === pending.publicKey && m.content.body === pending.content) {
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

  getMessage(id: string): Message | undefined {
    return this.state.byId.get(id)
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
