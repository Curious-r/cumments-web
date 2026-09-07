import type { CommentsClient } from "../api/comments"
import type { Message, PaginationMeta } from "../api/contract/query"
import { isProjectorEvent, type SseData } from "../api/contract/sse"
import type { EntityCache } from "../state/entity-cache"

/**
 * Transient read state for the one currently open Thread context.
 *
 * Ownership rules (frozen Thread design):
 * - Thread membership, ordering, and pagination come from the backend
 *   (`queryComments` with `thread_root`); the root itself is never a member.
 * - Message entities live in the shared `EntityCache`; only identifiers and
 *   ordering are stored here.
 * - The Thread summary/count is backend-derived (`Message.thread_summary`);
 *   `memberIds.length` is never treated as an authoritative count.
 * - Loading/error state is local to the Thread view and never touches the
 *   main feed.
 *
 * Only one Thread context is active per runtime instance; late responses for
 * a superseded root are discarded (epoch + active-root guard).
 */
export interface ThreadSnapshot {
  /** Currently open Thread root, or null when no Thread context is active. */
  rootId: string | null
  /** Backend-ordered active Thread member ids; excludes the root. */
  memberIds: string[]
  pagination: PaginationMeta | null
  loading: boolean
  error: string | null
}

export class ThreadFeature {
  private activeRootId: string | null = null
  private memberIds: string[] = []
  private pagination: PaginationMeta | null = null
  private paginationDirty = false
  private _loading = false
  private _error: string | null = null
  private loadEpoch = 0
  private abortController: AbortController | null = null
  private listeners = new Set<() => void>()

  constructor(
    private commentsApi: CommentsClient,
    private entityCache: EntityCache,
    private opts: { perPage?: number } = {},
  ) {}

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(): void {
    for (const cb of this.listeners) cb()
  }

  snapshot(): ThreadSnapshot {
    return {
      rootId: this.activeRootId,
      memberIds: [...this.memberIds],
      pagination: this.pagination ? { ...this.pagination } : null,
      loading: this._loading,
      error: this._error,
    }
  }

  /** Whether a Thread context is currently open. */
  get isOpen(): boolean {
    return this.activeRootId !== null
  }

  /**
   * Current Thread view generation. Callers that act on behalf of an earlier
   * lifecycle (e.g. a completed creation) pass the generation they captured so
   * stale operations can be rejected.
   */
  get generation(): number {
    return this.loadEpoch
  }

  /** The root entity resolved through the shared EntityCache, if present. */
  get root(): Message | undefined {
    return this.activeRootId ? this.entityCache.get(this.activeRootId) : undefined
  }

  /** Member entities resolved in backend order through the shared EntityCache. */
  get members(): Message[] {
    return this.memberIds.map((id) => this.entityCache.get(id)).filter(Boolean) as Message[]
  }

  getMessage(eventId: string): Message | undefined {
    return this.entityCache.get(eventId)
  }

  /** Whether a further backend member page is available. */
  get hasNextPage(): boolean {
    const meta = this.pagination
    return !!meta && meta.page < meta.total_pages
  }

  private isCurrent(epoch: number, rootId: string): boolean {
    return epoch === this.loadEpoch && rootId === this.activeRootId
  }

  private get perPage(): number {
    return this.opts.perPage ?? 20
  }

  /**
   * Lifecycle hooks fired synchronously at the open/close state transitions
   * (never on async responses). The runtime assigns the explicit composer
   * context through them — Thread scope is assigned, never derived.
   */
  onThreadOpened: ((rootId: string) => void) | null = null
  onThreadClosed: (() => void) | null = null

  /**
   * Opens the Thread context for rootId and performs the initial member load.
   * The root resolves through the shared EntityCache when already known
   * (e.g. from the main feed); otherwise it is fetched via `getComment` and
   * upserted into the same cache.
   */
  async open(rootId: string): Promise<void> {
    const epoch = ++this.loadEpoch
    this.abortController?.abort()
    const controller = new AbortController()
    this.abortController = controller
    this.activeRootId = rootId
    this.memberIds = []
    this.pagination = null
    this.paginationDirty = false
    this._error = null
    this._loading = true
    // Synchronous lifecycle signal: the composer context corresponds to the
    // newly active root immediately, before any response arrives.
    this.onThreadOpened?.(rootId)
    this.emit()
    try {
      if (!this.entityCache.has(rootId)) {
        const root = await this.commentsApi.get(rootId, controller.signal)
        if (!this.isCurrent(epoch, rootId)) return
        this.entityCache.set(root.event_id, root)
        this.emit()
      }
      const res = await this.commentsApi.listThread(
        rootId,
        { page: 1, per_page: this.perPage },
        controller.signal,
      )
      if (!this.isCurrent(epoch, rootId)) return
      this.entityCache.setBatch(res.data)
      this.memberIds = res.data.map((m) => m.event_id)
      this.pagination = res.meta
      this._loading = false
      this._error = null
      this.emit()
    } catch (e) {
      if (!this.isCurrent(epoch, rootId)) return
      if ((e as Error).name === "AbortError") return
      this._loading = false
      this._error = e instanceof Error ? e.message : String(e)
      this.emit()
    }
  }

