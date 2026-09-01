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

describe("IdentityManager invalid active recovery", () => {
  it("active valid returns active", async () => {
    const store = memoryStorage()
    const mgr = new IdentityManager(store)
    const id = await generateRandomIdentity()
    mgr.addIdentity(id)
    mgr.setActive(id.publicKey)
    const ensured = await mgr.ensure()
    expect(ensured.publicKey).toBe(id.publicKey)
  })

  it("active invalid + another valid switches", async () => {
    const store = memoryStorage()
    const mgr = new IdentityManager(store)
    const id1 = await generateRandomIdentity()
    const id2 = await generateRandomIdentity()
    mgr.addIdentity(id1)
    mgr.addIdentity(id2)
    mgr.setActive(id1.publicKey)
    // Corrupt active by tampering privateKey
    const raw = JSON.parse(store.getItem("cumments_identities") as string)
    raw.identities[0].privateKey = "invalid"
    store.setItem("cumments_identities", JSON.stringify(raw))
    const mgr2 = new IdentityManager(store)
    // mgr2 active is still id1 but invalid
    const ensured = await mgr2.ensure()
    expect(ensured.publicKey).toBe(id2.publicKey)
    expect(mgr2.getActive()?.publicKey).toBe(id2.publicKey)
    // Persisted active should be updated
    const raw2 = JSON.parse(store.getItem("cumments_identities") as string)
    expect(raw2.activePublicKey).toBe(id2.publicKey)
  })

  it("active invalid + all invalid throws and does not silently generate", async () => {
    const store = memoryStorage()
    const mgr = new IdentityManager(store)
    const id1 = await generateRandomIdentity()
    mgr.addIdentity(id1)
    mgr.setActive(id1.publicKey)
    const raw = JSON.parse(store.getItem("cumments_identities") as string)
    raw.identities[0].privateKey = "invalid"
    store.setItem("cumments_identities", JSON.stringify(raw))
    const mgr2 = new IdentityManager(store)
    await expect(mgr2.ensure()).rejects.toThrow(/invalid/)
    // Should not have generated new identity
    expect(mgr2.list().length).toBe(1)
    expect(mgr2.getActive()).toBeNull()
  })
})

describe("Identity backup", () => {
  it("random identity export valid JSON", async () => {
    const store = memoryStorage()
    const mgr = new IdentityManager(store)
    const id = await generateRandomIdentity()
    mgr.addIdentity(id)
    const json = await mgr.exportIdentity(id.publicKey)
    const parsed = JSON.parse(json)
    expect(parsed.version).toBe(1)
    expect(parsed.publicKey).toBe(id.publicKey)
    expect(parsed.privateKey).toBe(id.privateKey)
  })

  it("export -> import same public key", async () => {
    const store = memoryStorage()
    const mgr = new IdentityManager(store)
    const id = await generateRandomIdentity()
    mgr.addIdentity(id)
    const json = await mgr.exportIdentity(id.publicKey)
    mgr.removeIdentity(id.publicKey)
    expect(mgr.list().length).toBe(0)
    const imported = await mgr.importIdentityBackup(json)
    expect(imported.publicKey).toBe(id.publicKey)
    expect(await mgr.list().length).toBe(1)
  })

  it("duplicate backup rejected", async () => {
    const store = memoryStorage()
    const mgr = new IdentityManager(store)
    const id = await generateRandomIdentity()
    mgr.addIdentity(id)
    const json = await mgr.exportIdentity(id.publicKey)
    await expect(mgr.importIdentityBackup(json)).rejects.toThrow(/already exists/)
    expect(mgr.list().length).toBe(1)
  })

  it("corrupt JSON rejected and storage unchanged", async () => {
    const store = memoryStorage()
    const mgr = new IdentityManager(store)
    const id = await generateRandomIdentity()
    mgr.addIdentity(id)
    const before = store.getItem("cumments_identities")
    await expect(mgr.importIdentityBackup("not json")).rejects.toThrow()
    expect(store.getItem("cumments_identities")).toBe(before)
  })

  it("invalid keypair rejected", async () => {
    const store = memoryStorage()
    const mgr = new IdentityManager(store)
    const bad = JSON.stringify({ version: 1, publicKey: "bad", privateKey: "bad" })
    const before = store.getItem("cumments_identities")
    await expect(mgr.importIdentityBackup(bad)).rejects.toThrow()
    expect(mgr.list().length).toBe(0)
    // Storage should not have been modified to include bad (if it was null before, still null or empty)
    const after = store.getItem("cumments_identities")
    // It may be null or unchanged, but should not contain bad
    if (after) expect(after).not.toContain("bad")
  })

  it("round trip generate -> export -> remove -> import", async () => {
    const store = memoryStorage()
    const mgr = new IdentityManager(store)
    const id = await generateRandomIdentity()
    mgr.addIdentity(id)
    const json = await mgr.exportIdentity(id.publicKey)
    mgr.removeIdentity(id.publicKey)
    expect(mgr.list().length).toBe(0)
    const imported = await mgr.importIdentityBackup(json)
    expect(imported.publicKey).toBe(id.publicKey)
    const { deriveVisitorIdAsync } = await import("./identity-manager")
    const v1 = await deriveVisitorIdAsync(id.publicKey)
    const v2 = await deriveVisitorIdAsync(imported.publicKey)
    expect(v1).toBe(v2)
    // Verify matches
    const { identityMatches } = await import("./keypair")
    expect(await identityMatches(imported)).toBe(true)
  })

  it("duplicate mnemonic import does not pollute cache", async () => {
    const store = memoryStorage()
    const mgr = new IdentityManager(store)
    const m =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    const id = await mgr.importMnemonic(m)
    // Try duplicate
    await expect(mgr.importMnemonic(m)).rejects.toThrow()
    // Random identity that was not imported should not have mnemonic
    const random = await generateRandomIdentity()
    mgr.addIdentity(random)
    await expect(mgr.exportMnemonic(random.publicKey)).rejects.toThrow()
    // Original still exportable
    const exported = await mgr.exportMnemonic(id.publicKey)
    expect(exported).toBe(m)
  })

  it("invalid mnemonic does not pollute cache", async () => {
    const store = memoryStorage()
    const mgr = new IdentityManager(store)
    const id = await generateRandomIdentity()
    mgr.addIdentity(id)
    await expect(
      mgr.importMnemonic("invalid mnemonic words here bad bad bad bad bad bad bad bad"),
    ).rejects.toThrow()
    await expect(mgr.exportMnemonic(id.publicKey)).rejects.toThrow()
    expect(mgr.list().length).toBe(1)
  })
})
