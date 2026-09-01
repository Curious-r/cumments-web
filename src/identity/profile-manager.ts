import type { ClientContext } from "../api/context"
import { type VisitorProfile, VisitorsClient } from "../api/visitors"

const TTL_MS = 5 * 60 * 1000

export class ProfileManager {
  cache = new Map<string, { profile: VisitorProfile; expires: number }>()
  current: VisitorProfile | null = null
  private client: VisitorsClient

  constructor(private ctx: ClientContext) {
    this.client = new VisitorsClient(ctx)
  }

  updateContext(ctx: ClientContext): void {
    this.client = new VisitorsClient(ctx)
  }

  async fetch(publicKey: string, force = false): Promise<VisitorProfile> {
    const now = Date.now()
    const cached = this.cache.get(publicKey)
    if (!force && cached && cached.expires > now) {
      if (this.ctx.identity?.publicKey === publicKey) this.current = cached.profile
      return cached.profile
    }
    const profile = await this.client.getProfile(publicKey)
    this.cache.set(publicKey, { profile, expires: now + TTL_MS })
    if (this.ctx.identity?.publicKey === publicKey) this.current = profile
    return profile
  }

  async refreshCurrent(): Promise<VisitorProfile | null> {
    const pk = this.ctx.identity?.publicKey
    if (!pk) {
      this.current = null
      return null
    }
    return this.fetch(pk, true)
  }

  async setAvatar(file: File): Promise<void> {
    await this.client.setAvatar(file)
    // Invalidate cache
    const pk = this.ctx.identity?.publicKey
    if (pk) {
      this.cache.delete(pk)
      await this.fetch(pk, true)
    }
  }

  async deleteAvatar(): Promise<void> {
    await this.client.deleteAvatar()
    const pk = this.ctx.identity?.publicKey
    if (pk) {
      this.cache.delete(pk)
      await this.fetch(pk, true)
    }
  }

  clearForIdentity(publicKey: string): void {
    this.cache.delete(publicKey)
    if (this.current && this.ctx.identity?.publicKey !== publicKey) {
      // keep current
    }
  }
}
