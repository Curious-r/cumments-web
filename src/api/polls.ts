import { signatureMessage, signMessage } from "../identity/signing"
import { formatChallengeResponse } from "../security/pow"
import type { ClientContext } from "./context"
import { request } from "./transport"

export class PollsClient {
  constructor(private readonly ctx: ClientContext) {}

  async vote(pollId: string, optionId: string, signal?: AbortSignal): Promise<void> {
    if (!this.ctx.identity) throw new Error("identity required to vote")
    const challenge = await this.ctx.challengeManager.get()
    const nonce = await this.ctx.powSolver.solve(challenge.prefix, challenge.difficulty, signal)
    const challengeResponse = formatChallengeResponse(challenge.prefix, nonce)
    const message = signatureMessage([
      "VOTE",
      this.ctx.siteId,
      this.ctx.pageSlug,
      pollId,
      optionId,
      challenge.prefix,
    ])
    const signature = await signMessage(this.ctx.identity.privateKey, message)
    await request<void>({
      method: "POST",
      endpoint: this.ctx.endpoint,
      path: `/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/pages/${encodeURIComponent(this.ctx.pageSlug)}/polls/${encodeURIComponent(pollId)}/votes`,
      body: {
        option_id: optionId,
        author_public_key: this.ctx.identity.publicKey,
        author_signature: signature,
        challenge_response: challengeResponse,
      },
      signal,
    })
  }
}
