import type { CommentsClient } from "../api/comments"
import type { Message, PaginationMeta } from "../api/contract/query"
import type { SseData } from "../api/contract/sse"
import { isProjectorEvent } from "../api/contract/sse"
import type { PollsClient } from "../api/polls"
import type { ReactionsClient } from "../api/reactions"
import { EntityCache } from "../state/entity-cache"
import { PageView } from "../state/page-view"
import { PendingOperation, type PendingSubmission } from "../state/pending-operation"

export interface CommentSnapshot {
  messages: Message[]
  meta: PaginationMeta | null
  pending: PendingSubmission | null
  loading: boolean
  error: string | null
  votingPollId: string | null
}

export class CommentsFeature {
  private entityCache: EntityCache
  private pageView: PageView
  private pendingOp: PendingOperation
  private _loading = true
  private _error: string | null = null
  votingPollId: string | null = null

  private page = 1
  private perPage: number
  private listeners = new Set<() => void>()
  private pendingTimer: ReturnType<typeof setTimeout> | null = null
  private pendingAttempts = 0
  private loadEpoch = 0
  private pendingAbortController: AbortController | null = null
  private siteId: string
  private pageSlug: string
  private getIdentity: () => { publicKey: string } | null

  constructor(
    private commentsApi: CommentsClient,
    private reactionsApi: ReactionsClient,
    private pollsApi: PollsClient,
    entityCache?: EntityCache,
    pageView?: PageView,
    pendingOp?: PendingOperation,
    opts?: {
      page?: number
      perPage?: number
      getIdentity?: () => { publicKey: string } | null
      siteId?: string
      pageSlug?: string
    },
  ) {
    this.entityCache = entityCache ?? new EntityCache()
    this.pageView = pageView ?? new PageView()
    this.pendingOp = pendingOp ?? new PendingOperation()
    this.getIdentity = opts?.getIdentity ?? (() => null)
    this.siteId = opts?.siteId ?? ""
    this.pageSlug = opts?.pageSlug ?? ""
    this.page = opts?.page ?? 1
    this.perPage = opts?.perPage ?? 20
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(): void {
    for (const cb of this.listeners) cb()
  }

  snapshot(): CommentSnapshot {
    return {
      messages: this.pageMessages,
      meta: this.pageView.meta,
      pending: this.pendingOp.pending,
      loading: this._loading,
      error: this._error,
      votingPollId: this.votingPollId,
    }
  }

  get pageMessages(): Message[] {
    return this.pageView.order.map((id) => this.entityCache.get(id)).filter(Boolean) as Message[]
  }

  getMessage(eventId: string): Message | undefined {
    return this.entityCache.get(eventId)
  }

  get storeSnapshot(): {
    order: string[]
    meta: PaginationMeta | null
    pending: PendingSubmission | null
    error: string | null
  } {
    return {
      order: this.pageView.order,
      meta: this.pageView.meta,
      pending: this.pendingOp.pending,
      error: this._error,
    }
  }

  async loadPage(opts: { page?: number; perPage?: number; silent?: boolean } = {}): Promise<void> {
    const page = opts.page ?? this.page
    const perPage = opts.perPage ?? this.perPage
    const silent = opts.silent ?? false
    const epoch = ++this.loadEpoch
    if (!silent) {
      this._loading = true
      this._error = null
      this.emit()
    }
    // Cancel previous pending abort if any? For loadPage, we use abort for pending poll, but not for load itself? We'll use signal for load.
    const controller = new AbortController()
    this.pendingAbortController?.abort()
    this.pendingAbortController = controller
    try {
      const res = await this.commentsApi.list({ page, per_page: perPage }, controller.signal)
      if (epoch !== this.loadEpoch) return
      // Authoritative replace
      this.entityCache.setBatch(res.data)
      this.pageView.replace(
        res.data.map((m) => m.event_id),
        res.meta,
      )
      this.page = page
      this.perPage = perPage
      this._error = null
      this.pendingOp.clearIfSatisfied(res.data)
      if (!this.pendingOp.pending) this.clearPendingPoll()
      this.emit()
    } catch (e) {
      if (epoch !== this.loadEpoch) return
      if ((e as Error).name === "AbortError") return
      this._error = e instanceof Error ? e.message : String(e)
      this.emit()
      throw e
    } finally {
      if (epoch === this.loadEpoch) {
        if (!silent) this._loading = false
        this.emit()
        if (this.pendingAbortController === controller) this.pendingAbortController = null
      }
    }
  }

  async refresh(opts: { silent?: boolean } = {}): Promise<void> {
    return this.loadPage({ page: this.page, perPage: this.perPage, silent: opts.silent })
  }

  async setPage(page: number): Promise<void> {
    const meta = this.pageView.meta
    const totalPages = meta?.total_pages ?? 1
    const next = Math.min(Math.max(1, page), Math.max(1, totalPages))
    if (next !== this.page) {
      this.page = next
      await this.refresh()
    }
  }

  changePage(delta: number): void {
    const meta = this.pageView.meta
    const totalPages = meta?.total_pages ?? 1
    const next = Math.min(Math.max(1, this.page + delta), Math.max(1, totalPages))
    if (next !== this.page) {
      this.page = next
      void this.refresh()
    }
  }

  private ensurePendingSlotFree(): void {
    if (this.pendingOp.pending) {
      throw new Error("pending operation already in progress")
    }
  }

  async submit(
    content: string,
    opts: {
      displayName: string
      replyToId: string | null
      threadRootId: string | null
      media?: { url: string; kind: string } | null
    },
  ): Promise<void> {
    const trimmed = content.trim()
    if (!trimmed) return
    this.ensurePendingSlotFree()
    // Need identity for pending publicKey - we get from commentsApi's context? For now, we need to get via a provided getter or fallback
    // Use a placeholder: we can get from signingPipeline's identity via commentsApi? But CommentsClient doesn't expose.
    // For test, we will require that pending publicKey is set via a separate method or we can accept it via opts? Simplify: use empty string if not available, but for real it should be active identity's publicKey.
    // We'll try to get from global? For now, we will store pending with empty publicKey and rely on submission_id primary matching.
    // Better: expose a way to set pending publicKey via AppRuntime passing identity.
    // For now, we will require caller to have set identity via API context; pending check will use submission_id primarily.
    try {
      const { submission_id } = await this.commentsApi.create(trimmed, {
        displayName: opts.displayName,
        replyToId: opts.replyToId,
        threadRootId: opts.threadRootId,
        media: opts.media ?? null,
      })
      // For pending, we need publicKey. Try to get from commentsApi context if available (via ClientContext)
      const publicKey = this.getIdentity()?.publicKey ?? ""
      this.pendingOp.setPending({
        submissionId: submission_id,
        publicKey,
        content: trimmed,
        submittedAt: Date.now(),
      })
      this.emit()
      this.startPendingPoll()
      setTimeout(() => void this.refresh({ silent: true }), 800)
    } catch (e) {
      this._error = e instanceof Error ? e.message : String(e)
      this.emit()
      throw e
    }
  }

  async createPoll(
    question: string,
    options: string[],
    opts: {
      displayName: string
      replyToId: string | null
      threadRootId: string | null
    },
  ): Promise<void> {
    const trimmedQ = question.trim()
    const trimmedOpts = options.map((o) => o.trim())
    if (!trimmedQ) throw new Error("poll question required")
    if (trimmedOpts.length < 2) throw new Error("poll requires at least 2 options")
    this.ensurePendingSlotFree()
    try {
      const { submission_id } = await this.pollsApi.create(trimmedQ, trimmedOpts, {
        displayName: opts.displayName,
        replyToId: opts.replyToId,
        threadRootId: opts.threadRootId,
      })
      const publicKey = this.getIdentity()?.publicKey ?? ""
      this.pendingOp.setPending({
        submissionId: submission_id,
        publicKey,
        content: trimmedQ,
        submittedAt: Date.now(),
      })
      this.emit()
      this.startPendingPoll()
      setTimeout(() => void this.refresh({ silent: true }), 800)
    } catch (e) {
      this._error = e instanceof Error ? e.message : String(e)
      this.emit()
      throw e
    }
  }

  async editComment(commentId: string, content: string): Promise<void> {
    const trimmed = content.trim()
    if (!trimmed) throw new Error("content required")
    this.ensurePendingSlotFree()
    try {
      const { submission_id } = await this.commentsApi.update(commentId, trimmed)
      const publicKey = this.getIdentity()?.publicKey ?? ""
      this.pendingOp.setPending({
        submissionId: submission_id,
        publicKey,
        content: trimmed,
        submittedAt: Date.now(),
      })
      this.emit()
      this.startPendingPoll()
      setTimeout(() => void this.refresh({ silent: true }), 800)
    } catch (e) {
      this._error = e instanceof Error ? e.message : String(e)
      this.emit()
      throw e
    }
  }

  async deleteComment(commentId: string): Promise<void> {
    this.ensurePendingSlotFree()
    try {
      const { submission_id } = await this.commentsApi.remove(commentId)
      const publicKey = this.getIdentity()?.publicKey ?? ""
      this.pendingOp.setPending({
        submissionId: submission_id,
        publicKey,
        content: "",
        submittedAt: Date.now(),
      })
      this.emit()
      this.startPendingPoll()
      setTimeout(() => void this.refresh({ silent: true }), 800)
    } catch (e) {
      this._error = e instanceof Error ? e.message : String(e)
      this.emit()
      throw e
    }
  }

  async toggleReaction(commentId: string, key: string, mine: boolean): Promise<void> {
    // REACT never occupies pending slot
    try {
      if (mine) await this.reactionsApi.remove(commentId, key)
      else await this.reactionsApi.add(commentId, key)
      await this.refresh({ silent: true })
    } catch (e) {
      this._error = e instanceof Error ? e.message : String(e)
      this.emit()
      throw e
    }
  }

  async votePoll(pollId: string, optionId: string): Promise<void> {
    // VOTE never occupies pending slot
    this.votingPollId = pollId
    this.emit()
    try {
      await this.pollsApi.vote(pollId, optionId)
      await this.refresh({ silent: true })
    } catch (e) {
      this._error = e instanceof Error ? e.message : String(e)
      this.emit()
      throw e
    } finally {
      this.votingPollId = null
      this.emit()
    }
  }

  reconcile(event: SseData): void {
    if (!isProjectorEvent(event)) return
    if (event.type === "message_created") {
      const msg = (event.payload as { message: Message }).message
      if (!msg?.event_id) return
      // If already known, just update cache, don't prepend again (dedup)
      if (this.entityCache.has(msg.event_id)) {
        this.entityCache.set(msg.event_id, msg)
        // Do not modify order if already exists; but ensure byId updated
        this.pendingOp.clearIfSatisfied([msg])
        this.emit()
        return
      }
      this.entityCache.set(msg.event_id, msg)
      const payload = event.payload as { site_id?: string; page_slug?: string; message: Message }
      const isCurrentPage = payload.site_id === this.siteId && payload.page_slug === this.pageSlug
      if (isCurrentPage && !this.pageView.order.includes(msg.event_id)) {
        this.pageView.order.unshift(msg.event_id)
      }
      this.pendingOp.clearIfSatisfied([msg])
      this.emit()
    } else if (event.type === "message_updated") {
      const msg = (event.payload as { message: Message }).message
      if (!msg?.event_id) return
      this.entityCache.set(msg.event_id, msg)
      // Never mutate order
      this.emit()
    } else if (event.type === "message_deleted") {
      const payload = event.payload as { event_id: string; site_id?: string; page_slug?: string }
      const eventId = payload.event_id
      if (!eventId) return
      this.pageView.order = this.pageView.order.filter((id) => id !== eventId)
      const existing = this.entityCache.get(eventId)
      const tombstone: Message = existing
        ? {
            ...existing,
            content: { type: "redacted" } as unknown as Message["content"],
            status: "redacted" as Message["status"],
            redacted_at: new Date().toISOString(),
          }
        : ({
            event_id: eventId,
            site_id: payload.site_id ?? "unknown",
            page_slug: payload.page_slug ?? "unknown",
            author: {
              type: "visitor",
              display_name: null,
              avatar_url: null,
              public_key: "",
              mxid: null,
            } as unknown as Message["author"],
            content: { type: "redacted" } as unknown as Message["content"],
            timestamp: new Date().toISOString(),
            edited_at: null,
            reply_to: null,
            thread_root: null,
            submission_id: null,
            status: "redacted" as Message["status"],
            redacted_at: new Date().toISOString(),
            redacted_by: null,
            reactions: [],
          } as unknown as Message)
      this.entityCache.set(eventId, tombstone)
      this.emit()
    } else if (event.type === "message_annotations_changed") {
      const msg = (event.payload as { message: Message }).message
      if (!msg?.event_id) return
      if (!this.entityCache.has(msg.event_id)) return // ignore if not exists
      this.entityCache.set(msg.event_id, msg)
      // Also check pending satisfied with all messages
      const all = this.pageView.order
        .map((id) => this.entityCache.get(id))
        .filter(Boolean) as Message[]
      this.pendingOp.clearIfSatisfied(all)
      this.emit()
    }
  }

  onIdentityChanged(): void {
    this.pendingOp.setPending(null)
    this.clearPendingPoll()
    this.page = 1
    // Trigger refresh for new identity; don't await, just fire
    void this.refresh({ silent: true })
    this.emit()
  }

  private startPendingPoll(): void {
    this.clearPendingPoll()
    this.pendingAttempts = 0
    const poll = async () => {
      if (!this.pendingOp.pending) return
      this.pendingAttempts++
      await this.refresh({ silent: true })
      if (!this.pendingOp.pending) return
      const delay = this.pendingAttempts < 15 ? 2000 : 10000
      this.pendingTimer = setTimeout(poll, delay)
    }
    this.pendingTimer = setTimeout(poll, 2000)
  }

  private clearPendingPoll(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer)
      this.pendingTimer = null
    }
    this.pendingAbortController?.abort()
    this.pendingAbortController = null
  }

  // For View compatibility
  get loading(): boolean {
    return this._loading
  }
  set loading(v: boolean) {
    this._loading = v
  }
  get errorValue(): string | null {
    return this._error
  }
  get pending(): PendingSubmission | null {
    return this.pendingOp.pending
  }

  // Expose internal for AppRuntime lifecycle
  stop(): void {
    this.clearPendingPoll()
    this.loadEpoch++ // invalidate any in-flight loads
  }

  configurePageContext(siteId: string, pageSlug: string): void {
    this.siteId = siteId
    this.pageSlug = pageSlug
  }

  rebindApis(apis: {
    commentsApi: CommentsClient
    reactionsApi: ReactionsClient
    pollsApi: PollsClient
  }): void {
    this.commentsApi = apis.commentsApi
    this.reactionsApi = apis.reactionsApi
    this.pollsApi = apis.pollsApi
  }

  // For testing: allow direct access to cache sizes
  get _entityCacheSize(): number {
    return this.entityCache.size
  }
}
