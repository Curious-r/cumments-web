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
      JSON.stringify(["POST", "my-blog", "hello", "content", "$p:hs", null, "ch"]),
    )
    expect(postSignatureMessage("my-blog", "hello", "content", null, null, "ch")).toBe(
      JSON.stringify(["POST", "my-blog", "hello", "content", null, null, "ch"]),
    )
    expect(postSignatureMessage("my-blog", "hello", "content", null, "$t:hs", "ch")).toBe(
      JSON.stringify(["POST", "my-blog", "hello", "content", null, "$t:hs", "ch"]),
    )
    // newline is JSON-escaped, not ambiguous
    const withNewline = postSignatureMessage("my-blog", "hello", "a\nb", null, null, "ch")
    expect(withNewline).toContain("\\n")
  })

  it("locateSignatureMessage includes both relations", () => {
    expect(locateSignatureMessage("my-blog", "hello", "geo:1,2", "$p:hs", "$t:hs", "ch")).toBe(
      JSON.stringify(["LOCATE", "my-blog", "hello", "geo:1,2", "$p:hs", "$t:hs", "ch"]),
    )
  })

  it("sign and verify roundtrip", async () => {
    const id = await generateRandomIdentity()
    const msg = signatureMessage(["POST", "my-blog", "hello", "content", null, null, "ch"])
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
