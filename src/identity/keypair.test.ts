import { describe, expect, it } from "vitest"
import { base64url, base64urlToBytes, generateRandomIdentity, identityMatches } from "./keypair"

describe("keypair", () => {
  it("base64url roundtrip", () => {
    const bytes = new Uint8Array([0, 1, 255, 16, 32])
    expect(base64urlToBytes(base64url(bytes))).toEqual(bytes)
  })

  it("generates and validates identity", async () => {
    const id = await generateRandomIdentity()
    expect(id.publicKey.length).toBeGreaterThan(40)
    expect(id.privateKey.length).toBeGreaterThan(40)
    expect(await identityMatches(id)).toBe(true)
  })

  it("rejects mismatched identity", async () => {
    const a = await generateRandomIdentity()
    const b = await generateRandomIdentity()
    expect(await identityMatches({ publicKey: b.publicKey, privateKey: a.privateKey })).toBe(false)
    expect(await identityMatches({ publicKey: "invalid", privateKey: a.privateKey })).toBe(false)
  })
})
