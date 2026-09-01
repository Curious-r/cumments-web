import type { ReactiveController, ReactiveControllerHost } from "lit"
import { CommentsClient } from "../api/comments"
import { ClientContext } from "../api/context"
import { LocationClient } from "../api/location"
import { MediaClient } from "../api/media"
import { PollsClient } from "../api/polls"
import { ReactionsClient } from "../api/reactions"
import { generateRandomIdentity } from "../identity/keypair"
import { getLocalStorage, loadIdentity, saveIdentity } from "../identity/storage"
import { SseClient } from "../realtime/sse"
import { CommentStore } from "../state/comment-store"

export class CommentController implements ReactiveController {
  host: ReactiveControllerHost
  context: ClientContext
  comments: CommentsClient
  reactions: ReactionsClient
  polls: PollsClient
  media: MediaClient
  location: LocationClient
  store = new CommentStore()
  sse: SseClient | null = null
  stickerPacks: import("../api/stickers").StickerPack[] | null = null
  private stickerLoading = false
  votingPollId: string | null = null

  page = 1
  perPage = 20
  loading = true
  error: string | null = null
  draft = ""

  private pendingTimer: ReturnType<typeof setTimeout> | null = null
  private pendingAttempts = 0
  private _off: (() => void) | null = null

  constructor(
    host: ReactiveControllerHost & HTMLElement,
    opts: { endpoint: string; siteId: string; pageSlug: string; perPage?: number },
  ) {
    this.host = host
    this.perPage = opts.perPage ?? 20
    this.context = new ClientContext({
      endpoint: opts.endpoint,
      siteId: opts.siteId,
      pageSlug: opts.pageSlug,
      identity: null,
    })
    this.comments = new CommentsClient(this.context)
    this.reactions = new ReactionsClient(this.context)
    this.polls = new PollsClient(this.context)
    this.media = new MediaClient(this.context)
    this.location = new LocationClient(this.context)
    this._off = this.store.subscribe(() => this.host.requestUpdate())
    host.addController(this)
  }

  hostConnected(): void {
    this.init()
  }

  hostDisconnected(): void {
    this.sse?.close()
    this.sse = null
    this.clearPendingPoll()
    this._off?.()
    this._off = null
  }

  updateOpts(opts: { endpoint: string; siteId: string; pageSlug: string; perPage?: number }): void {
    let changed = false
    if (
      opts.endpoint !== this.context.endpoint ||
      opts.siteId !== this.context.siteId ||
      opts.pageSlug !== this.context.pageSlug
    ) {
      if (opts.endpoint !== this.context.endpoint) {
        this.context.updateEndpoint(opts.endpoint)
      } else {
        this.context.endpoint = opts.endpoint
      }
      this.context.siteId = opts.siteId
      this.context.pageSlug = opts.pageSlug
      changed = true
    }
    if (opts.perPage !== undefined && opts.perPage !== this.perPage) {
      this.perPage = opts.perPage
      changed = true
    }
    if (changed) {
      this.page = 1
      this.sse?.close()
      this.sse = null
      this.clearPendingPoll()
      this.init()
    }
  }

  private async ensureIdentity(): Promise<import("../identity/keypair").Identity> {
    let id = loadIdentity(getLocalStorage())
    if (!id) {
      id = await generateRandomIdentity()
      saveIdentity(id, getLocalStorage())
    }
    this.context.setIdentity(id)
    return id
  }

  async init(): Promise<void> {
    if (!this.context.endpoint || !this.context.siteId || !this.context.pageSlug) {
      this.error = "endpoint, site-id and page-slug are required"
      this.loading = false
      this.host.requestUpdate()
      return
    }
    // Ensure any previous SSE is closed before re-init (handles rapid updateOpts)
    this.sse?.close()
    this.sse = null
    await this.ensureIdentity()
    this.loading = true
    this.error = null
    this.host.requestUpdate()
    try {
      const res = await this.comments.list({ page: this.page, per_page: this.perPage })
      this.store.loadPage(res)
      this.sse = new SseClient({
        endpoint: this.context.endpoint,
        siteId: this.context.siteId,
        pageSlug: this.context.pageSlug,
        onEvent: (data) => this.store.mergeRealtime(data),
        onStatus: () => this.host.requestUpdate(),
      })
      this.sse.connect()
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
    } finally {
      this.loading = false
      this.host.requestUpdate()
    }
  }

