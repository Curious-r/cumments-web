import { describe, expect, it } from "vitest"
import { generateRandomIdentity } from "./keypair"
import {
  locateSignatureMessage,
  postSignatureMessage,
  signatureMessage,
  signMessage,
  verifySignature,
} from "./signing"

describe("signing", () => {
  it("signatureMessage handles null/undefined", () => {
    expect(signatureMessage(["a", null, undefined, "b"])).toBe(
      JSON.stringify(["a", null, null, "b"]),
    )
  })

  it("postSignatureMessage mirrors Rust vectors", () => {
    expect(postSignatureMessage("my-blog", "hello", "content", "$p:hs", null, "ch")).toBe(
      JSON.stringify(["POST", "my-blog", "hello", "content", "$p:hs", null, "ch", "1"]),
    )
    expect(postSignatureMessage("my-blog", "hello", "content", null, null, "ch")).toBe(
      JSON.stringify(["POST", "my-blog", "hello", "content", null, null, "ch", "1"]),
    )
    expect(postSignatureMessage("my-blog", "hello", "content", null, "$t:hs", "ch")).toBe(
      JSON.stringify(["POST", "my-blog", "hello", "content", null, "$t:hs", "ch", "1"]),
    )
    // newline is JSON-escaped, not ambiguous
    const withNewline = postSignatureMessage("my-blog", "hello", "a\nb", null, null, "ch")
    expect(withNewline).toContain("\\n")
    expect(withNewline).toBe(
      JSON.stringify(["POST", "my-blog", "hello", "a\nb", null, null, "ch", "1"]),
    )
  })

  it("postSignatureMessage old 7-tuple is incompatible with new 8-tuple", async () => {
    const oldMsg = JSON.stringify(["POST", "my-blog", "hello", "content", null, null, "ch"])
    const newMsg = postSignatureMessage("my-blog", "hello", "content", null, null, "ch")
    expect(newMsg).not.toBe(oldMsg)
    expect(newMsg).toBe(
      JSON.stringify(["POST", "my-blog", "hello", "content", null, null, "ch", "1"]),
    )
    // Signatures must differ
    const id = await generateRandomIdentity()
    const oldSig = await signMessage(id.privateKey, oldMsg)
    const newSig = await signMessage(id.privateKey, newMsg)
    expect(oldSig).not.toBe(newSig)
    expect(await verifySignature(id.publicKey, oldMsg, oldSig)).toBe(true)
    expect(await verifySignature(id.publicKey, newMsg, newSig)).toBe(true)
    expect(await verifySignature(id.publicKey, oldMsg, newSig)).toBe(false)
    expect(await verifySignature(id.publicKey, newMsg, oldSig)).toBe(false)
  })

  it("locateSignatureMessage includes both relations", () => {
    expect(locateSignatureMessage("my-blog", "hello", "geo:1,2", "$p:hs", "$t:hs", "ch")).toBe(
      JSON.stringify(["LOCATE", "my-blog", "hello", "geo:1,2", "$p:hs", "$t:hs", "ch"]),
    )
  })

  it("sign and verify roundtrip", async () => {
    const id = await generateRandomIdentity()
    const msg = signatureMessage(["POST", "my-blog", "hello", "content", null, null, "ch", "1"])
    const sig = await signMessage(id.privateKey, msg)
    expect(await verifySignature(id.publicKey, msg, sig)).toBe(true)
    expect(await verifySignature(id.publicKey, "tampered", sig)).toBe(false)
  })

  it("wrong key fails verification", async () => {
    const a = await generateRandomIdentity()
    const b = await generateRandomIdentity()
    const msg = "hello"
    const sig = await signMessage(a.privateKey, msg)
    expect(await verifySignature(b.publicKey, msg, sig)).toBe(false)
  })
})
