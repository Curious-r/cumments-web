import type { ClientContext } from "./context"

export class ReactionsClient {
  constructor(private readonly ctx: ClientContext) {}

  private sign(parts: (string | null | undefined)[], signal?: AbortSignal) {
    return this.ctx.signingPipeline.sign(parts, signal)
  }

  async add(commentId: string, key: string, signal?: AbortSignal): Promise<void> {
    const normalized = key.trim()
    if (!normalized || normalized.length > 32) throw new Error("invalid reaction key")
    const signed = await this.sign(
      ["REACT", this.ctx.siteId, this.ctx.pageSlug, commentId, normalized],
      signal,
    )
    await this.ctx.transport.request<void>(
      "POST",
      `/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/pages/${encodeURIComponent(this.ctx.pageSlug)}/comments/${encodeURIComponent(commentId)}/reactions`,
      {
        body: {
          key: normalized,
          author_public_key: signed.author_public_key,
          author_signature: signed.author_signature,
          challenge_response: signed.challenge_response,
        },
        signal,
      },
    )
  }

  async remove(commentId: string, key: string, signal?: AbortSignal): Promise<void> {
    const normalized = key.trim()
    const signed = await this.sign(
      ["UNREACT", this.ctx.siteId, this.ctx.pageSlug, commentId, normalized],
      signal,
    )
    await this.ctx.transport.request<void>(
      "DELETE",
      `/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/pages/${encodeURIComponent(this.ctx.pageSlug)}/comments/${encodeURIComponent(commentId)}/reactions/${encodeURIComponent(normalized)}`,
      {
        body: {
          author_public_key: signed.author_public_key,
          author_signature: signed.author_signature,
          challenge_response: signed.challenge_response,
        },
        signal,
      },
    )
  }
}