  async refresh(options: { silent?: boolean } = {}): Promise<void> {
    const silent = options.silent ?? false
    if (!silent) {
      this.loading = true
      this.host.requestUpdate()
    }
    try {
      const res = await this.comments.list({ page: this.page, per_page: this.perPage })
      this.store.loadPage(res)
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
    } finally {
      if (!silent) {
        this.loading = false
      }
      this.host.requestUpdate()
    }
  }

  async submit(
    content: string,
    options:
      | {
          displayName?: string
          replyTo?: string | null
          threadRoot?: string | null
          media?: { url: string; kind?: string } | null
        }
      | string = "Anonymous",
  ): Promise<void> {
    const opts = typeof options === "string" ? { displayName: options } : options
    const displayName = opts.displayName ?? "Anonymous"
    const replyTo = opts.replyTo ?? null
    const threadRoot = opts.threadRoot ?? null
    const media = (opts as { media?: { url: string; kind?: string } | null }).media ?? null
    const trimmed = content.trim()
    if (!trimmed) return
    await this.ensureIdentity()
    try {
      const { submission_id } = await this.comments.create(trimmed, {
        displayName,
        replyTo,
        threadRoot,
        media,
      })
      this.store.setPending({
        submissionId: submission_id,
        publicKey: this.context.identity?.publicKey ?? "",
        content: trimmed,
        submittedAt: Date.now(),
      })
      this.startPendingPoll()
      setTimeout(() => this.refresh({ silent: true }), 800)
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
      this.host.requestUpdate()
      throw e
    }
  }

  async editComment(commentId: string, content: string): Promise<void> {
    const trimmed = content.trim()
    if (!trimmed) throw new Error("content required")
    await this.ensureIdentity()
    try {
      const { submission_id } = await this.comments.update(commentId, trimmed)
      this.store.setPending({
        submissionId: submission_id,
        publicKey: this.context.identity?.publicKey ?? "",
        content: trimmed,
        submittedAt: Date.now(),
      })
      this.startPendingPoll()
      setTimeout(() => this.refresh({ silent: true }), 800)
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
      this.host.requestUpdate()
      throw e
    }
  }

  async deleteComment(commentId: string): Promise<void> {
    await this.ensureIdentity()
    try {
      const { submission_id } = await this.comments.remove(commentId)
      this.store.setPending({
        submissionId: submission_id,
        publicKey: this.context.identity?.publicKey ?? "",
        content: "",
        submittedAt: Date.now(),
      })
      this.startPendingPoll()
      setTimeout(() => this.refresh({ silent: true }), 800)
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
      this.host.requestUpdate()
      throw e
    }
  }

  private startPendingPoll(): void {
    this.clearPendingPoll()
    this.pendingAttempts = 0
    const poll = async () => {
      if (!this.store.snapshot.pending) return
      this.pendingAttempts++
      await this.refresh({ silent: true })
      if (!this.store.snapshot.pending) return
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
  }

  async loadStickers(): Promise<void> {
    if (this.stickerPacks !== null || this.stickerLoading) return
    this.stickerLoading = true
    try {
      const { fetchStickers } = await import("../api/stickers")
      this.stickerPacks = await fetchStickers(this.context.endpoint, this.context.siteId)
      this.host.requestUpdate()
    } catch {
      // stickers are optional, ignore errors
    } finally {
      this.stickerLoading = false
    }
  }

  async votePoll(pollId: string, optionId: string): Promise<void> {
    await this.ensureIdentity()
    this.votingPollId = pollId
    this.host.requestUpdate()
    try {
      await this.polls.vote(pollId, optionId)
      await this.refresh({ silent: true })
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
      this.host.requestUpdate()
      throw e
    } finally {
      this.votingPollId = null
      this.host.requestUpdate()
    }
  }

  async toggleReaction(commentId: string, key: string, mine: boolean): Promise<void> {
    await this.ensureIdentity()
    try {
      if (mine) await this.reactions.remove(commentId, key)
      else await this.reactions.add(commentId, key)
      await this.refresh({ silent: true })
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
      this.host.requestUpdate()
      throw e
    }
  }

  changePage(delta: number): void {
    const meta = this.store.snapshot.meta
    const totalPages = meta?.total_pages ?? 1
    const next = Math.min(Math.max(1, this.page + delta), Math.max(1, totalPages))
    if (next !== this.page) {
      this.page = next
      this.refresh()
    }
  }
}
