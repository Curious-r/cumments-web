import type { Identity } from "../identity/keypair"
import { signatureMessage, signMessage } from "../identity/signing"
import type { PowSolver } from "../security/pow"
import { formatChallengeResponse } from "../security/pow"
import type { ChallengeManager } from "./challenge"
import { request } from "./transport"

export interface PollsClientOptions {
  endpoint: string
  siteId: string
  pageSlug: string
  identity?: Identity | null
  challengeManager: ChallengeManager
  powSolver: PowSolver
}

export class PollsClient {
  constructor(private readonly opts: PollsClientOptions) {}

  async vote(pollId: string, optionId: string, signal?: AbortSignal): Promise<void> {
    if (!this.opts.identity) throw new Error("identity required to vote")
    const challenge = await this.opts.challengeManager.get()
    const nonce = await this.opts.powSolver.solve(challenge.prefix, challenge.difficulty, signal)
    const challengeResponse = formatChallengeResponse(challenge.prefix, nonce)
    const message = signatureMessage([
      "VOTE",
      this.opts.siteId,
      this.opts.pageSlug,
      pollId,
      optionId,
      challenge.prefix,
    ])
    const signature = await signMessage(this.opts.identity.privateKey, message)
    await request<void>({
      method: "POST",
      endpoint: this.opts.endpoint,
      path: `/api/v1/sites/${encodeURIComponent(this.opts.siteId)}/pages/${encodeURIComponent(this.opts.pageSlug)}/polls/${encodeURIComponent(pollId)}/votes`,
      body: {
        option_id: optionId,
        author_public_key: this.opts.identity.publicKey,
        author_signature: signature,
        challenge_response: challengeResponse,
      },
      signal,
    })
  }
}
