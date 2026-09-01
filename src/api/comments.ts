import type { ClientContext } from "./context"
import type { PaginatedResponse, PaginationQuery } from "./contract/query"

function newIdempotencyKey(): string {
  const c = globalThis.crypto as unknown as Crypto & { randomUUID?: () => string }
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID()
  }
  const b = new Uint8Array(16)
  globalThis.crypto.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export class CommentsClient {
  constructor(private readonly ctx: ClientContext) {}

  private async signWithPipeline(parts: (string | null | undefined)[], signal?: AbortSignal) {
    return this.ctx.signingPipeline.sign(parts, signal)
  }

  async list(pagination: PaginationQuery = {}, signal?: AbortSignal): Promise<PaginatedResponse> {
    const personalization = await this.ctx.signingPipeline.signQuery(
      this.ctx.siteId,
      this.ctx.pageSlug,
    )
    const body: PaginationQuery = { ...pagination }
    if (personalization) {
      body.author_public_key = personalization.author_public_key
      body.author_signature = personalization.author_signature
    }
    const res = await this.ctx.transport.request<PaginatedResponse>(
      "QUERY",
      `/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/pages/${encodeURIComponent(this.ctx.pageSlug)}/comments`,
      {
        body,
        signal,
      },
    )
    return res.data
  }

  async create(
    content: string,
    options: {
      replyTo?: string | null
      threadRoot?: string | null
      displayName?: string
      media?: { url: string; kind?: string } | null
      idempotencyKey?: string
      signal?: AbortSignal
    } = {},
  ): Promise<{ submission_id: number }> {
    const signedContent = options.media?.url ?? content
    const signed = await this.signWithPipeline(
      [
        "POST",
        this.ctx.siteId,
        this.ctx.pageSlug,
        signedContent,
        options.replyTo ?? null,
        options.threadRoot ?? null,
      ],
      options.signal,
    )
    const body = {
      content,
      media: options.media ?? null,
      display_name: options.displayName ?? "Anonymous",
      author_public_key: signed.author_public_key,
      author_signature: signed.author_signature,
      reply_to: options.replyTo ?? null,
      thread_root: options.threadRoot ?? null,
      challenge_response: signed.challenge_response,
    }
    const res = await this.ctx.transport.request<{ submission_id: number }>(
      "POST",
      `/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/pages/${encodeURIComponent(this.ctx.pageSlug)}/comments`,
      {
        body,
        headers: { "Idempotency-Key": options.idempotencyKey ?? newIdempotencyKey() },
        signal: options.signal,
      },
    )
    return res.data
  }

  async update(
    commentId: string,
    content: string,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<{ submission_id: number }> {
    const signed = await this.signWithPipeline(
      ["PATCH", this.ctx.siteId, this.ctx.pageSlug, commentId, content],
      options.signal,
    )
    const body = {
      content,
      author_public_key: signed.author_public_key,
      author_signature: signed.author_signature,
      challenge_response: signed.challenge_response,
    }
    const res = await this.ctx.transport.request<{ submission_id: number }>(
      "PATCH",
      `/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/pages/${encodeURIComponent(this.ctx.pageSlug)}/comments/${encodeURIComponent(commentId)}`,
      {
        body,
        headers: { "Idempotency-Key": options.idempotencyKey ?? newIdempotencyKey() },
        signal: options.signal,
      },
    )
    return res.data
  }

  async remove(
    commentId: string,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<{ submission_id: number }> {
    const signed = await this.signWithPipeline(
      ["DELETE", this.ctx.siteId, this.ctx.pageSlug, commentId],
      options.signal,
    )
    const body = {
      author_public_key: signed.author_public_key,
      author_signature: signed.author_signature,
      challenge_response: signed.challenge_response,
    }
    const res = await this.ctx.transport.request<{ submission_id: number }>(
      "DELETE",
      `/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/pages/${encodeURIComponent(this.ctx.pageSlug)}/comments/${encodeURIComponent(commentId)}`,
      {
        body,
        headers: { "Idempotency-Key": options.idempotencyKey ?? newIdempotencyKey() },
        signal: options.signal,
      },
    )
    return res.data
  }
}