  /**
   * Loads the next backend member page and appends it in backend order.
   * A no-op when no Thread is open, a load is in flight, or pagination has
   * ended according to the backend-provided metadata. Already-materialized
   * member ids are never inserted twice.
   *
   * When a realtime removal has invalidated the frontend's pagination metadata
   * (backend page boundaries shifted), the first `loadNextPage()` re-syncs by
   * re-fetching the current page to obtain authoritative `total_pages` before
   * proceeding — the backend remains the source of truth.
   */
  async loadNextPage(): Promise<void> {
    const rootId = this.activeRootId
    let meta = this.pagination
    if (!rootId || !meta || this._loading) return
    // When a realtime removal shifted page boundaries, re-sync metadata first
    // by re-fetching the current page, then proceed to fetch the next page.
    if (this.paginationDirty) {
      await this.revalidatePagination(rootId)
      meta = this.pagination
      if (!meta) return
    }
    if (meta.page >= meta.total_pages) return
    const epoch = ++this.loadEpoch
    this.abortController?.abort()
    const controller = new AbortController()
    this.abortController = controller
    this._loading = true
    this.emit()
    try {
      const res = await this.commentsApi.listThread(
        rootId,
        { page: meta.page + 1, per_page: this.perPage },
        controller.signal,
      )
      if (!this.isCurrent(epoch, rootId)) return
      this.entityCache.setBatch(res.data)
      const newIds = res.data.map((m) => m.event_id)
      this.memberIds = [...this.memberIds, ...newIds.filter((id) => !this.memberIds.includes(id))]
      this.pagination = res.meta
      this._loading = false
      this._error = null
      this.emit()
    } catch (e) {
      if (!this.isCurrent(epoch, rootId)) return
      if ((e as Error).name === "AbortError") return
      this._loading = false
      this._error = e instanceof Error ? e.message : String(e)
      this.emit()
    }
  }

  /**
   * Re-syncs pagination metadata and member set with the backend after a
   * realtime removal shifted page boundaries. Re-fetches the current page to
   * obtain authoritative `total_pages` and merges the backend's current page
   * slice with the materialized members. After re-sync, the next
   * `loadNextPage()` uses correct metadata.
   */
  private async revalidatePagination(rootId: string): Promise<void> {
    const meta = this.pagination
    if (!meta) return
    const epoch = ++this.loadEpoch
    this.abortController?.abort()
    const controller = new AbortController()
    this.abortController = controller
    this._loading = true
    this.emit()
    try {
      const res = await this.commentsApi.listThread(
        rootId,
        { page: meta.page, per_page: this.perPage },
        controller.signal,
      )
      if (!this.isCurrent(epoch, rootId)) return
      this.entityCache.setBatch(res.data)
      const fetchedIds = res.data.map((m) => m.event_id)
      // Merge: keep existing members, add any new members from the backend's
      // current page slice (members may have shifted pages after removal).
      this.memberIds = [
        ...this.memberIds,
        ...fetchedIds.filter((id) => !this.memberIds.includes(id)),
      ]
      this.pagination = res.meta
      this.paginationDirty = false
      this._loading = false
      this._error = null
      this.emit()
    } catch (e) {
      if (!this.isCurrent(epoch, rootId)) return
      if ((e as Error).name === "AbortError") return
      this._loading = false
      this._error = e instanceof Error ? e.message : String(e)
      this.emit()
    }
  }

  /**
   * Read-your-write reconciliation after a successful Thread-scoped creation.
   *
   * The creation API returns only `submission_id` — the projected message with
   * its canonical event_id becomes discoverable later — so this revalidation
   * silently re-reads the backend's first member page and merges it into the
   * materialized view. Ordering and pagination metadata stay backend-provided;
   * no local counters are maintained.
   *
   * The read joins the single Thread request lifecycle: `generation` is the
   * view generation the creation belonged to (captured at submission start).
   * If the Thread was closed, replaced, or its generation advanced since, the
   * stale operation is rejected outright — a same-root reopen is never mutated
   * by an older creation. When it does run, the read registers in the shared
   * controller slot so close()/open() abort it, and completion is guarded by
   * the generation again. Merging is idempotent, and the root itself is never
   * inserted as a member.
   */
  async revalidateAfterCreation(threadRootId: string, generation: number): Promise<void> {
    if (!this.isCurrent(generation, threadRootId)) return
    const rootId = this.activeRootId as string
    const controller = new AbortController()
    this.abortController = controller
    try {
      const res = await this.commentsApi.listThread(
        rootId,
        { page: 1, per_page: this.perPage },
        controller.signal,
      )
      // The view lifecycle may have moved on while the read was in flight
      // (closed, reopened with the same root, or superseded by another load) —
      // only the current generation may apply cache writes or state changes.
      if (!this.isCurrent(generation, rootId)) return
      this.entityCache.setBatch(res.data)
      const fetchedIds = res.data.map((m) => m.event_id).filter((id) => id !== rootId)
      // Backend-canonical page-1 slice first (newest members), previously
      // materialized older members keep their relative order behind it.
      this.memberIds = [...fetchedIds, ...this.memberIds.filter((id) => !fetchedIds.includes(id))]
      this.pagination = res.meta
      this.emit()
    } catch {
      // Silent best-effort: the submission already succeeded; superseded or
      // failed revalidations converge via the next thread load or realtime
      // reconciliation.
    }
  }

