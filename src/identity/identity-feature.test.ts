import { describe, expect, it, vi } from "vitest"
import { IdentityFeature } from "./identity-feature"
import { generateRandomIdentity } from "./keypair"
import { generateMnemonic, mnemonicToIdentity, validateMnemonic } from "./mnemonic"
import { IdentityPersistence } from "./persistence"
import type { StorageLike } from "./storage"

function memoryStorage(): StorageLike {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  }
}

async function makeFeature(
  storage = memoryStorage(),
): Promise<{ feature: IdentityFeature; storage: StorageLike; persistence: IdentityPersistence }> {
  const persistence = new IdentityPersistence(storage)
  const feature = new IdentityFeature(persistence)
  await feature.start()
  return { feature, storage, persistence }
}

describe("IdentityFeature - persistence and lifecycle", () => {
  it("empty storage start yields no active and ensure generates random", async () => {
    const { feature } = await makeFeature()
    expect(feature.active).toBeNull()
    const id = await feature.ensure()
    expect(id.publicKey).toBeTruthy()
    expect(feature.active?.publicKey).toBe(id.publicKey)
    expect(feature.identities.length).toBe(1)
  })

  it("load/save round-trip", async () => {
    const storage = memoryStorage()
    const { feature } = await makeFeature(storage)
    const id = await generateRandomIdentity()
    feature.addIdentity(id)
    expect(feature.identities.length).toBe(1)
    // Reload via new feature
    const p2 = new IdentityPersistence(storage)
    const f2 = new IdentityFeature(p2)
    await f2.start()
    expect(f2.identities.length).toBe(1)
    expect(f2.active?.publicKey).toBe(id.publicKey)
  })

  it("persists multiple identities and active selection", async () => {
    const storage = memoryStorage()
    const { feature } = await makeFeature(storage)
    const id1 = await generateRandomIdentity()
    const id2 = await generateRandomIdentity()
    feature.addIdentity(id1)
    feature.addIdentity(id2)
    expect(feature.identities.length).toBe(2)
    feature.setActive(id2.publicKey)
    expect(feature.active?.publicKey).toBe(id2.publicKey)
    const p2 = new IdentityPersistence(storage)
    const f2 = new IdentityFeature(p2)
    await f2.start()
    expect(f2.identities.length).toBe(2)
    expect(f2.active?.publicKey).toBe(id2.publicKey)
  })

  it("migrates legacy cumments_identity", async () => {
    const storage = memoryStorage()
    const id = await generateRandomIdentity()
    storage.setItem("cumments_identity", JSON.stringify(id))
    const { feature } = await makeFeature(storage)
    expect(feature.identities.length).toBe(1)
    expect(feature.active?.publicKey).toBe(id.publicKey)
    expect(storage.getItem("cumments_identities")).not.toBeNull()
  })

  it("rejects duplicate identity", async () => {
    const { feature } = await makeFeature()
    const id = await generateRandomIdentity()
    feature.addIdentity(id)
    expect(() => feature.addIdentity(id)).toThrow(/already exists/)
  })

  it("remove inactive", async () => {
    const { feature } = await makeFeature()
    const id1 = await generateRandomIdentity()
    const id2 = await generateRandomIdentity()
    feature.addIdentity(id1)
    feature.addIdentity(id2)
    feature.setActive(id1.publicKey)
    feature.removeIdentity(id2.publicKey)
    expect(feature.identities.length).toBe(1)
    expect(feature.active?.publicKey).toBe(id1.publicKey)
  })

  it("remove active switches to another", async () => {
    const { feature } = await makeFeature()
    const id1 = await generateRandomIdentity()
    const id2 = await generateRandomIdentity()
    feature.addIdentity(id1)
    feature.addIdentity(id2)
    feature.setActive(id1.publicKey)
    feature.removeIdentity(id1.publicKey)
    expect(feature.active?.publicKey).toBe(id2.publicKey)
  })

  it("remove last active becomes null", async () => {
    const { feature } = await makeFeature()
    const id = await generateRandomIdentity()
    feature.addIdentity(id)
    feature.setActive(id.publicKey)
    feature.removeIdentity(id.publicKey)
    expect(feature.active).toBeNull()
    expect(feature.identities.length).toBe(0)
  })

  it("corrupt storage returns empty and does not throw", async () => {
    const storage = memoryStorage()
    storage.setItem("cumments_identities", "not json")
    const { feature } = await makeFeature(storage)
    expect(feature.identities.length).toBe(0)
    expect(feature.active).toBeNull()
    const id = await generateRandomIdentity()
    feature.addIdentity(id)
    expect(feature.identities.length).toBe(1)
  })

  it("invalid active recovery falls back to valid identity", async () => {
    const storage = memoryStorage()
    const { feature } = await makeFeature(storage)
    const id1 = await generateRandomIdentity()
    const id2 = await generateRandomIdentity()
    feature.addIdentity(id1)
    feature.addIdentity(id2)
    feature.setActive(id1.publicKey)
    // Corrupt storage to have invalid privateKey
    const raw = JSON.parse(storage.getItem("cumments_identities") as string) as {
      identities: { publicKey: string; privateKey: string }[]
      activePublicKey: string
    }
    raw.identities[0].privateKey = "invalid"
    storage.setItem("cumments_identities", JSON.stringify(raw))
    const p2 = new IdentityPersistence(storage)
    const f2 = new IdentityFeature(p2)
    await f2.start()
    const recovered = await f2.ensure()
    expect(recovered.publicKey).toBe(id2.publicKey)
    expect(f2.active?.publicKey).toBe(id2.publicKey)
    expect(f2.identities.length).toBe(2)
  })
})

