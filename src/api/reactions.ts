import type { ClientContext } from "./context"
import { signPipeline } from "./pipeline"
import { request } from "./transport"

export class ReactionsClient {
  constructor(private readonly ctx: ClientContext) {}

  private sign(parts: (string | null | undefined)[], signal?: AbortSignal) {
    return signPipeline(
      {
        endpoint: this.ctx.endpoint,
        siteId: this.ctx.siteId,
        pageSlug: this.ctx.pageSlug,
        identity: this.ctx.identity,
        challengeManager: this.ctx.challengeManager,
        powSolver: this.ctx.powSolver,
      },
      parts,
      signal,
    )
  }

  async add(commentId: string, key: string, signal?: AbortSignal): Promise<void> {
    const normalized = key.trim()
    if (!normalized || normalized.length > 32) throw new Error("invalid reaction key")
    const signed = await this.sign(
      ["REACT", this.ctx.siteId, this.ctx.pageSlug, commentId, normalized],
      signal,
    )
    await request<void>({
      method: "POST",
      endpoint: this.ctx.endpoint,
      path: `/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/pages/${encodeURIComponent(this.ctx.pageSlug)}/comments/${encodeURIComponent(commentId)}/reactions`,
      body: {
        key: normalized,
        author_public_key: signed.author_public_key,
        author_signature: signed.author_signature,
        challenge_response: signed.challenge_response,
      },
      signal,
    })
  }

  async remove(commentId: string, key: string, signal?: AbortSignal): Promise<void> {
    const normalized = key.trim()
    const signed = await this.sign(
      ["UNREACT", this.ctx.siteId, this.ctx.pageSlug, commentId, normalized],
      signal,
    )
    await request<void>({
      method: "DELETE",
      endpoint: this.ctx.endpoint,
      path: `/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/pages/${encodeURIComponent(this.ctx.pageSlug)}/comments/${encodeURIComponent(commentId)}/reactions/${encodeURIComponent(normalized)}`,
      body: {
        author_public_key: signed.author_public_key,
        author_signature: signed.author_signature,
        challenge_response: signed.challenge_response,
      },
      signal,
    })
  }
}
