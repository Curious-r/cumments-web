import type { VisitorProfile, VisitorsClient } from "../api/visitors"

const TTL_MS = 5 * 60 * 1000

export class ProfileFeature {
  private cache = new Map<string, { profile: VisitorProfile; expires: number }>()
  private _current: VisitorProfile | null = null
  private _currentKey: string | null = null
  private _refreshEpoch = 0
  private listeners = new Set<() => void>()
  /**
   * A display name the user saved locally but that the server has not
   * confirmed yet. The backend has no dedicated display-name endpoint, so a
   * plain profile refresh would otherwise rehydrate the old server value and
   * silently undo the user's intent. The override is scoped to the public key
   * it was saved for and is dropped once the server reports the same value.
   */
  private _localDisplayName: { publicKey: string; value: string | null } | null = null

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
   * Merge a locally saved display name over freshly fetched server data until
   * the server confirms it. Keeps local user intent authoritative within the
   * active session without pretending the name is already persisted.
   */
  private applyLocalDisplayName(publicKey: string, profile: VisitorProfile): VisitorProfile {
    const local = this._localDisplayName
    if (!local || local.publicKey !== publicKey) return profile
    if (profile.display_name === local.value) {
      this._localDisplayName = null
      return profile
    }
    return { ...profile, display_name: local.value }
  }

  async fetch(publicKey: string, force = false): Promise<VisitorProfile> {
    const now = Date.now()
    const cached = this.cache.get(publicKey)
    if (!force && cached && cached.expires > now) {
      return cached.profile
    }
    const profile = this.applyLocalDisplayName(publicKey, await this.api.getProfile(publicKey))
    this.cache.set(publicKey, { profile, expires: now + TTL_MS })
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
   * This method updates the local projection immediately so the composer
   * reflects the new name. The next comment submission will persist it
   * server-side via the existing PostCommentRequest display_name field.
   */
  setDisplayName(displayName: string): void {
    const pk = this._currentKey
    if (!pk) return
    const trimmed = displayName.trim()
    const normalized = trimmed.length ? trimmed : null
    const now = Date.now()
    const existing = this.cache.get(pk)
    const prev = existing?.profile ?? this._current
    const visitorId = prev?.visitor_id ?? ""
    const avatarUrl = prev?.avatar_url ?? null
    const profile: VisitorProfile = {
      visitor_id: visitorId,
      display_name: normalized,
      avatar_url: avatarUrl,
    }
    this.cache.set(pk, { profile, expires: now + TTL_MS })
    this._localDisplayName = { publicKey: pk, value: normalized }
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
