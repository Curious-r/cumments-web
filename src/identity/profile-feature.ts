import type { VisitorProfile, VisitorsClient } from "../api/visitors"

const TTL_MS = 5 * 60 * 1000

export class ProfileFeature {
  private cache = new Map<string, { profile: VisitorProfile; expires: number }>()
  private _current: VisitorProfile | null = null
  private _currentKey: string | null = null
  private _refreshEpoch = 0

  constructor(private api: VisitorsClient) {}

  setApi(api: VisitorsClient): void {
    this.api = api
  }

  get current(): VisitorProfile | null {
    return this._current
  }

  async fetch(publicKey: string, force = false): Promise<VisitorProfile> {
    const now = Date.now()
    const cached = this.cache.get(publicKey)
    if (!force && cached && cached.expires > now) {
      return cached.profile
    }
    const profile = await this.api.getProfile(publicKey)
    this.cache.set(publicKey, { profile, expires: now + TTL_MS })
    if (this._currentKey === publicKey) {
      this._current = profile
    }
    return profile
  }

  async refreshCurrent(publicKey: string | null): Promise<VisitorProfile | null> {
    if (!publicKey) {
      this._current = null
      this._currentKey = null
      this._refreshEpoch++
      return null
    }
    const epoch = ++this._refreshEpoch
    const profile = await this.fetch(publicKey, true)
    if (epoch !== this._refreshEpoch) return profile
    this._currentKey = publicKey
    this._current = profile
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

  clearForIdentity(publicKey: string): void {
    this.cache.delete(publicKey)
    if (this._currentKey === publicKey) {
      this._current = null
      // Keep _currentKey as is? Actually if cleared, we should null it until next refresh
      // But per spec, current is projection, so we clear
    }
  }

  // For testing: allow direct cache inspection
  _getCache(publicKey: string): { profile: VisitorProfile; expires: number } | undefined {
    return this.cache.get(publicKey)
  }
}