  /** Exits the Thread context; in-flight Thread reads are discarded. */
  close(): void {
    this.loadEpoch++
    this.abortController?.abort()
    this.abortController = null
    this.activeRootId = null
    this.memberIds = []
    this.pagination = null
    this.paginationDirty = false
    this._loading = false
    this._error = null
    this.onThreadClosed?.()
    this.emit()
  }

  /**
   * Reconciles projector events into the active Thread view. The shared
   * EntityCache upsert happens in the existing global realtime path
   * (CommentsFeature); this boundary only adjusts active Thread membership.
   *
   * Membership decisions use the event's explicit backend semantics
   * (`message.thread_root`, `message.status`) — never `replyToId`, never
   * reply-chain traversal. The root itself is never a member, and delivery is
   * idempotent (a member created locally and then delivered via SSE appears
   * exactly once).
   */
  reconcileRealtime(event: SseData): void {
    if (!isProjectorEvent(event)) return
    if (event.type === "message_created") {
      const msg = (event.payload as { message?: Message }).message
      if (msg) this.reconcileRealtimeMember(msg)
    } else if (event.type === "message_deleted") {
      const eventId = (event.payload as { event_id?: string }).event_id
      if (eventId) this.removeRealtimeMember(eventId)
    } else if (event.type === "message_updated" || event.type === "message_annotations_changed") {
      // Edits and annotation/summary snapshots flow through the shared cache;
      // only an explicit redaction changes active membership.
      const msg = (event.payload as { message?: Message }).message
      if (msg?.status === "redacted") this.removeRealtimeMember(msg.event_id)
    }
  }

  private reconcileRealtimeMember(msg: Message): void {
    // Membership comes from the event's explicit thread_root only.
    if (!msg.thread_root || msg.thread_root !== this.activeRootId) return
    // The root itself is never a member.
    if (msg.event_id === this.activeRootId) return
    // Backend status is authoritative for activity.
    if (msg.status === "redacted") return
    // Idempotent: local creation reconciliation and SSE converge on one entry.
    if (this.memberIds.includes(msg.event_id)) return
    // Order the member by its own timestamp, independent of cache arrival
    // timing — upsert the entity here so canonical comparison never depends
    // on whether the global realtime path has cached it yet.
    this.entityCache.set(msg.event_id, msg)
    this.memberIds = this.insertMemberOrdered(msg, this.memberIds)
    this.emit()
  }

  private removeRealtimeMember(eventId: string): void {
    if (!this.memberIds.includes(eventId)) return
    // Membership only: the entity stays governed by the normal cache lifecycle.
    this.memberIds = this.memberIds.filter((id) => id !== eventId)
    // Realtime removal shifts backend page boundaries; the frontend's
    // pagination metadata is now stale. The next loadNextPage() will re-sync.
    this.paginationDirty = true
    this.emit()
  }

  /**
   * Inserts a member following the backend canonical ordering (timestamp DESC,
   * event_id ASC — the ordering documented by the backend Thread contract), so
   * SSE arrival order cannot scramble the materialized view.
   */
  private insertMemberOrdered(msg: Message, memberIds: string[]): string[] {
    const ts = Date.parse(msg.timestamp)
    let index = memberIds.length
    for (let i = 0; i < memberIds.length; i++) {
      const existing = this.entityCache.get(memberIds[i])
      if (!existing) continue
      const existingTs = Date.parse(existing.timestamp)
      if (Number.isNaN(ts) || Number.isNaN(existingTs)) continue
      if (existingTs < ts || (existingTs === ts && existing.event_id > msg.event_id)) {
        index = i
        break
      }
    }
    return [...memberIds.slice(0, index), msg.event_id, ...memberIds.slice(index)]
  }

  stop(): void {
    this.close()
  }

  // For AppRuntime lifecycle when the API context is rebound
  rebindApi(commentsApi: CommentsClient): void {
    this.commentsApi = commentsApi
  }
}
