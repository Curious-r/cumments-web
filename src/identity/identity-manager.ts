import { base64urlToBytes, generateRandomIdentity, type Identity, identityMatches } from "./keypair"
import { generateMnemonic, mnemonicToIdentity, validateMnemonic } from "./mnemonic"
import { getLocalStorage, type StorageLike } from "./storage"

export const IDENTITIES_KEY = "cumments_identities"

export interface StoredIdentity {
  publicKey: string
  privateKey: string
}

export interface IdentityStorage {
  identities: StoredIdentity[]
  activePublicKey: string | null
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function deriveVisitorId(publicKey: string): string | null {
  try {
    const b64 = publicKey.replace(/-/g, "+").replace(/_/g, "/")
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
    const bin = atob(padded)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    // Use WebCrypto subtle if available, fallback to simple hex of first 16 bytes hash via subtle
    // For sync version, we use a simple SHA-256 via subtle is async, so we provide async version too
    // This sync version is not used for critical path; we provide async derive
    return null
  } catch {
    return null
  }
}

export async function deriveVisitorIdAsync(publicKey: string): Promise<string | null> {
  try {
    const b64 = publicKey.replace(/-/g, "+").replace(/_/g, "/")
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
    const bin = atob(padded)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const hash = await crypto.subtle.digest("SHA-256", bytes)
    const arr = new Uint8Array(hash)
    let hex = ""
    for (let i = 0; i < 16; i++) {
      hex += arr[i].toString(16).padStart(2, "0")
    }
    return hex
  } catch {
    return null
  }
}

export function fingerprint(publicKey: string): string {
  // short 8-char fingerprint from visitor_id
  // We use sync fallback: base64url first 8 chars, but prefer async visitor id
  // For now, return first 8 chars of publicKey
  return publicKey.slice(0, 8)
}

export async function fingerprintAsync(publicKey: string): Promise<string> {
  const vid = await deriveVisitorIdAsync(publicKey)
  return vid ? vid.slice(0, 8) : publicKey.slice(0, 8)
}

export class IdentityManager {
  private storage: StorageLike
  private _active: Identity | null = null
  private _identities: Identity[] = []
  private _mnemonicCache = new Map<string, string>()

  constructor(storage: StorageLike = getLocalStorage()) {
    this.storage = storage
    this.migrateIfNeeded()
    this.loadFromStorage()
  }

  private migrateIfNeeded(): void {
    const rawNew = this.storage.getItem(IDENTITIES_KEY)
    if (rawNew) return // already new format
    const rawOld = this.storage.getItem("cumments_identity")
    if (!rawOld) return
    const parsed = safeParse(rawOld) as Identity | null
    if (!parsed || !parsed.publicKey || !parsed.privateKey) return
    // Do not overwrite if new already exists
    const data: IdentityStorage = {
      identities: [{ publicKey: parsed.publicKey, privateKey: parsed.privateKey }],
      activePublicKey: parsed.publicKey,
    }
    try {
      this.storage.setItem(IDENTITIES_KEY, JSON.stringify(data))
    } catch {}
    // Keep old key for compatibility, don't delete yet
  }

  private loadFromStorage(): void {
    const raw = this.storage.getItem(IDENTITIES_KEY)
    if (!raw) {
      this._identities = []
      this._active = null
      return
    }
    const parsed = safeParse(raw) as IdentityStorage | null
    if (!parsed || !Array.isArray(parsed.identities)) {
      // Corrupt storage: do not overwrite, keep empty but don't clear
      this._identities = []
      this._active = null
      return
    }
    // Filter valid identities
    this._identities = parsed.identities.filter((id) => id.publicKey && id.privateKey)
    const activeKey = parsed.activePublicKey
    if (activeKey) {
      this._active = this._identities.find((i) => i.publicKey === activeKey) ?? null
      if (!this._active && this._identities.length > 0) {
        // Active key points to missing identity, fallback to first
        this._active = this._identities[0]
      }
    } else if (this._identities.length > 0) {
      this._active = this._identities[0]
    } else {
      this._active = null
    }
  }

  private save(): void {
    const data: IdentityStorage = {
      identities: this._identities.map((i) => ({
        publicKey: i.publicKey,
        privateKey: i.privateKey,
      })),
      activePublicKey: this._active?.publicKey ?? null,
    }
    try {
      this.storage.setItem(IDENTITIES_KEY, JSON.stringify(data))
      // Also keep old single key for backward compat (optional)
      if (this._active) {
        this.storage.setItem("cumments_identity", JSON.stringify(this._active))
      }
    } catch {}
  }

  load(): Identity | null {
    return this._active
  }

  async ensure(): Promise<Identity> {
    if (this._active) {
      const ok = await identityMatches(this._active).catch(() => false)
      if (ok) return this._active
      // Active is invalid: try to find another valid identity
      for (const cand of this._identities) {
        if (cand.publicKey === this._active.publicKey) continue
        const candOk = await identityMatches(cand).catch(() => false)
        if (candOk) {
          this._active = cand
          this.save()
          return cand
        }
      }
      // No other valid identity: clear active to require explicit recovery
      // Do not silently generate new identity over existing (could hide corruption)
      // Keep identities list intact for user to recover via backup/mnemonic
      this._active = null
      this.save()
      throw new Error(
        "active identity is invalid and no valid identity found; please import backup or create new identity",
      )
    }
    // No active: try to find any valid among stored
    for (const cand of this._identities) {
      const ok = await identityMatches(cand).catch(() => false)
      if (ok) {
        this._active = cand
        this.save()
        return cand
      }
    }
    if (this._identities.length > 0) {
      // All stored identities are invalid
      throw new Error(
        "all stored identities are invalid; please import backup or create new identity",
      )
    }
    // No identities at all: generate new
    const id = await generateRandomIdentity()
    this._identities.push(id)
    this._active = id
    this.save()
    return id
  }

  list(): Identity[] {
    return [...this._identities]
  }

  getActive(): Identity | null {
    return this._active
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
    // Validate
    if (!identity.publicKey || !identity.privateKey) throw new Error("invalid identity")
    this._identities.push(identity)
    // If no active, set as active
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
    if (this._identities.length === 0) {
      try {
        this.storage.removeItem("cumments_identity")
      } catch {}
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
    const payload = {
      version: 1,
      publicKey: found.publicKey,
      privateKey: found.privateKey,
    }
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
    // Do not overwrite existing storage on failure above
    this._identities.push(identity)
    this._active = identity
    this.save()
    return identity
  }

  async importMnemonic(words: string): Promise<Identity> {
    const normalized = words.trim().toLowerCase().split(/\s+/).join(" ")
    if (!validateMnemonic(normalized)) throw new Error("Invalid mnemonic")
    const identity = await mnemonicToIdentity(normalized)
    this._mnemonicCache.set((identity as Identity).publicKey, normalized)
    // Check duplicate
    if (this._identities.some((i) => i.publicKey === identity.publicKey)) {
      throw new Error("identity already exists")
    }
    // Verify
    const ok = await identityMatches(identity).catch(() => false)
    if (!ok) throw new Error("invalid identity derived")
    this._identities.push(identity as Identity)
    this._active = identity as Identity
    this.save()
    return identity as Identity
  }

  // Helper for testing: clear all
  clearAll(): void {
    this._identities = []
    this._active = null
    try {
      this.storage.removeItem(IDENTITIES_KEY)
      this.storage.removeItem("cumments_identity")
    } catch {}
  }
}
