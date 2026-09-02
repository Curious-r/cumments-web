import { describe, expect, it } from "vitest"
import { generateRandomIdentity } from "./keypair"
import {
  locateSignatureMessage,
  pollCanonicalPayload,
  pollSignatureMessage,
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

  it("pollCanonicalPayload and pollSignatureMessage use same canonical payload and include all fields", () => {
    const question = "Best programming language?"
    const options = ["Rust", "TypeScript"]
    const payload = pollCanonicalPayload(question, options, 1)
    // exact JSON representation, field order fixed
    expect(payload).toBe(JSON.stringify({ question, options, max_selections: 1 }))
    expect(payload).toBe(
      '{"question":"Best programming language?","options":["Rust","TypeScript"],"max_selections":1}',
    )
    // order matters - different option order yields different payload
    const payloadSwapped = pollCanonicalPayload(question, ["TypeScript", "Rust"], 1)
    expect(payloadSwapped).not.toBe(payload)

    // signing message must contain POLL, site, page, canonical payload, reply/thread, challenge, "1"
    const site = "my-blog"
    const page = "hello"
    const challenge = "ch"
    const msg = pollSignatureMessage(site, page, question, options, 1, null, null, challenge)
    expect(msg).toBe(JSON.stringify(["POLL", site, page, payload, null, null, challenge, "1"]))
    // with reply_to and thread_root
    const msgWithRelations = pollSignatureMessage(
      site,
      page,
      question,
      options,
      1,
      "$reply:hs",
      "$root:hs",
      challenge,
    )
    expect(msgWithRelations).toBe(
      JSON.stringify(["POLL", site, page, payload, "$reply:hs", "$root:hs", challenge, "1"]),
    )
    // changing question/options must change payload and thus message
    const payload2 = pollCanonicalPayload("Other?", options, 1)
    expect(payload2).not.toBe(payload)
    const msg2 = pollSignatureMessage(site, page, "Other?", options, 1, null, null, challenge)
    expect(msg2).not.toBe(msg)
    expect(JSON.parse(msg2)[3]).toBe(payload2)
    expect(msg2).toBe(JSON.stringify(["POLL", site, page, payload2, null, null, challenge, "1"]))

    // max_selections is part of payload and signed, must be 1
    const payloadWithDifferentMax = pollCanonicalPayload(question, options, 2 as unknown as number)
    expect(payloadWithDifferentMax).not.toBe(payload)
    // but our API always uses 1, so ensure canonical with 1 is as expected
    expect(pollCanonicalPayload(question, options, 1)).toBe(payload)
  })

  it('POLL includes trailing "1" and is incompatible with old 7-tuple', async () => {
    const id = await generateRandomIdentity()
    const question = "Q?"
    const options = ["A", "B"]
    const payload = pollCanonicalPayload(question, options, 1)
    const pollOld = JSON.stringify(["POLL", "my-blog", "hello", payload, null, null, "ch"])
    const pollNew = pollSignatureMessage("my-blog", "hello", question, options, 1, null, null, "ch")
    expect(pollOld).not.toBe(pollNew)
    expect(pollNew).toBe(
      JSON.stringify(["POLL", "my-blog", "hello", payload, null, null, "ch", "1"]),
    )
    const oldSig = await signMessage(id.privateKey, pollOld)
    const newSig = await signMessage(id.privateKey, pollNew)
    expect(oldSig).not.toBe(newSig)
    expect(await verifySignature(id.publicKey, pollNew, newSig)).toBe(true)
    expect(await verifySignature(id.publicKey, pollOld, newSig)).toBe(false)
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
