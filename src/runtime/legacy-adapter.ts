/**
 * Temporary M1 bridge: LegacyCommentsAdapter
 * Owns the existing CommentController / CommentStore / SseClient stack
 * while AppRuntime owns IdentityFeature / ProfileFeature.
 * This adapter is the ONLY bridge between AppRuntime and the legacy stack.
 * It must not become a second composition root.
 * @temporary M1 migration infrastructure - delete in M2 when CommentsFeature lands
 */

import type { ChallengeManager } from "../api/challenge"
import { CommentsClient } from "../api/comments"
import { ClientContext } from "../api/context"
import { LocationClient } from "../api/location"
import { MediaClient } from "../api/media"
import { PollsClient } from "../api/polls"
import { ReactionsClient } from "../api/reactions"
import type { SigningPipeline } from "../api/signing-pipeline"
import type { HttpTransport } from "../api/transport"
import { VisitorsClient } from "../api/visitors"
import { CommentController } from "../components/comment-controller"
import type { IdentityFeature } from "../identity/identity-feature"
import type { Identity } from "../identity/keypair"
import type { ProfileFeature } from "../identity/profile-feature"
import type { PowSolver } from "../security/pow"

class IdentityManagerShim {
  constructor(private readonly feature: IdentityFeature) {}
  ensure() {
    return this.feature.ensure()
  }
  list() {
    return this.feature.list()
  }
  getActive() {
    return this.feature.getActive()
  }
  setActive(pk: string) {
    return this.feature.setActive(pk)
  }
  addIdentity(id: Identity) {
    return this.feature.addIdentity(id)
  }
  removeIdentity(pk: string) {
    return this.feature.removeIdentity(pk)
  }
  exportMnemonic(pk?: string) {
    return this.feature.exportMnemonic(pk)
  }
  exportIdentity(pk?: string) {
    return this.feature.exportIdentity(pk)
  }
  importMnemonic(words: string) {
    return this.feature.importMnemonic(words)
  }
  importIdentityBackup(json: string) {
    return this.feature.importIdentityBackup(json)
  }
  get identities() {
    return this.feature.identities
  }
  get active() {
    return this.feature.active
  }
}

class ProfileManagerShim {
  constructor(
    private readonly feature: ProfileFeature,
    private readonly getIdentity: () => Identity | null,
  ) {}
  get current() {
    return this.feature.current
  }
  get cache() {
    return (this.feature as any).cache
  }
  fetch(pk: string, force?: boolean) {
    return this.feature.fetch(pk, force)
  }
  refreshCurrent() {
    return this.feature.refreshCurrent(this.getIdentity()?.publicKey ?? null)
  }
  setAvatar(file: File, signal?: AbortSignal) {
    return this.feature.setAvatar(file, signal)
  }
  deleteAvatar(signal?: AbortSignal) {
    return this.feature.deleteAvatar(signal)
  }
  updateContext() {
    /* no-op */
  }
  clearForIdentity(pk: string) {
    return this.feature.clearForIdentity(pk)
  }
}

export interface LegacyAdapterOptions {
  endpoint: string
  siteId: string
  pageSlug: string
  perPage?: number
  transport: HttpTransport
  signingPipeline: SigningPipeline
  challengeManager: ChallengeManager
  powSolver: PowSolver
  getIdentity: () => Identity | null
}

export class LegacyCommentsAdapter {
  private controller: CommentController | null = null
  private dummyHost: any
  private opts: LegacyAdapterOptions
  private _identityFeature: IdentityFeature | null = null
  private _profileFeature: ProfileFeature | null = null

  setIdentityFeature(feature: IdentityFeature) {
    this._identityFeature = feature
    if (this.controller) {
      ;(this.controller as any).identityManager = new IdentityManagerShim(feature)
    }
  }

  setProfileFeature(feature: ProfileFeature) {
    this._profileFeature = feature
    if (this.controller) {
      const getId = () => this._identityFeature?.active ?? null
      ;(this.controller as any).profileManager = new ProfileManagerShim(feature, getId)
    }
  }

  constructor(opts: LegacyAdapterOptions) {
    this.opts = opts
    this.dummyHost = {
      addController: (_c: any) => {},
      removeController: (_c: any) => {},
      requestUpdate: () => {},
      updateComplete: Promise.resolve(true),
    }
    this.createController()
  }

  private createController() {
    const ctx = new ClientContext({
      endpoint: this.opts.endpoint,
      siteId: this.opts.siteId,
      pageSlug: this.opts.pageSlug,
      identity: this.opts.getIdentity(),
      challengeManager: this.opts.challengeManager,
      powSolver: this.opts.powSolver,
      transport: this.opts.transport,
      signingPipeline: this.opts.signingPipeline,
    })
    Object.defineProperty(ctx, "identity", {
      get: () => this.opts.getIdentity(),
      set: () => {},
      configurable: true,
    })
    this.controller = new CommentController(this.dummyHost, {
      endpoint: this.opts.endpoint,
      siteId: this.opts.siteId,
      pageSlug: this.opts.pageSlug,
      perPage: this.opts.perPage,
    })
    ;(this.controller as any).context = ctx
    ;(this.controller as any).comments = new CommentsClient(ctx)
    ;(this.controller as any).reactions = new ReactionsClient(ctx)
    ;(this.controller as any).polls = new PollsClient(ctx)
    ;(this.controller as any).media = new MediaClient(ctx)
    ;(this.controller as any).location = new LocationClient(ctx)
    ;(this.controller as any).visitors = new VisitorsClient(ctx)
    if (this._identityFeature) {
      ;(this.controller as any).identityManager = new IdentityManagerShim(this._identityFeature)
    }
    if (this._profileFeature) {
      const getId = () => this._identityFeature?.active ?? null
      ;(this.controller as any).profileManager = new ProfileManagerShim(this._profileFeature, getId)
    }
  }