describe("IdentityFeature - mnemonic", () => {
  it("mnemonic -> identity deterministic", async () => {
    const m = generateMnemonic()
    const id1 = await mnemonicToIdentity(m)
    const id2 = await mnemonicToIdentity(m)
    expect(id1.publicKey).toBe(id2.publicKey)
  })

  it("importMnemonic caches and export works", async () => {
    const { feature } = await makeFeature()
    const m = generateMnemonic()
    const id = await feature.importMnemonic(m)
    expect(validateMnemonic(m)).toBe(true)
    const exported = await feature.exportMnemonic(id.publicKey)
    expect(exported).toBe(m.toLowerCase().split(/\s+/).join(" "))
    await expect(feature.importMnemonic(m)).rejects.toThrow()
  })

  it("invalid mnemonic rejected and does not pollute cache", async () => {
    const { feature } = await makeFeature()
    const id = await generateRandomIdentity()
    feature.addIdentity(id)
    await expect(
      feature.importMnemonic("invalid words here bad bad bad bad bad bad bad bad"),
    ).rejects.toThrow()
    await expect(feature.exportMnemonic(id.publicKey)).rejects.toThrow()
    expect(feature.identities.length).toBe(1)
  })

  it("whitespace normalization", async () => {
    const m = generateMnemonic()
    const withSpaces = `  ${m.split(" ").join("   \n ")}  `
    const id1 = await mnemonicToIdentity(m)
    const id2 = await mnemonicToIdentity(withSpaces)
    expect(id1.publicKey).toBe(id2.publicKey)
  })

  it("mnemonic cache ordering preserved after duplicate attempt", async () => {
    const { feature } = await makeFeature()
    const m =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    const id = await feature.importMnemonic(m)
    await expect(feature.importMnemonic(m)).rejects.toThrow()
    const random = await generateRandomIdentity()
    feature.addIdentity(random)
    await expect(feature.exportMnemonic(random.publicKey)).rejects.toThrow()
    const exported = await feature.exportMnemonic(id.publicKey)
    expect(exported).toBe(m)
  })
})

