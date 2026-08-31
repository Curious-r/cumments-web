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
      JSON.stringify(["LOCATE", "my-blog", "hello", "geo:1,2", "$p:hs", "$t:hs", "ch", "1"]),
    )
    expect(locateSignatureMessage("my-blog", "hello", "geo:1,2", null, null, "ch")).toBe(
      JSON.stringify(["LOCATE", "my-blog", "hello", "geo:1,2", null, null, "ch", "1"]),
    )
    expect(locateSignatureMessage("my-blog", "hello", "geo:1,2", null, "$t:hs", "ch")).toBe(
      JSON.stringify(["LOCATE", "my-blog", "hello", "geo:1,2", null, "$t:hs", "ch", "1"]),
    )
  })

  it("locateSignatureMessage old 7-tuple is incompatible with new 8-tuple", async () => {
    const oldMsg = JSON.stringify(["LOCATE", "my-blog", "hello", "geo:1,2", null, null, "ch"])
    const newMsg = locateSignatureMessage("my-blog", "hello", "geo:1,2", null, null, "ch")
    expect(newMsg).not.toBe(oldMsg)
    expect(newMsg).toBe(
      JSON.stringify(["LOCATE", "my-blog", "hello", "geo:1,2", null, null, "ch", "1"]),
    )
    const id = await generateRandomIdentity()
    const oldSig = await signMessage(id.privateKey, oldMsg)
    const newSig = await signMessage(id.privateKey, newMsg)
    expect(oldSig).not.toBe(newSig)
    expect(await verifySignature(id.publicKey, oldMsg, oldSig)).toBe(true)
    expect(await verifySignature(id.publicKey, newMsg, newSig)).toBe(true)
    expect(await verifySignature(id.publicKey, oldMsg, newSig)).toBe(false)
    expect(await verifySignature(id.publicKey, newMsg, oldSig)).toBe(false)
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

  it('PATCH/REACT/VOTE include trailing "1" and are incompatible with old 6-tuple', async () => {
    const id = await generateRandomIdentity()
    // PATCH: old 6-tuple vs new 7-tuple with "1"
    const patchOld = JSON.stringify(["PATCH", "my-blog", "hello", "$id", "content", "ch"])
    const patchNew = JSON.stringify(["PATCH", "my-blog", "hello", "$id", "content", "ch", "1"])
    expect(patchOld).not.toBe(patchNew)
    const patchOldSig = await signMessage(id.privateKey, patchOld)
    const patchNewSig = await signMessage(id.privateKey, patchNew)
    expect(patchOldSig).not.toBe(patchNewSig)
    expect(await verifySignature(id.publicKey, patchNew, patchNewSig)).toBe(true)
    expect(await verifySignature(id.publicKey, patchOld, patchNewSig)).toBe(false)

    // REACT
    const reactOld = JSON.stringify(["REACT", "my-blog", "hello", "$id", "👍", "ch"])
    const reactNew = JSON.stringify(["REACT", "my-blog", "hello", "$id", "👍", "ch", "1"])
    const reactOldSig = await signMessage(id.privateKey, reactOld)
    const reactNewSig = await signMessage(id.privateKey, reactNew)
    expect(reactOldSig).not.toBe(reactNewSig)
    expect(await verifySignature(id.publicKey, reactNew, reactNewSig)).toBe(true)
    expect(await verifySignature(id.publicKey, reactOld, reactNewSig)).toBe(false)

    // VOTE
    const voteOld = JSON.stringify(["VOTE", "my-blog", "hello", "poll1", "opt1", "ch"])
    const voteNew = JSON.stringify(["VOTE", "my-blog", "hello", "poll1", "opt1", "ch", "1"])
    const voteOldSig = await signMessage(id.privateKey, voteOld)
    const voteNewSig = await signMessage(id.privateKey, voteNew)
    expect(voteOldSig).not.toBe(voteNewSig)
    expect(await verifySignature(id.publicKey, voteNew, voteNewSig)).toBe(true)
    expect(await verifySignature(id.publicKey, voteOld, voteNewSig)).toBe(false)
  })

  it('DELETE/UNREACT/QUERY remain without trailing "1"', () => {
    // DELETE: 5-tuple, no "1"
    expect(signatureMessage(["DELETE", "my-blog", "hello", "$id", "ch"])).toBe(
      JSON.stringify(["DELETE", "my-blog", "hello", "$id", "ch"]),
    )
    expect(signatureMessage(["DELETE", "my-blog", "hello", "$id", "ch", "1"])).not.toBe(
      JSON.stringify(["DELETE", "my-blog", "hello", "$id", "ch"]),
    )
    // UNREACT: 6-tuple, no "1"
    expect(signatureMessage(["UNREACT", "my-blog", "hello", "$id", "👍", "ch"])).toBe(
      JSON.stringify(["UNREACT", "my-blog", "hello", "$id", "👍", "ch"]),
    )
    // QUERY_COMMENTS: 3-tuple, no challenge, no "1"
    expect(signatureMessage(["QUERY_COMMENTS", "my-blog", "hello"])).toBe(
      JSON.stringify(["QUERY_COMMENTS", "my-blog", "hello"]),
    )
  })
})
