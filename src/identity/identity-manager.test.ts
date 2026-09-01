import { beforeEach, describe, expect, it } from "vitest"
import { IdentityManager } from "./identity-manager"
import { generateRandomIdentity } from "./keypair"
import { generateMnemonic, mnemonicToIdentity, validateMnemonic } from "./mnemonic"
import type { StorageLike } from "./storage"

function memoryStorage(): StorageLike {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  }
}

describe("IdentityManager storage", () => {
  it("migrates old cumments_identity", async () => {
    const store = memoryStorage()
    const id = await generateRandomIdentity()
    store.setItem("cumments_identity", JSON.stringify(id))
    const mgr = new IdentityManager(store)
    expect(mgr.list().length).toBe(1)
    expect(mgr.getActive()?.publicKey).toBe(id.publicKey)
    expect(store.getItem("cumments_identities")).not.toBeNull()
  })

  it("persists multiple identities and active", async () => {
    const store = memoryStorage()
    const mgr = new IdentityManager(store)
    const id1 = await generateRandomIdentity()
    const id2 = await generateRandomIdentity()
    mgr.addIdentity(id1)
    mgr.addIdentity(id2)
    expect(mgr.list().length).toBe(2)
    mgr.setActive(id2.publicKey)
    expect(mgr.getActive()?.publicKey).toBe(id2.publicKey)
    // Reload
    const mgr2 = new IdentityManager(store)
    expect(mgr2.list().length).toBe(2)
    expect(mgr2.getActive()?.publicKey).toBe(id2.publicKey)
  })

  it("rejects duplicate", async () => {
    const store = memoryStorage()
    const mgr = new IdentityManager(store)
    const id = await generateRandomIdentity()
    mgr.addIdentity(id)
    expect(() => mgr.addIdentity(id)).toThrow(/already exists/)
  })

  it("remove inactive", async () => {
    const store = memoryStorage()
    const mgr = new IdentityManager(store)
    const id1 = await generateRandomIdentity()
    const id2 = await generateRandomIdentity()
    mgr.addIdentity(id1)
    mgr.addIdentity(id2)
    mgr.setActive(id1.publicKey)
    mgr.removeIdentity(id2.publicKey)
    expect(mgr.list().length).toBe(1)
    expect(mgr.getActive()?.publicKey).toBe(id1.publicKey)
  })

  it("remove active switches to another", async () => {
    const store = memoryStorage()
    const mgr = new IdentityManager(store)
    const id1 = await generateRandomIdentity()
    const id2 = await generateRandomIdentity()
    mgr.addIdentity(id1)
    mgr.addIdentity(id2)
    mgr.setActive(id1.publicKey)
    mgr.removeIdentity(id1.publicKey)
    expect(mgr.getActive()?.publicKey).toBe(id2.publicKey)
  })

  it("remove last active becomes null", async () => {
    const store = memoryStorage()
    const mgr = new IdentityManager(store)
    const id = await generateRandomIdentity()
    mgr.addIdentity(id)
    mgr.setActive(id.publicKey)
    mgr.removeIdentity(id.publicKey)
    expect(mgr.getActive()).toBeNull()
    expect(mgr.list().length).toBe(0)
  })

  it("corrupt storage does not overwrite valid", async () => {
    const store = memoryStorage()
    store.setItem("cumments_identities", "not json")
    const mgr = new IdentityManager(store)
    expect(mgr.list().length).toBe(0)
    // Should not have thrown, and should not have overwritten with empty
    // Next ensure can still add
    const id = await generateRandomIdentity()
    mgr.addIdentity(id)
    expect(mgr.list().length).toBe(1)
  })
})

describe("Mnemonic", () => {
  it("mnemonic -> identity deterministic", async () => {
    const m = generateMnemonic()
    const id1 = await mnemonicToIdentity(m)
    const id2 = await mnemonicToIdentity(m)
    expect(id1.publicKey).toBe(id2.publicKey)
  })

  it("export -> import yields same", async () => {
    const store = memoryStorage()
    const mgr = new IdentityManager(store)
    const m = generateMnemonic()
    const id = await mgr.importMnemonic(m)
    expect(validateMnemonic(m)).toBe(true)
    const exported = await mgr.exportMnemonic(id.publicKey)
    expect(exported).toBe(m.toLowerCase().split(/\s+/).join(" "))
    // Import same again should fail duplicate
    await expect(mgr.importMnemonic(m)).rejects.toThrow()
  })

  it("invalid mnemonic rejected", async () => {
    const store = memoryStorage()
    const mgr = new IdentityManager(store)
    await expect(
      mgr.importMnemonic("invalid words here bad bad bad bad bad bad bad bad"),
    ).rejects.toThrow()
  })

  it("whitespace normalization", async () => {
    const m = generateMnemonic()
    const withSpaces = "  " + m.split(" ").join("   \n ") + "  "
    const id1 = await mnemonicToIdentity(m)
    const id2 = await mnemonicToIdentity(withSpaces)
    expect(id1.publicKey).toBe(id2.publicKey)
  })

  it("fingerprint deterministic", async () => {
    const { deriveVisitorIdAsync } = await import("./identity-manager")
    const id = await generateRandomIdentity()
    const v1 = await deriveVisitorIdAsync(id.publicKey)
    const v2 = await deriveVisitorIdAsync(id.publicKey)
    expect(v1).toBe(v2)
    expect(v1?.length).toBe(32)
  })
})