describe("IdentityFeature - backup", () => {
  it("exportIdentity valid JSON", async () => {
    const { feature } = await makeFeature()
    const id = await generateRandomIdentity()
    feature.addIdentity(id)
    const json = await feature.exportIdentity(id.publicKey)
    const parsed = JSON.parse(json) as { version: number; publicKey: string; privateKey: string }
    expect(parsed.version).toBe(1)
    expect(parsed.publicKey).toBe(id.publicKey)
    expect(parsed.privateKey).toBe(id.privateKey)
  })

  it("export -> remove -> import same", async () => {
    const { feature } = await makeFeature()
    const id = await generateRandomIdentity()
    feature.addIdentity(id)
    const json = await feature.exportIdentity(id.publicKey)
    feature.removeIdentity(id.publicKey)
    expect(feature.identities.length).toBe(0)
    const imported = await feature.importIdentityBackup(json)
    expect(imported.publicKey).toBe(id.publicKey)
  })

  it("duplicate backup rejected", async () => {
    const { feature } = await makeFeature()
    const id = await generateRandomIdentity()
    feature.addIdentity(id)
    const json = await feature.exportIdentity(id.publicKey)
    await expect(feature.importIdentityBackup(json)).rejects.toThrow(/already exists/)
    expect(feature.identities.length).toBe(1)
  })

  it("corrupt JSON rejected and storage unchanged", async () => {
    const storage = memoryStorage()
    const { feature } = await makeFeature(storage)
    const id = await generateRandomIdentity()
    feature.addIdentity(id)
    const before = storage.getItem("cumments_identities")
    await expect(feature.importIdentityBackup("not json")).rejects.toThrow()
    expect(storage.getItem("cumments_identities")).toBe(before)
  })

  it("invalid keypair rejected", async () => {
    const { feature } = await makeFeature()
    const bad = JSON.stringify({ version: 1, publicKey: "bad", privateKey: "bad" })
    await expect(feature.importIdentityBackup(bad)).rejects.toThrow()
    expect(feature.identities.length).toBe(0)
  })
})

describe("IdentityFeature - visitorId and fingerprint", () => {
  it("fingerprint is first 8 chars", async () => {
    const { feature } = await makeFeature()
    const id = await generateRandomIdentity()
    expect(feature.fingerprint(id.publicKey)).toBe(id.publicKey.slice(0, 8))
  })

  it("visitorId deterministic via SHA-256", async () => {
    const { feature } = await makeFeature()
    const id = await generateRandomIdentity()
    const v1 = await feature.visitorId(id.publicKey)
    const v2 = await feature.visitorId(id.publicKey)
    expect(v1).toBe(v2)
    expect(v1?.length).toBe(32)
  })

  it("generateRandom adds identity", async () => {
    const { feature } = await makeFeature()
    const id = await feature.generateRandom()
    expect(feature.identities.some((i) => i.publicKey === id.publicKey)).toBe(true)
    expect(feature.active?.publicKey).toBe(id.publicKey)
  })
})

describe("IdentityFeature - subscribe", () => {
  it("subscribe called on changes and unsubscribe works", async () => {
    const { feature } = await makeFeature()
    const cb = vi.fn()
    const unsub = feature.subscribe(cb)
    const id = await generateRandomIdentity()
    feature.addIdentity(id)
    expect(cb).toHaveBeenCalled()
    cb.mockClear()
    unsub()
    const id2 = await generateRandomIdentity()
    feature.addIdentity(id2)
    expect(cb).not.toHaveBeenCalled()
  })

  it("no global registry, multiple subscribers independent", async () => {
    const { feature } = await makeFeature()
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const unsub1 = feature.subscribe(cb1)
    feature.subscribe(cb2)
    const id = await generateRandomIdentity()
    feature.addIdentity(id)
    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)
    unsub1()
    const id2 = await generateRandomIdentity()
    feature.addIdentity(id2)
    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(2)
  })
})
