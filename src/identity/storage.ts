import type { Identity } from "./keypair"

export const IDENTITY_KEY = "cumments_identity"
export const MNEMONIC_SESSION_KEY = "cumments_mnemonic_session"
export const AVATAR_CACHE_PREFIX = "cumments_avatar_"

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function memoryStorage(): StorageLike {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v)
    },
    removeItem: (k) => {
      m.delete(k)
    },
  }
}

export function getLocalStorage(): StorageLike {
  try {
    const ls = globalThis.localStorage as StorageLike | undefined
    if (ls && typeof ls.getItem === "function") {
      ls.getItem("__probe")
      return ls
    }
  } catch {
    /* ignore */
  }
  return memoryStorage()
}

export function getSessionStorage(): StorageLike | null {
  try {
    const ss = globalThis.sessionStorage as StorageLike | undefined
    if (ss && typeof ss.getItem === "function") {
      ss.getItem("__probe")
      return ss
    }
  } catch {
    /* ignore */
  }
  return null
}

export function loadIdentity(storage: StorageLike = getLocalStorage()): Identity | null {
  const raw = storage.getItem(IDENTITY_KEY)
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as Identity
    if (p.publicKey && p.privateKey) return p
  } catch {
    /* ignore */
  }
  return null
}

export function saveIdentity(identity: Identity, storage: StorageLike = getLocalStorage()): void {
  storage.setItem(IDENTITY_KEY, JSON.stringify(identity))
}

export function clearIdentity(storage: StorageLike = getLocalStorage()): void {
  storage.removeItem(IDENTITY_KEY)
}

export function avatarCacheKey(siteId: string): string {
  return `${AVATAR_CACHE_PREFIX}${siteId}`
}
