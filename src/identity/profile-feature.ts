import type { VisitorProfile, VisitorsClient } from "../api/visitors"

const TTL_MS = 5 * 60 * 1000

export class ProfileFeature {
  private cache = new Map<string, { profile: VisitorProfile; expires: number }>()
  private _current: VisitorProfile | null = null
  private _currentKey: string | null = null
  private _refreshEpoch = 0
  private listeners = new Set<() => void>()
  /**
   * The display name the user chose locally. The backend has no dedicated
   * display-name endpoint (it is written as a side effect of POST /comments),
   * so right after a save the server still reports the previous value. This
   * record keeps the local choice authoritative over that stale snapshot.
   *
   * The lifetime is bounded by `serverBaseline`: the override only masks the
   * exact value the server reported when the name was saved. As soon as the
   * server reports anything else — including a genuinely newer name — the
   * override is released and server state wins. It therefore cannot hide a
   * later server-side change, and it is dropped when the active identity
   * changes.
   */
  private _localDisplayName: {
    publicKey: string
    value: string | null
    serverBaseline: string | null
  } | null = null

  constructor(private api: VisitorsClient) {}

  setApi(api: VisitorsClient): void {
    this.api = api
  }

  get current(): VisitorProfile | null {
    return this._current
  }

  /** Subscribe to current-profile changes. Returns an unsubscribe function. */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(): void {
    for (const cb of this.listeners) cb()
  }

  /** Single mutation point for the current projection; notifies on change. */
  private updateCurrent(publicKey: string | null, profile: VisitorProfile | null): void {
    const changed =
      this._currentKey !== publicKey ||
      this._current?.visitor_id !== profile?.visitor_id ||
      this._current?.display_name !== profile?.display_name ||
      this._current?.avatar_url !== profile?.avatar_url
    this._currentKey = publicKey
    this._current = profile
    if (changed) this.emit()
  }

  /**
   * Project a server profile through the local display-name choice.
   *
   * The local value only wins while the server still reports the baseline it
   * was saved against. Any divergence means the server has moved on, so the
   * choice is released and the fresh server state is accepted.
   */
  private project(publicKey: string, server: VisitorProfile): VisitorProfile {
    const local = this._localDisplayName
    if (!local || local.publicKey !== publicKey) return server
    if (server.display_name !== local.serverBaseline) {
      this._localDisplayName = null
      return server
    }
    return { ...server, display_name: local.value }
  }

  async fetch(publicKey: string, force = false): Promise<VisitorProfile> {
    const now = Date.now()
    const cached = this.cache.get(publicKey)
    let server: VisitorProfile
    if (!force && cached && cached.expires > now) {
      server = cached.profile
    } else {
      server = await this.api.getProfile(publicKey)
      this.cache.set(publicKey, { profile: server, expires: now + TTL_MS })
    }
    const profile = this.project(publicKey, server)
    if (this._currentKey === publicKey) {
      this.updateCurrent(publicKey, profile)
    }
    return profile
  }

  async refreshCurrent(publicKey: string | null): Promise<VisitorProfile | null> {
    if (!publicKey) {
      this._refreshEpoch++
      this.updateCurrent(null, null)
      return null
    }
    // The local choice never carries over to another identity.
    if (this._localDisplayName && this._localDisplayName.publicKey !== publicKey) {
      this._localDisplayName = null
    }
    const epoch = ++this._refreshEpoch
    const profile = await this.fetch(publicKey, true)
    if (epoch !== this._refreshEpoch) return profile
    this.updateCurrent(publicKey, profile)
    return profile
  }

  async setAvatar(file: File, signal?: AbortSignal): Promise<void> {
    await this.api.setAvatar(file, signal)
    const pk = this._currentKey
    if (pk) {
      this.cache.delete(pk)
      await this.refreshCurrent(pk)
    }
  }

  async deleteAvatar(signal?: AbortSignal): Promise<void> {
    await this.api.deleteAvatar(signal)
    const pk = this._currentKey
    if (pk) {
      this.cache.delete(pk)
      await this.refreshCurrent(pk)
    }
  }

  /**
   * Update display name locally. The backend has no dedicated display-name
   * endpoint; display_name is written as a side effect of POST /comments.
   * This updates the local projection immediately so the composer reflects the
   * new name. The next comment submission persists it server-side via the
   * existing PostCommentRequest display_name field.
   */
  setDisplayName(displayName: string): void {
    const pk = this._currentKey
    if (!pk) return
    const trimmed = displayName.trim()
    const normalized = trimmed.length ? trimmed : null
    const existing = this.cache.get(pk)
    const prev = existing?.profile ?? this._current
    const visitorId = prev?.visitor_id ?? ""
    const avatarUrl = prev?.avatar_url ?? null
    const profile: VisitorProfile = {
      visitor_id: visitorId,
      display_name: normalized,
      avatar_url: avatarUrl,
    }
    // The server value at save time is the snapshot the local choice shields.
    this._localDisplayName = {
      publicKey: pk,
      value: normalized,
      serverBaseline: existing?.profile.display_name ?? prev?.display_name ?? null,
    }
    // Only the current projection is overridden; the cache keeps server truth.
    this.updateCurrent(pk, profile)
  }

  clearForIdentity(publicKey: string): void {
    this.cache.delete(publicKey)
    if (this._localDisplayName?.publicKey === publicKey) {
      this._localDisplayName = null
    }
    if (this._currentKey === publicKey) {
      // Keep _currentKey as is? Actually if cleared, we should null it until next refresh
      // But per spec, current is projection, so we clear
      this._current = null
      this.emit()
    }
  }

  // For testing: allow direct cache inspection
  _getCache(publicKey: string): { profile: VisitorProfile; expires: number } | undefined {
    return this.cache.get(publicKey)
  }
}
