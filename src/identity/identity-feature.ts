import { generateRandomIdentity, type Identity, identityMatches } from "./keypair"
import { generateMnemonic, mnemonicToIdentity, validateMnemonic } from "./mnemonic"
import type { IdentityPersistence } from "./persistence"

export class IdentityFeature {
  private _active: Identity | null = null
  private _identities: Identity[] = []
  private _mnemonicCache = new Map<string, string>()
  private listeners = new Set<() => void>()

  constructor(private readonly persistence: IdentityPersistence) {}

  private emit(): void {
    for (const cb of this.listeners) cb()
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  get active(): Identity | null {
    return this._active
  }

  get identities(): readonly Identity[] {
    return [...this._identities]
  }

  get mnemonicCache(): ReadonlyMap<string, string> {
    return this._mnemonicCache
  }

  // For compatibility with IdentityManager.list()/getActive()
  list(): Identity[] {
    return [...this._identities]
  }

  getActive(): Identity | null {
    return this._active
  }

  async start(): Promise<void> {
    const data = this.persistence.load()
    if (!data) {
      this._identities = []
      this._active = null
      return
    }
    this._identities = data.identities.map((s) => ({
      publicKey: s.publicKey,
      privateKey: s.privateKey,
    }))
    const activeKey = data.activePublicKey
    if (activeKey) {
      this._active = this._identities.find((i) => i.publicKey === activeKey) ?? null
      if (!this._active && this._identities.length > 0) {
        this._active = this._identities[0]
      }
    } else if (this._identities.length > 0) {
      this._active = this._identities[0]
    } else {
      this._active = null
    }
  }

  private save(): void {
    this.persistence.save(
      this._identities.map((i) => ({ publicKey: i.publicKey, privateKey: i.privateKey })),
      this._active?.publicKey ?? null,
    )
    this.emit()
  }

  load(): Identity | null {
    return this._active
  }

  async ensure(): Promise<Identity> {
    if (this._active) {
      const ok = await identityMatches(this._active).catch(() => false)
      if (ok) return this._active
      for (const cand of this._identities) {
        if (cand.publicKey === this._active.publicKey) continue
        const candOk = await identityMatches(cand).catch(() => false)
        if (candOk) {
          this._active = cand
          this.save()
          return cand
        }
      }
      this._active = null
      this.save()
      throw new Error(
        "active identity is invalid and no valid identity found; please import backup or create new identity",
      )
    }
    for (const cand of this._identities) {
      const ok = await identityMatches(cand).catch(() => false)
      if (ok) {
        this._active = cand
        this.save()
        return cand
      }
    }
    if (this._identities.length > 0) {
      throw new Error(
        "all stored identities are invalid; please import backup or create new identity",
      )
    }
    const id = await generateRandomIdentity()
    this._identities.push(id)
    this._active = id
    this.save()
    return id
  }

  setActive(publicKey: string): Identity {
    const found = this._identities.find((i) => i.publicKey === publicKey)
    if (!found) throw new Error("identity not found")
    this._active = found
    this.save()
    return found
  }

  addIdentity(identity: Identity): Identity {
    if (this._identities.some((i) => i.publicKey === identity.publicKey)) {
      throw new Error("identity already exists")
    }
    if (!identity.publicKey || !identity.privateKey) throw new Error("invalid identity")
    this._identities.push(identity)
    if (!this._active) this._active = identity
    this.save()
    return identity
  }

  removeIdentity(publicKey: string): void {
    const idx = this._identities.findIndex((i) => i.publicKey === publicKey)
    if (idx === -1) return
    const wasActive = this._active?.publicKey === publicKey
    this._identities.splice(idx, 1)
    if (wasActive) {
      if (this._identities.length > 0) {
        this._active = this._identities[0]
      } else {
        this._active = null
      }
    }
    this.save()
    // Clear legacy single key if no identities
    if (this._identities.length === 0) {
      // persistence clear will handle, but we keep save already
    }
  }

  async generateRandom(): Promise<Identity> {
    const id = await generateRandomIdentity()
    return this.addIdentity(id)
  }

  fingerprint(publicKey: string): string {
    return publicKey.slice(0, 8)
  }

  async fingerprintAsync(publicKey: string): Promise<string> {
    const vid = await this.visitorId(publicKey)
    return vid ? vid.slice(0, 8) : publicKey.slice(0, 8)
  }

  async visitorId(publicKey: string): Promise<string | null> {
    try {
      const b64 = publicKey.replace(/-/g, "+").replace(/_/g, "/")
      const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
      const bin = atob(padded)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const hash = await crypto.subtle.digest("SHA-256", bytes)
      const arr = new Uint8Array(hash)
      let hex = ""
      for (let i = 0; i < 16; i++) hex += arr[i].toString(16).padStart(2, "0")
      return hex
    } catch {
      return null
    }
  }

  async exportMnemonic(publicKey?: string): Promise<string> {
    const pk = publicKey ?? this._active?.publicKey
    if (!pk) throw new Error("no active identity")
    const cached = this._mnemonicCache.get(pk)
    if (cached) return cached
    throw new Error("export not available for this identity")
  }

  async exportIdentity(publicKey?: string): Promise<string> {
    const pk = publicKey ?? this._active?.publicKey
    if (!pk) throw new Error("no active identity")
    const found = this._identities.find((i) => i.publicKey === pk)
    if (!found) throw new Error("identity not found")
    const ok = await identityMatches(found).catch(() => false)
    if (!ok) throw new Error("cannot export invalid identity")
    const payload = { version: 1, publicKey: found.publicKey, privateKey: found.privateKey }
    return JSON.stringify(payload)
  }

  async importIdentityBackup(serialized: string): Promise<Identity> {
    let parsed: unknown
    try {
      parsed = JSON.parse(serialized)
    } catch {
      throw new Error("invalid backup JSON")
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as Record<string, unknown>).version !== 1 ||
      typeof (parsed as Record<string, unknown>).publicKey !== "string" ||
      typeof (parsed as Record<string, unknown>).privateKey !== "string"
    ) {
      throw new Error("invalid backup format")
    }
    const { publicKey, privateKey } = parsed as { publicKey: string; privateKey: string }
    if (!publicKey || !privateKey) throw new Error("invalid backup format")
    const identity: Identity = { publicKey, privateKey }
    const ok = await identityMatches(identity).catch(() => false)
    if (!ok) throw new Error("invalid keypair in backup")
    if (this._identities.some((i) => i.publicKey === publicKey)) {
      throw new Error("identity already exists")
    }
    this._identities.push(identity)
    this._active = identity
    this.save()
    return identity
  }

  async importMnemonic(words: string): Promise<Identity> {
    const normalized = words.trim().toLowerCase().split(/\s+/).join(" ")
    if (!validateMnemonic(normalized)) throw new Error("Invalid mnemonic")
    const identity = await mnemonicToIdentity(normalized)
    const ok = await identityMatches(identity as Identity).catch(() => false)
    if (!ok) throw new Error("invalid identity derived")
    if (this._identities.some((i) => i.publicKey === (identity as Identity).publicKey)) {
      throw new Error("identity already exists")
    }
    this._identities.push(identity as Identity)
    this._active = identity as Identity
    this._mnemonicCache.set((identity as Identity).publicKey, normalized)
    this.save()
    return identity as Identity
  }

  clearAll(): void {
    this._identities = []
    this._active = null
    this._mnemonicCache.clear()
    this.persistence.clear()
    this.emit()
  }
}
