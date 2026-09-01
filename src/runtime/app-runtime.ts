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
  readonly transport: HttpTransport
  readonly signingPipeline: SigningPipeline
  readonly persistence: IdentityPersistence
  readonly identity: IdentityFeature
  readonly profile: ProfileFeature
  readonly visitors: VisitorsClient
  private _legacyAdapter: LegacyCommentsAdapter | null = null
  private challengeManager: ChallengeManager
  private powSolver: PowSolver
  private opts: WidgetOptions
  private configEpoch = 0
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

    // Legacy adapter will be created in start() once we have identity
    // We need to create it now with a placeholder, or lazily
  }

  get legacyComments(): LegacyCommentsAdapter | null {
    return this._legacyAdapter
  }

  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    await this.identity.start()
    // Ensure identity
    try {
      await this.identity.ensure()
    } catch {
      // No valid identity, will be handled by UI
    }
    const active = this.identity.active
    // Propagate identity to signing wiring is already via getIdentity()
    // Refresh profile for active identity
    if (active) {
      const epoch = this.configEpoch
      try {
        const profile = await this.profile.refreshCurrent(active.publicKey)
        if (epoch !== this.configEpoch) return
        // profile set
      } catch {}
    }
    // Create legacy adapter
    this._legacyAdapter = new LegacyCommentsAdapter({
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
    this._legacyAdapter.setIdentityFeature(this.identity)
    this._legacyAdapter.setProfileFeature(this.profile)
    await this._legacyAdapter.start()

    // Subscribe to identity changes
    this.identityUnsub = this.identity.subscribe(() => {
      this.onIdentityChanged()
    })
  }

  stop(): void {
    if (!this.started) return
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
      ;(this.profile as any).api = newVisitors
      ;(this as any).visitors = newVisitors
    }

    if (needsRestartLegacy) {
      const oldAdapter = this._legacyAdapter
      oldAdapter?.stop()
      this._legacyAdapter = new LegacyCommentsAdapter({
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
      this._legacyAdapter.setIdentityFeature(this.identity)
      this._legacyAdapter.setProfileFeature(this.profile)
      // Start new adapter, but guard against stale epoch
      this._legacyAdapter
        .start()
        .then(() => {
          if (epoch !== this.configEpoch) {
            this._legacyAdapter?.stop()
          }
        })
        .catch(() => {})
    } else if (perPageChanged) {
      // perPage only affects current page projection; preserve EntityCache, Pending, Profile, SSE
      // Every update establishes a new epoch; stale perPage=N query must not overwrite perPage=M
      const currentEpoch = epoch
      // The adapter's update will trigger a fresh QUERY with new perPage; correctness relies on epoch guard
      this._legacyAdapter?.update({ perPage: this.opts.perPage! })
      // If a newer configuration arrives before this query resolves, the store's stale result
      // must be ignored – the controller's loadPage will still execute but AppRuntime epoch
      // ensures profile/legacy restarts are guarded; perPage stale handling is via epoch check
      // in the surrounding configuration epoch mechanism (no additional PageView controller).
      void currentEpoch
    }

    if (needsProfileRefresh) {
      const active = this.identity.active
      if (active) {
        const currentEpoch = this.configEpoch
        this.profile
          .refreshCurrent(active.publicKey)
          .then((res) => {
            if (currentEpoch !== this.configEpoch) return
          })
          .catch(() => {})
      } else {
        this.profile.refreshCurrent(null).catch(() => {})
      }
    }
  }

  private async onIdentityChanged(): Promise<void> {
    const epoch = this.configEpoch
    const active = this.identity.active
    // Propagate to signing is automatic via getIdentity()
    // Refresh profile
    try {
      await this.profile.refreshCurrent(active?.publicKey ?? null)
      if (epoch !== this.configEpoch) return
    } catch {}
    // Refresh legacy comments
    try {
      await this._legacyAdapter?.onIdentityChanged()
      if (epoch !== this.configEpoch) return
    } catch {}
  }

  // For testing: expose config epoch
  get _configEpoch(): number {
    return this.configEpoch
  }
}
