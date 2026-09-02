import type { Identity } from "../identity/keypair"
import { signatureMessage, signMessage } from "../identity/signing"
import { formatChallengeResponse, type PowSolver } from "../security/pow"
import type { ChallengeManager } from "./challenge"

export interface SigningPipelineOptions {
  getIdentity: () => Identity | null
  challengeManager: ChallengeManager
  powSolver: PowSolver
}

export class SigningPipeline {
  constructor(private readonly opts: SigningPipelineOptions) {}

  async sign(
    parts: (string | null | undefined)[],
    signal?: AbortSignal,
  ): Promise<{ author_public_key: string; author_signature: string; challenge_response: string }> {
    const identity = this.opts.getIdentity()
    if (!identity) throw new Error("identity required for signing")
    const challenge = await this.opts.challengeManager.get()
    const nonce = await this.opts.powSolver.solve(challenge.prefix, challenge.difficulty, signal)
    const challengeResponse = formatChallengeResponse(challenge.prefix, nonce)
    const needsVersion =
      parts[0] === "POST" ||
      parts[0] === "LOCATE" ||
      parts[0] === "PATCH" ||
      parts[0] === "REACT" ||
      parts[0] === "VOTE" ||
      parts[0] === "POLL"
    const message = signatureMessage(
      needsVersion ? [...parts, challenge.prefix, "1"] : [...parts, challenge.prefix],
    )
    const signature = await signMessage(identity.privateKey, message)
    return {
      author_public_key: identity.publicKey,
      author_signature: signature,
      challenge_response: challengeResponse,
    }
  }

  async signQuery(
    siteId: string,
    pageSlug: string,
  ): Promise<{ author_public_key: string; author_signature: string } | null> {
    const identity = this.opts.getIdentity()
    if (!identity) return null
    try {
      const message = signatureMessage(["QUERY_COMMENTS", siteId, pageSlug])
      const signature = await signMessage(identity.privateKey, message)
      return { author_public_key: identity.publicKey, author_signature: signature }
    } catch {
      return null
    }
  }

  get challengeManager(): ChallengeManager {
    return this.opts.challengeManager
  }

  get powSolver(): PowSolver {
    return this.opts.powSolver
  }
}
