import { ChallengeManager } from "../api/challenge"
import { CommentsClient } from "../api/comments"
import { ClientContext } from "../api/context"
import { PollsClient } from "../api/polls"
import { ReactionsClient } from "../api/reactions"
import { SigningPipeline } from "../api/signing-pipeline"
import type { StickerPack } from "../api/stickers"
import { StickersClient } from "../api/stickers-client"
import { HttpTransport } from "../api/transport"
import { VisitorsClient } from "../api/visitors"
import { CommentsFeature } from "../features/comments-feature"
import { EditorFeature } from "../features/editor-feature"
import { RealtimeFeature } from "../features/realtime-feature"
import { ThreadFeature } from "../features/thread-feature"
import { IdentityFeature } from "../identity/identity-feature"
import { IdentityPersistence } from "../identity/persistence"
import { ProfileFeature } from "../identity/profile-feature"
import { getLocalStorage, type StorageLike } from "../identity/storage"
import { SseTransport } from "../realtime/sse-transport"
import { PowSolver } from "../security/pow"
import { EntityCache } from "../state/entity-cache"
import { PageView } from "../state/page-view"
import { PendingOperation } from "../state/pending-operation"

export interface WidgetOptions {
  endpoint: string
  siteId: string
  pageSlug: string
  perPage?: number
}

export class AppRuntime {
  private readonly transport: HttpTransport
  private readonly signingPipeline: SigningPipeline
  private readonly persistence: IdentityPersistence
  readonly identity: IdentityFeature
  readonly profile: ProfileFeature
  readonly comments: CommentsFeature
  readonly editor: EditorFeature
  readonly thread: ThreadFeature
  realtime: RealtimeFeature
  private visitors: VisitorsClient
  private challengeManager: ChallengeManager
  private powSolver: PowSolver
  private opts: WidgetOptions
  private configEpoch = 0
  private identityEpoch = 0
  private identityUnsub: (() => void) | null = null
  private realtimeUnsub: (() => void) | null = null
  private started = false
  private sseTransport: SseTransport

  // For CommentsFeature API clients
  private commentsApi: CommentsClient
  private reactionsApi: ReactionsClient
  private pollsApi: PollsClient
  private stickersClient: StickersClient
  private clientContext: ClientContext

  // Sticker state
  private _stickerPacks: StickerPack[] | null = null
  private _stickerLoading = false
  private _stickerError: string | null = null
  private stickerListeners = new Set<() => void>()

  get stickerPacks(): StickerPack[] | null {
    return this._stickerPacks
  }

  get stickerLoading(): boolean {
    return this._stickerLoading
  }

  get stickerError(): string | null {
    return this._stickerError
  }

  subscribeStickers(cb: () => void): () => void {
    this.stickerListeners.add(cb)
    return () => this.stickerListeners.delete(cb)
  }

  private notifyStickers(): void {
    for (const cb of this.stickerListeners) cb()
  }