  get store() {
    return this.controller?.store ?? null
  }

  get instance(): CommentController | null {
    return this.controller
  }

  get page() {
    return this.controller?.page ?? 1
  }
  set page(v: number) {
    if (this.controller) this.controller.page = v
  }
  get perPage() {
    return this.controller?.perPage ?? 20
  }
  set perPage(v: number) {
    if (this.controller) this.controller.perPage = v
  }
  get loading() {
    return this.controller?.loading ?? true
  }
  get error() {
    return this.controller?.error ?? null
  }
  get draft() {
    return this.controller?.draft ?? ""
  }
  set draft(v: string) {
    if (this.controller) this.controller.draft = v
  }
  get displayNameDraft() {
    return this.controller?.displayNameDraft ?? ""
  }
  set displayNameDraft(v: string) {
    if (this.controller) this.controller.displayNameDraft = v
  }
  get votingPollId() {
    return this.controller?.votingPollId ?? null
  }
  get stickerPacks() {
    return this.controller?.stickerPacks ?? null
  }
  get profile() {
    return this.controller?.profile ?? null
  }
  get identities() {
    return this.controller?.identities ?? []
  }
  get activeIdentity() {
    return this.controller?.activeIdentity ?? null
  }

  async start(): Promise<void> {
    if (!this.controller) return
    const id = this.opts.getIdentity()
    if (id) {
      ;(this.controller as any).context.identity = id
    }
    await this.controller.init()
  }

  stop(): void {
    this.controller?.hostDisconnected()
  }

  update(
    opts: Partial<{ endpoint: string; siteId: string; pageSlug: string; perPage: number }>,
  ): void {
    if (!this.controller) return
    if (opts.endpoint !== undefined) this.opts.endpoint = opts.endpoint
    if (opts.siteId !== undefined) this.opts.siteId = opts.siteId
    if (opts.pageSlug !== undefined) this.opts.pageSlug = opts.pageSlug
    if (opts.perPage !== undefined) this.opts.perPage = opts.perPage
    if (opts.endpoint !== undefined || opts.siteId !== undefined || opts.pageSlug !== undefined) {
      const ctx = new ClientContext({
        endpoint: this.opts.endpoint,
        siteId: this.opts.siteId,
        pageSlug: this.opts.pageSlug,
        identity: this.opts.getIdentity(),
        challengeManager: this.opts.challengeManager,
        powSolver: this.opts.powSolver,
        transport: this.opts.transport,
        signingPipeline: this.opts.signingPipeline,
      })
      Object.defineProperty(ctx, "identity", {
        get: () => this.opts.getIdentity(),
        set: () => {},
        configurable: true,
      })
      ;(this.controller as any).context = ctx
      ;(this.controller as any).comments = new CommentsClient(ctx)
      ;(this.controller as any).reactions = new ReactionsClient(ctx)
      ;(this.controller as any).polls = new PollsClient(ctx)
      ;(this.controller as any).media = new MediaClient(ctx)
      ;(this.controller as any).location = new LocationClient(ctx)
      ;(this.controller as any).visitors = new VisitorsClient(ctx)
    }
    this.controller.updateOpts({
      endpoint: this.opts.endpoint,
      siteId: this.opts.siteId,
      pageSlug: this.opts.pageSlug,
      perPage: this.opts.perPage,
    })
  }

  async onIdentityChanged(): Promise<void> {
    if (!this.controller) return
    const id = this.opts.getIdentity()
    ;(this.controller as any).context.identity = id
    this.controller.store.setPending(null)
    ;(this.controller as any).clearPendingPoll?.()
    await this.controller.refresh()
  }

  async submit(content: string, opts?: any) {
    return this.controller?.submit(content, opts)
  }
  async editComment(id: string, content: string) {
    return this.controller?.editComment(id, content)
  }
  async deleteComment(id: string) {
    return this.controller?.deleteComment(id)
  }
  async toggleReaction(a: string, b: string, c: boolean) {
    return this.controller?.toggleReaction(a, b, c)
  }
  async votePoll(a: string, b: string) {
    return this.controller?.votePoll(a, b)
  }
  async loadStickers() {
    return this.controller?.loadStickers()
  }
  async refresh(opts?: any) {
    return this.controller?.refresh(opts)
  }
  changePage(delta: number) {
    return this.controller?.changePage(delta)
  }
}
