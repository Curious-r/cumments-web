import type { Identity } from "../identity/keypair"
import { signatureMessage, signMessage } from "../identity/signing"
import type { PowSolver } from "../security/pow"
import { formatChallengeResponse } from "../security/pow"
import type { ChallengeManager } from "./challenge"
import { request } from "./transport"

export interface ReactionsClientOptions {
  endpoint: string
  siteId: string
  pageSlug: string
  identity?: Identity | null
  challengeManager: ChallengeManager
  powSolver: PowSolver
}

export class ReactionsClient {
  constructor(private readonly opts: ReactionsClientOptions) {}

  async add(commentId: string, key: string, signal?: AbortSignal): Promise<void> {
    if (!this.opts.identity) throw new Error("identity required to react")
    const normalized = key.trim()
    if (!normalized || normalized.length > 32) throw new Error("invalid reaction key")
    const challenge = await this.opts.challengeManager.get()
    const nonce = await this.opts.powSolver.solve(challenge.prefix, challenge.difficulty, signal)
    const challengeResponse = formatChallengeResponse(challenge.prefix, nonce)
    const message = signatureMessage([
      "REACT",
      this.opts.siteId,
      this.opts.pageSlug,
      commentId,
      normalized,
      challenge.prefix,
    ])
    const signature = await signMessage(this.opts.identity.privateKey, message)
    await request<void>({
      method: "POST",
      endpoint: this.opts.endpoint,
      path: `/api/v1/sites/${encodeURIComponent(this.opts.siteId)}/pages/${encodeURIComponent(this.opts.pageSlug)}/comments/${encodeURIComponent(commentId)}/reactions`,
      body: {
        key: normalized,
        author_public_key: this.opts.identity.publicKey,
        author_signature: signature,
        challenge_response: challengeResponse,
      },
      signal,
    })
  }

  async remove(commentId: string, key: string, signal?: AbortSignal): Promise<void> {
    if (!this.opts.identity) throw new Error("identity required to unreact")
    const normalized = key.trim()
    const challenge = await this.opts.challengeManager.get()
    const nonce = await this.opts.powSolver.solve(challenge.prefix, challenge.difficulty, signal)
    const challengeResponse = formatChallengeResponse(challenge.prefix, nonce)
    const message = signatureMessage([
      "UNREACT",
      this.opts.siteId,
      this.opts.pageSlug,
      commentId,
      normalized,
      challenge.prefix,
    ])
    const signature = await signMessage(this.opts.identity.privateKey, message)
    await request<void>({
      method: "DELETE",
      endpoint: this.opts.endpoint,
      path: `/api/v1/sites/${encodeURIComponent(this.opts.siteId)}/pages/${encodeURIComponent(this.opts.pageSlug)}/comments/${encodeURIComponent(commentId)}/reactions/${encodeURIComponent(normalized)}`,
      body: {
        author_public_key: this.opts.identity.publicKey,
        author_signature: signature,
        challenge_response: challengeResponse,
      },
      signal,
    })
  }
}