  constructor(
    opts: WidgetOptions,
    deps?: {
      storage?: StorageLike
      transport?: HttpTransport
      challengeManager?: ChallengeManager
      powSolver?: PowSolver
    },
  ) {
    this.opts = { perPage: 20, ...opts }
    this.challengeManager = deps?.challengeManager ?? new ChallengeManager(this.opts.endpoint)
    this.powSolver = deps?.powSolver ?? new PowSolver()
    this.transport = deps?.transport ?? new HttpTransport(this.opts.endpoint)
    const storage = deps?.storage ?? getLocalStorage()
    this.persistence = new IdentityPersistence(storage)
    this.identity = new IdentityFeature(this.persistence)
    this.signingPipeline = new SigningPipeline({
      getIdentity: () => this.identity.active,
      challengeManager: this.challengeManager,
      powSolver: this.powSolver,
    })
    this.clientContext = new ClientContext({
      endpoint: this.opts.endpoint,
      siteId: this.opts.siteId,
      pageSlug: this.opts.pageSlug,
      identity: null,
      challengeManager: this.challengeManager,
      powSolver: this.powSolver,
      transport: this.transport,
      signingPipeline: this.signingPipeline,
    })
    // Patch ClientContext identity getter to always reflect current identity
    Object.defineProperty(this.clientContext, "identity", {
      get: () => this.identity.active,
      set: () => {},
      configurable: true,
    })
    this.visitors = new VisitorsClient(this.clientContext)
    this.profile = new ProfileFeature(this.visitors)

    this.commentsApi = new CommentsClient(this.clientContext)
    this.reactionsApi = new ReactionsClient(this.clientContext)
    this.pollsApi = new PollsClient(this.clientContext)
    this.stickersClient = new StickersClient(this.clientContext)
    const entityCache = new EntityCache()
    const pageView = new PageView()
    const pendingOp = new PendingOperation()
    this.comments = new CommentsFeature(
      this.commentsApi,
      this.reactionsApi,
      this.pollsApi,
      entityCache,
      pageView,
      pendingOp,
      {
        page: 1,
        perPage: this.opts.perPage ?? 20,
        getIdentity: () => this.identity.active,
        siteId: this.opts.siteId,
        pageSlug: this.opts.pageSlug,
      },
    )
    this.thread = new ThreadFeature(this.commentsApi, entityCache, {
      perPage: this.opts.perPage ?? 20,
    })

    this.sseTransport = new SseTransport({
      endpoint: this.opts.endpoint,
      siteId: this.opts.siteId,
      pageSlug: this.opts.pageSlug,
    })
    this.realtime = new RealtimeFeature(this.sseTransport)

    const submitPort: import("../features/editor-feature").CommentsSubmitPort = {
      createPoll: (question, options, opts) => this.comments.createPoll(question, options, opts),
      submit: (content, opts) => this.comments.submit(content, opts),
    }
    const mediaPort: import("../features/editor-feature").MediaUploadPort = {
      upload: (file, opts) => this.uploadMedia(file, opts),
    }
    this.editor = new EditorFeature(submitPort, mediaPort)
    // Explicit composer-context coordination: Thread scope is assigned from
    // the active Thread lifecycle, never derived from the reply target.
    this.thread.onThreadOpened = (rootId) => {
      this.editor.setComposerContext({ threadRootId: rootId, replyToId: null })
    }
    this.thread.onThreadClosed = () => {
      this.editor.setComposerContext({ threadRootId: null, replyToId: null })
    }
  }

  private isCurrentEpoch(epoch: number): boolean {
    return epoch === this.configEpoch && this.started
  }

  async start(): Promise<void> {
    if (this.started) return
    const epoch = ++this.configEpoch
    this.started = true

    await this.identity.start()
    if (!this.isCurrentEpoch(epoch)) return

    try {
      await this.identity.ensure()
    } catch {}
    if (!this.isCurrentEpoch(epoch)) return

    const active = this.identity.active
    if (active) {
      try {
        await this.profile.refreshCurrent(active.publicKey)
        if (!this.isCurrentEpoch(epoch)) return
      } catch {}
    }
    if (!this.isCurrentEpoch(epoch)) return

    // Start comments
    try {
      await this.comments.loadPage({ page: 1, perPage: this.opts.perPage ?? 20 })
      if (!this.isCurrentEpoch(epoch)) {
        this.thread.stop()
        this.comments.stop()
        return
      }
    } catch {}

    if (!this.isCurrentEpoch(epoch)) {
      this.thread.stop()
      this.comments.stop()
      return
    }

    // Start realtime
    this.realtimeUnsub = this.realtime.subscribe((event) => {
      void this.onRealtimeEvent(event)
    })
    this.realtime.start()
    if (!this.isCurrentEpoch(epoch)) {
      this.realtimeUnsub?.()
      this.realtimeUnsub = null
      this.realtime.stop()
      this.thread.stop()
      this.comments.stop()
      return
    }

    // Load stickers (non-blocking)
    void this.loadStickers()
    if (!this.isCurrentEpoch(epoch)) {
      this.realtimeUnsub?.()
      this.realtimeUnsub = null
      this.realtime.stop()
      this.thread.stop()
      this.comments.stop()
      return
    }

    this.identityUnsub = this.identity.subscribe(() => {
      void this.onIdentityChanged()
    })
  }

  stop(): void {
    if (!this.started && this.realtimeUnsub === null && this.identityUnsub === null) {
      this.configEpoch++
      return
    }
    if (!this.started) {
      this.configEpoch++
      this.identityUnsub?.()
      this.identityUnsub = null
      this.realtimeUnsub?.()
      this.realtimeUnsub = null
      this.realtime.stop()
      this.thread.stop()
      this.comments.stop()
      return
    }
    this.started = false
    this.configEpoch++
    this.identityUnsub?.()
    this.identityUnsub = null
    this.realtimeUnsub?.()
    this.realtimeUnsub = null
    this.realtime.stop()
    this.thread.stop()
    this.comments.stop()
  }

