import { describe, expect, it, vi } from "vitest"
import { generateRandomIdentity } from "../identity/keypair"
import { signatureMessage } from "../identity/signing"
import { PowSolver } from "../security/pow"
import { ChallengeManager } from "./challenge"
import { SigningPipeline } from "./signing-pipeline"

describe("SigningPipeline", () => {
  it("preserves version 1 for POST and challenge_response", async () => {
    const id = await generateRandomIdentity()
    const cm = new ChallengeManager("https://example.com")
    vi.spyOn(cm, "get").mockResolvedValue({ prefix: "pfx.", difficulty: 0 } as never)
    const ps = new PowSolver()
    vi.spyOn(ps, "solve").mockResolvedValue("0")
    const pipeline = new SigningPipeline({
      getIdentity: () => id,
      challengeManager: cm,
      powSolver: ps,
    })
    const signed = await pipeline.sign(["POST", "s", "p", "content", null, null])
    expect(signed.author_public_key).toBe(id.publicKey)
    expect(signed.challenge_response).toBe("pfx.|0")
    // Verify that the signed message includes trailing "1"
    const expectedMsg = signatureMessage(["POST", "s", "p", "content", null, null, "pfx.", "1"])
    // Re-derive signature and compare
    const { signMessage } = await import("../identity/signing")
    const expectedSig = await signMessage(id.privateKey, expectedMsg)
    expect(signed.author_signature).toBe(expectedSig)
  })

  it("UPLOAD does not include version 1", async () => {
    const id = await generateRandomIdentity()
    const cm = new ChallengeManager("https://example.com")
    vi.spyOn(cm, "get").mockResolvedValue({ prefix: "pfx.", difficulty: 0 } as never)
    const ps = new PowSolver()
    vi.spyOn(ps, "solve").mockResolvedValue("0")
    const pipeline = new SigningPipeline({
      getIdentity: () => id,
      challengeManager: cm,
      powSolver: ps,
    })
    const signed = await pipeline.sign(["UPLOAD", "s", "p", "image/png", "a.png", "hash"])
    const expectedMsg = signatureMessage(["UPLOAD", "s", "p", "image/png", "a.png", "hash", "pfx."])
    const { signMessage } = await import("../identity/signing")
    const expectedSig = await signMessage(id.privateKey, expectedMsg)
    expect(signed.author_signature).toBe(expectedSig)
  })

  it("signQuery uses QUERY_COMMENTS without version", async () => {
    const id = await generateRandomIdentity()
    const cm = new ChallengeManager("https://example.com")
    const ps = new PowSolver()
    const pipeline = new SigningPipeline({
      getIdentity: () => id,
      challengeManager: cm,
      powSolver: ps,
    })
    const res = await pipeline.signQuery("s", "p")
    expect(res?.author_public_key).toBe(id.publicKey)
    // Verify signature
    const { verifySignature } = await import("../identity/signing")
    const msg = signatureMessage(["QUERY_COMMENTS", "s", "p"])
    expect(await verifySignature(id.publicKey, msg, res!.author_signature)).toBe(true)
  })
})
