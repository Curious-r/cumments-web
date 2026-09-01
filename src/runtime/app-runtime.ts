import { ChallengeManager } from "../api/challenge"
import { ClientContext } from "../api/context"
import { SigningPipeline } from "../api/signing-pipeline"
import { HttpTransport } from "../api/transport"
import { VisitorsClient } from "../api/visitors"
import { IdentityFeature } from "../identity/identity-feature"
import { IdentityPersistence } from "../identity/persistence"
import { ProfileFeature } from "../identity/profile-feature"
import { getLocalStorage, type StorageLike } from "../identity/storage"
import { PowSolver } from "../security/pow"
import { LegacyCommentsAdapter } from "./legacy-adapter"

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
  private visitors: VisitorsClient
  private _legacyAdapter: LegacyCommentsAdapter | null = null
  private challengeManager: ChallengeManager
  private powSolver: PowSolver
  private opts: WidgetOptions
  private configEpoch = 0
  private identityEpoch = 0
  private identityUnsub: (() => void) | null = null
  private started = false

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
    const ctx = new ClientContext({
      endpoint: this.opts.endpoint,
      siteId: this.opts.siteId,
      pageSlug: this.opts.pageSlug,
      identity: null,
      challengeManager: this.challengeManager,
      powSolver: this.powSolver,
      transport: this.transport,
      signingPipeline: this.signingPipeline,
    })
    this.visitors = new VisitorsClient(ctx)
    this.profile = new ProfileFeature(this.visitors)
  }

  get legacyComments(): LegacyCommentsAdapter | null {
    return this._legacyAdapter
  }

  private isCurrentEpoch(epoch: number): boolean {
    return epoch === this.configEpoch && this.started
  }

  async start(): Promise<void> {
    if (this.started) return
    const epoch = ++this.configEpoch
    this.started = true
    // identity.start
    await this.identity.start()
    if (!this.isCurrentEpoch(epoch)) return
    try {
      await this.identity.ensure()
    } catch {
      // No valid identity, will be handled by UI
    }
    if (!this.isCurrentEpoch(epoch)) return
    const active = this.identity.active
    if (active) {
      try {
        await this.profile.refreshCurrent(active.publicKey)
        if (!this.isCurrentEpoch(epoch)) return
      } catch {}
    }
    if (!this.isCurrentEpoch(epoch)) return
    const adapter = new LegacyCommentsAdapter({
      endpoint: this.opts.endpoint,
      siteId: this.opts.siteId,
      pageSlug: this.opts.pageSlug,
      perPage: this.opts.perPage ?? 20,
      transport: this.transport,
      signingPipeline: this.signingPipeline,
      challengeManager: this.challengeManager,
      powSolver: this.powSolver,
      getIdentity: () => this.identity.active,
    })
    adapter.setIdentityFeature(this.identity)
    adapter.setProfileFeature(this.profile)
    this._legacyAdapter = adapter
    await adapter.start()
    if (!this.isCurrentEpoch(epoch)) {
      // Stale start: clean up only the adapter we created
      adapter.stop()
      if (this._legacyAdapter === adapter) this._legacyAdapter = null
      return
    }
    // Subscribe only if still current
    if (!this.isCurrentEpoch(epoch)) {
      adapter.stop()
      if (this._legacyAdapter === adapter) this._legacyAdapter = null
      return
    }
    this.identityUnsub = this.identity.subscribe(() => {
      void this.onIdentityChanged()
    })
  }

  stop(): void {
    if (!this.started && this._legacyAdapter === null && this.identityUnsub === null) {
      // Idempotent: still bump epoch to invalidate any in-flight start
      this.configEpoch++
      return
    }
    if (!this.started) {
      // If not started but adapter still exists (stale start), clean up
      this.configEpoch++
      this.identityUnsub?.()
      this.identityUnsub = null
      this._legacyAdapter?.stop()
      this._legacyAdapter = null
      return
    }
    this.started = false
    this.configEpoch++
    this.identityUnsub?.()
    this.identityUnsub = null
    this._legacyAdapter?.stop()
    this._legacyAdapter = null
  }

  update(opts: Partial<WidgetOptions>): void {
    let needsRebuildVisitors = false
    let needsRestartLegacy = false
    let needsProfileRefresh = false
    let perPageChanged = false

    if (opts.endpoint !== undefined && opts.endpoint !== this.opts.endpoint) {
      this.opts.endpoint = opts.endpoint
      this.challengeManager.setEndpoint(opts.endpoint)
      this.transport.setEndpoint(opts.endpoint)
      needsRebuildVisitors = true
      needsRestartLegacy = true
    }
    if (opts.siteId !== undefined && opts.siteId !== this.opts.siteId) {
      this.opts.siteId = opts.siteId
      needsRebuildVisitors = true
      needsRestartLegacy = true
      needsProfileRefresh = true
    }
    if (opts.pageSlug !== undefined && opts.pageSlug !== this.opts.pageSlug) {
      this.opts.pageSlug = opts.pageSlug
      needsRestartLegacy = true
    }
    if (opts.perPage !== undefined && opts.perPage !== this.opts.perPage) {
      this.opts.perPage = opts.perPage
      perPageChanged = true
    }

    if (!needsRebuildVisitors && !needsRestartLegacy && !needsProfileRefresh && !perPageChanged) {
      return
    }

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
      const newVisitors = new VisitorsClient(ctx)
      this.profile.setApi(newVisitors)
      this.visitors = newVisitors
    }

    if (needsRestartLegacy) {
      const oldAdapter = this._legacyAdapter
      oldAdapter?.stop()
      const adapter = new LegacyCommentsAdapter({
        endpoint: this.opts.endpoint,
        siteId: this.opts.siteId,
        pageSlug: this.opts.pageSlug,
        perPage: this.opts.perPage ?? 20,
        transport: this.transport,
        signingPipeline: this.signingPipeline,
        challengeManager: this.challengeManager,
        powSolver: this.powSolver,
        getIdentity: () => this.identity.active,
      })
      adapter.setIdentityFeature(this.identity)
      adapter.setProfileFeature(this.profile)
      this._legacyAdapter = adapter
      adapter
        .start()
        .then(() => {
          if (epoch !== this.configEpoch) {
            adapter.stop()
            if (this._legacyAdapter === adapter) this._legacyAdapter = null
          }
        })
        .catch(() => {})
    } else if (perPageChanged) {
      const currentEpoch = epoch
      this._legacyAdapter?.update({ perPage: this.opts.perPage! })
      void currentEpoch
    }

    if (needsProfileRefresh) {
      const active = this.identity.active
      if (active) {
        const currentEpoch = this.configEpoch
        this.profile
          .refreshCurrent(active.publicKey)
          .then(() => {
            if (currentEpoch !== this.configEpoch) return
          })
          .catch(() => {})
      } else {
        this.profile.refreshCurrent(null).catch(() => {})
      }
    }
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
      await this._legacyAdapter?.onIdentityChanged()
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
}