  private async loadStickers(): Promise<void> {
    const epoch = this.configEpoch
    this._stickerLoading = true
    this._stickerError = null
    this.notifyStickers()
    try {
      const packs = await this.stickersClient.fetchPacks()
      // Guard: reject stale results after context change or stop
      if (epoch !== this.configEpoch || !this.started) return
      this._stickerPacks = packs
    } catch (e) {
      // Guard: reject stale errors after context change or stop
      if (epoch !== this.configEpoch || !this.started) return
      this._stickerError = e instanceof Error ? e.message : String(e)
      this._stickerPacks = null
    } finally {
      // Guard: only update loading state if still current
      if (epoch === this.configEpoch && this.started) {
        this._stickerLoading = false
        this.notifyStickers()
      }
    }
  }

  update(opts: Partial<WidgetOptions>): void {
    let needsRebuildVisitors = false
    let needsRebuildRealtime = false
    let needsReloadComments = false
    let perPageChanged = false

    if (opts.endpoint !== undefined && opts.endpoint !== this.opts.endpoint) {
      this.opts.endpoint = opts.endpoint
      this.challengeManager.setEndpoint(opts.endpoint)
      this.transport.setEndpoint(opts.endpoint)
      this.sseTransport.setEndpoint(opts.endpoint)
      this.clientContext.updateEndpoint(opts.endpoint)
      needsRebuildVisitors = true
      needsRebuildRealtime = true
      needsReloadComments = true
    }
    if (opts.siteId !== undefined && opts.siteId !== this.opts.siteId) {
      this.opts.siteId = opts.siteId
      this.clientContext.siteId = opts.siteId
      needsRebuildVisitors = true
      needsRebuildRealtime = true
      needsReloadComments = true
    }
    if (opts.pageSlug !== undefined && opts.pageSlug !== this.opts.pageSlug) {
      this.opts.pageSlug = opts.pageSlug
      this.clientContext.pageSlug = opts.pageSlug
      needsRebuildRealtime = true
      needsReloadComments = true
    }
    if (opts.perPage !== undefined && opts.perPage !== this.opts.perPage) {
      this.opts.perPage = opts.perPage
      perPageChanged = true
    }

    if (!needsRebuildVisitors && !needsRebuildRealtime && !needsReloadComments && !perPageChanged)
      return

    this.configEpoch++
    const epoch = this.configEpoch

    if (needsRebuildVisitors) {
      const ctx = new ClientContext({
        endpoint: this.opts.endpoint,
        siteId: this.opts.siteId,
        pageSlug: this.opts.pageSlug,
        identity: this.identity.active,
        challengeManager: this.challengeManager,
        powSolver: this.powSolver,
        transport: this.transport,
        signingPipeline: this.signingPipeline,
      })
      Object.defineProperty(ctx, "identity", {
        get: () => this.identity.active,
        set: () => {},
        configurable: true,
      })
      this.clientContext = ctx
      this.commentsApi = new CommentsClient(this.clientContext)
      this.reactionsApi = new ReactionsClient(this.clientContext)
      this.pollsApi = new PollsClient(this.clientContext)
      this.comments.rebindApis({
        commentsApi: this.commentsApi,
        reactionsApi: this.reactionsApi,
        pollsApi: this.pollsApi,
      })
      this.thread.rebindApi(this.commentsApi)
      // Thread state is transient and scoped to the previous context
      this.thread.close()
      const newVisitors = new VisitorsClient(ctx)
      this.visitors = newVisitors
      this.profile.setApi(newVisitors)
    }

    // Update CommentsFeature page context for site/page changes (composition wiring, not business)
    if (opts.siteId !== undefined || opts.pageSlug !== undefined) {
      this.comments.configurePageContext(this.opts.siteId, this.opts.pageSlug)
      // Thread state is transient and scoped to the previous page context
      this.thread.close()
    }

    if (needsRebuildRealtime) {
      this.realtimeUnsub?.()
      this.realtime.stop()
      // Create new transport with fresh seenIds
      this.sseTransport = new SseTransport({
        endpoint: this.opts.endpoint,
        siteId: this.opts.siteId,
        pageSlug: this.opts.pageSlug,
      })
      // Need to recreate RealtimeFeature with new transport
      const newRealtime = new RealtimeFeature(this.sseTransport)
      this.realtime = newRealtime
      this.realtimeUnsub = newRealtime.subscribe((event) => {
        void this.onRealtimeEvent(event)
      })
      newRealtime.start()
      // Guard stale check after async start? start is sync, so no need
      if (epoch !== this.configEpoch) {
        newRealtime.stop()
      }
    }

    if (needsReloadComments) {
      // Reset page to 1 and reload
      const perPage = this.opts.perPage ?? 20
      this.comments.loadPage({ page: 1, perPage }).catch(() => {})
      if (epoch !== this.configEpoch) return
    } else if (perPageChanged) {
      const perPage = this.opts.perPage!
      this.comments
        .loadPage({ page: this.comments.snapshot().meta?.page ?? 1, perPage })
        .catch(() => {})
    }

    // Profile refresh for siteId change is handled via needsRebuildVisitors? Actually siteId change should refresh profile
    // But profile refresh is tied to identity, not site. For site change, we should clear profile cache? For now, just keep.
  }

