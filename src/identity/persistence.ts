import type { StorageLike } from "./storage"
import { getLocalStorage } from "./storage"

export const IDENTITIES_KEY = "cumments_identities"
const LEGACY_KEY = "cumments_identity"

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

export class IdentityPersistence {
  constructor(private readonly storage: StorageLike = getLocalStorage()) {}

  load(): { identities: StoredIdentity[]; activePublicKey: string | null } | null {
    // Migration from legacy single identity if new format not present
    const rawNew = this.storage.getItem(IDENTITIES_KEY)
    if (!rawNew) {
      const rawOld = this.storage.getItem(LEGACY_KEY)
      if (rawOld) {
        const parsed = safeParse(rawOld) as StoredIdentity | null
        if (parsed && parsed.publicKey && parsed.privateKey) {
          const data: IdentityStorage = {
            identities: [{ publicKey: parsed.publicKey, privateKey: parsed.privateKey }],
            activePublicKey: parsed.publicKey,
          }
          try {
            this.storage.setItem(IDENTITIES_KEY, JSON.stringify(data))
          } catch {}
          return data
        }
      }
      return null
    }
    const parsed = safeParse(rawNew) as IdentityStorage | null
    if (!parsed || !Array.isArray(parsed.identities)) {
      // Corrupt JSON: do not destroy existing, return null and let caller decide
      // Caller should treat corrupt as no valid data but not overwrite
      return null
    }
    // Filter valid
    const identities = parsed.identities.filter((id) => id.publicKey && id.privateKey)
    const activePublicKey = parsed.activePublicKey ?? null
    return { identities, activePublicKey }
  }

  save(identities: StoredIdentity[], activePublicKey: string | null): void {
    const data: IdentityStorage = {
      identities: identities.map((i) => ({ publicKey: i.publicKey, privateKey: i.privateKey })),
      activePublicKey,
    }
    try {
      this.storage.setItem(IDENTITIES_KEY, JSON.stringify(data))
      // Keep legacy single key for backward compat if active exists
      if (activePublicKey) {
        const active = identities.find((i) => i.publicKey === activePublicKey)
        if (active) {
          this.storage.setItem(LEGACY_KEY, JSON.stringify(active))
        }
      }
    } catch {}
  }

  clear(): void {
    try {
      this.storage.removeItem(IDENTITIES_KEY)
      this.storage.removeItem(LEGACY_KEY)
    } catch {}
  }
}
