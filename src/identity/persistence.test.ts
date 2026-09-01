import { beforeEach, describe, expect, it } from "vitest"
import { generateRandomIdentity } from "./keypair"
import { IdentityPersistence } from "./persistence"
import type { StorageLike } from "./storage"

function makeStorage(): StorageLike {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  }
}

describe("IdentityPersistence", () => {
  it("empty storage returns null", () => {
    const s = makeStorage()
    const p = new IdentityPersistence(s)
    expect(p.load()).toBeNull()
  })

  it("load/save round-trip", async () => {
    const s = makeStorage()
    const p = new IdentityPersistence(s)
    const id = await generateRandomIdentity()
    p.save([{ publicKey: id.publicKey, privateKey: id.privateKey }], id.publicKey)
    const loaded = p.load()
    expect(loaded?.identities.length).toBe(1)
    expect(loaded?.activePublicKey).toBe(id.publicKey)
  })

  it("active identity persistence", async () => {
    const s = makeStorage()
    const p = new IdentityPersistence(s)
    const id1 = await generateRandomIdentity()
    const id2 = await generateRandomIdentity()
    p.save(
      [
        { publicKey: id1.publicKey, privateKey: id1.privateKey },
        { publicKey: id2.publicKey, privateKey: id2.privateKey },
      ],
      id2.publicKey,
    )
    const loaded = p.load()
    expect(loaded?.activePublicKey).toBe(id2.publicKey)
  })

  it("legacy migration", async () => {
    const s = makeStorage()
    const id = await generateRandomIdentity()
    s.setItem("cumments_identity", JSON.stringify(id))
    const p = new IdentityPersistence(s)
    const loaded = p.load()
    expect(loaded?.identities.length).toBe(1)
    expect(loaded?.activePublicKey).toBe(id.publicKey)
    // Should have migrated to new key
    expect(s.getItem("cumments_identities")).not.toBeNull()
  })

  it("corrupt JSON does not destroy valid data and returns null", async () => {
    const s = makeStorage()
    s.setItem("cumments_identities", "not json")
    const p = new IdentityPersistence(s)
    expect(p.load()).toBeNull()
    // Save should still work after corrupt
    const id = await generateRandomIdentity()
    p.save([{ publicKey: id.publicKey, privateKey: id.privateKey }], id.publicKey)
    expect(p.load()?.identities.length).toBe(1)
  })

  it("clear removes both keys", async () => {
    const s = makeStorage()
    const p = new IdentityPersistence(s)
    const id = await generateRandomIdentity()
    p.save([{ publicKey: id.publicKey, privateKey: id.privateKey }], id.publicKey)
    p.clear()
    expect(s.getItem("cumments_identities")).toBeNull()
    expect(s.getItem("cumments_identity")).toBeNull()
  })
})