  private async onRealtimeEvent(event: import("../api/contract/sse").SseData): Promise<void> {
    // AppRuntime is sole router: RealtimeFeature -> CommentsFeature / ThreadFeature.
    // EntityCache upserts happen in CommentsFeature; ThreadFeature adjusts only
    // active Thread membership from the event's explicit backend semantics.
    this.comments.reconcile(event)
    this.thread.reconcileRealtime(event)
  }

  private async onIdentityChanged(): Promise<void> {
    const generation = ++this.identityEpoch
    const configEpochAtStart = this.configEpoch
    const active = this.identity.active
    try {
      await this.profile.refreshCurrent(active?.publicKey ?? null)
      if (generation !== this.identityEpoch) return
      if (configEpochAtStart !== this.configEpoch) return
    } catch {}
    if (generation !== this.identityEpoch) return
    if (configEpochAtStart !== this.configEpoch) return
    try {
      this.comments.onIdentityChanged()
      if (generation !== this.identityEpoch) return
      if (configEpochAtStart !== this.configEpoch) return
    } catch {}
  }

  get _configEpoch(): number {
    return this.configEpoch
  }

  get _identityEpoch(): number {
    return this.identityEpoch
  }

  async handleEditorSubmit(detail: {
    content: string
    displayName: string
    media?: { url: string; kind: string } | null
    geoUri?: string
    poll?: { question: string; options: string[]; maxSelections?: number }
  }): Promise<void> {
    const displayName = detail.displayName ?? "Anonymous"
    // ComposerContext is the single source of the relation fields for every
    // creation type. Context and Thread view generation are captured once,
    // synchronously, before any request — a lifecycle change during the
    // in-flight creation can never retarget the reconciliation.
    const { replyToId, threadRootId } = this.editor.getComposerContext()
    const threadGeneration = this.thread.generation
    if (detail.poll) {
      await this.editor.submitPollFromIntent(detail.poll, displayName)
      this.reconcileThreadCreation(threadRootId, threadGeneration)
      return
    }
    const content = detail.content?.trim()
    if (!content && !detail.geoUri) return
    if (detail.geoUri?.startsWith("geo:")) {
      await this.shareLocation(detail.geoUri, {
        replyToId: replyToId,
        threadRootId: threadRootId,
        displayName,
      })
      this.reconcileThreadCreation(threadRootId, threadGeneration)
      await this.comments.refresh().catch(() => {})
      return
    }
    if (detail.media) {
      await this.comments.submit(content, {
        displayName,
        replyToId: replyToId,
        threadRootId: threadRootId,
        media: detail.media,
      })
      this.reconcileThreadCreation(threadRootId, threadGeneration)
    } else {
      if (!content) return
      await this.editor.submitFromIntent(content, displayName)
      this.reconcileThreadCreation(threadRootId, threadGeneration)
    }
  }

  /**
   * Shared post-success reconciliation for Thread-scoped creations of every
   * content type. The captured creation context and the captured Thread view
   * generation (not the current composer/thread state) identify the intended
   * Thread lifecycle; only a still-current matching Thread is updated.
   */
  private reconcileThreadCreation(threadRootId: string | null, generation: number): void {
    if (!threadRootId) return
    void this.thread.revalidateAfterCreation(threadRootId, generation)
  }

  async uploadMedia(
    file: File,
    opts?: { signal?: AbortSignal },
  ): Promise<{
    url: string
    filename: string | null
    mimetype: string | null
    size: number | null
    voice: boolean
  }> {
    const { MediaClient } = await import("../api/media")
    const client = new MediaClient(this.clientContext)
    return client.upload(file, opts)
  }

  async shareLocation(
    geoUri: string,
    opts: {
      replyToId?: string | null
      threadRootId?: string | null
      displayName?: string
      signal?: AbortSignal
    } = {},
  ): Promise<{ submission_id: number }> {
    const { LocationClient } = await import("../api/location")
    const client = new LocationClient(this.clientContext)
    return client.share(geoUri, {
      replyToId: opts.replyToId ?? null,
      threadRootId: opts.threadRootId ?? null,
      displayName: opts.displayName,
      signal: opts.signal,
    })
  }
}
