import { describe, expect, it } from "vitest"
import { identityMatches } from "./keypair"
import { generateMnemonic, mnemonicToIdentity, validateMnemonic } from "./mnemonic"
import { signatureMessage, signMessage, verifySignature } from "./signing"

describe("mnemonic", () => {
  it("validates and generates 12-word mnemonic", () => {
    const m = generateMnemonic()
    expect(m.split(" ").length).toBe(12)
    expect(validateMnemonic(m)).toBe(true)
    expect(validateMnemonic("invalid mnemonic words here bad bad bad bad bad bad")).toBe(false)
  })

  it("derivation is deterministic for same mnemonic", async () => {
    const mnemonic =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    const a = await mnemonicToIdentity(mnemonic)
    const b = await mnemonicToIdentity(mnemonic)
    expect(a).toEqual(b)
    expect(await identityMatches(a)).toBe(true)
  })

  it("different mnemonics give different identities", async () => {
    const a = await mnemonicToIdentity(
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
    )
    const b = await mnemonicToIdentity(
      "legal winner thank year wave sausage worth useful legal winner thank yellow",
    )
    expect(a.publicKey).not.toBe(b.publicKey)
  })

  it("derived identity can sign and verify", async () => {
    const mnemonic =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    const id = await mnemonicToIdentity(mnemonic)
    const msg = signatureMessage(["POST", "my-blog", "hello", "content", null, null, "ch"])
    const sig = await signMessage(id.privateKey, msg)
    expect(await verifySignature(id.publicKey, msg, sig)).toBe(true)
  })

  it("normalizes whitespace and case", async () => {
    const base =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    const words = base.split(" ")
    const varied = `  ${words[0].toUpperCase()}  ${words[1].toUpperCase()}   ${words[2]}\n ${words.slice(3).join("  ")}  `
    const a = await mnemonicToIdentity(base)
    const b = await mnemonicToIdentity(varied)
    expect(a).toEqual(b)
  })
})
