import { describe, expect, it } from "vitest"
import type { Identity } from "./keypair"
import { avatarCacheKey, clearIdentity, loadIdentity, saveIdentity } from "./storage"

function memStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => m.set(k, v),
    removeItem: (k: string) => m.delete(k),
  }
}

describe("storage", () => {
  it("save and load identity", () => {
    const s = memStorage()
    const id: Identity = { publicKey: "pub", privateKey: "priv" }
    saveIdentity(id, s as never)
    expect(loadIdentity(s as never)).toEqual(id)
  })

  it("clear identity", () => {
    const s = memStorage()
    saveIdentity({ publicKey: "a", privateKey: "b" }, s as never)
    clearIdentity(s as never)
    expect(loadIdentity(s as never)).toBeNull()
  })

  it("avatar cache key is site-scoped", () => {
    expect(avatarCacheKey("my-blog")).toBe("cumments_avatar_my-blog")
    expect(avatarCacheKey("a")).not.toBe(avatarCacheKey("b"))
  })

  it("returns null for corrupted data", () => {
    const s = memStorage()
    ;(s as unknown as { setItem: (k: string, v: string) => void }).setItem(
      "cumments_identity",
      "not-json",
    )
    expect(loadIdentity(s as never)).toBeNull()
  })
})
