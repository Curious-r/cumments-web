import { signatureMessage, signMessage } from "../identity/signing"
import { formatChallengeResponse } from "../security/pow"
import type { ClientContext } from "./context"
import { request } from "./transport"

export class ReactionsClient {
  constructor(private readonly ctx: ClientContext) {}

  async add(commentId: string, key: string, signal?: AbortSignal): Promise<void> {
    if (!this.ctx.identity) throw new Error("identity required to react")
    const normalized = key.trim()
    if (!normalized || normalized.length > 32) throw new Error("invalid reaction key")
    const challenge = await this.ctx.challengeManager.get()
    const nonce = await this.ctx.powSolver.solve(challenge.prefix, challenge.difficulty, signal)
    const challengeResponse = formatChallengeResponse(challenge.prefix, nonce)
    const message = signatureMessage([
      "REACT",
      this.ctx.siteId,
      this.ctx.pageSlug,
      commentId,
      normalized,
      challenge.prefix,
    ])
    const signature = await signMessage(this.ctx.identity.privateKey, message)
    await request<void>({
      method: "POST",
      endpoint: this.ctx.endpoint,
      path: `/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/pages/${encodeURIComponent(this.ctx.pageSlug)}/comments/${encodeURIComponent(commentId)}/reactions`,
      body: {
        key: normalized,
        author_public_key: this.ctx.identity.publicKey,
        author_signature: signature,
        challenge_response: challengeResponse,
      },
      signal,
    })
  }

  async remove(commentId: string, key: string, signal?: AbortSignal): Promise<void> {
    if (!this.ctx.identity) throw new Error("identity required to unreact")
    const normalized = key.trim()
    const challenge = await this.ctx.challengeManager.get()
    const nonce = await this.ctx.powSolver.solve(challenge.prefix, challenge.difficulty, signal)
    const challengeResponse = formatChallengeResponse(challenge.prefix, nonce)
    const message = signatureMessage([
      "UNREACT",
      this.ctx.siteId,
      this.ctx.pageSlug,
      commentId,
      normalized,
      challenge.prefix,
    ])
    const signature = await signMessage(this.ctx.identity.privateKey, message)
    await request<void>({
      method: "DELETE",
      endpoint: this.ctx.endpoint,
      path: `/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/pages/${encodeURIComponent(this.ctx.pageSlug)}/comments/${encodeURIComponent(commentId)}/reactions/${encodeURIComponent(normalized)}`,
      body: {
        author_public_key: this.ctx.identity.publicKey,
        author_signature: signature,
        challenge_response: challengeResponse,
      },
      signal,
    })
  }
}
