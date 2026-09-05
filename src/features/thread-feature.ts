import type { CommentsClient } from "../api/comments"
import type { Message, PaginationMeta } from "../api/contract/query"
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
    this._error = null
    this._loading = true
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
   * ended according to the backend-provided metadata.
   */
  async loadNextPage(): Promise<void> {
    const rootId = this.activeRootId
    const meta = this.pagination
    if (!rootId || !meta || this._loading || meta.page >= meta.total_pages) return
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
      this.memberIds = [...this.memberIds, ...res.data.map((m) => m.event_id)]
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

  /** Exits the Thread context; in-flight Thread reads are discarded. */
  close(): void {
    this.loadEpoch++
    this.abortController?.abort()
    this.abortController = null
    this.activeRootId = null
    this.memberIds = []
    this.pagination = null
    this._loading = false
    this._error = null
    this.emit()
  }

  stop(): void {
    this.close()
  }

  // For AppRuntime lifecycle when the API context is rebound
  rebindApi(commentsApi: CommentsClient): void {
    this.commentsApi = commentsApi
  }
}
