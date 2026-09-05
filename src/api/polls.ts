import { pollCanonicalPayload } from "../identity/signing"
import type { ClientContext } from "./context"
import type { MessageRelations } from "./contract/relations"

function newIdempotencyKey(): string {
  const c = globalThis.crypto as unknown as Crypto & { randomUUID?: () => string }
  if (c && typeof c.randomUUID === "function") return c.randomUUID()
  const b = new Uint8Array(16)
  globalThis.crypto.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export class PollsClient {
  constructor(private readonly ctx: ClientContext) {}

  async create(
    question: string,
    options: string[],
    opts: {
      displayName?: string
      idempotencyKey?: string
      signal?: AbortSignal
    } & Partial<MessageRelations> = {},
  ): Promise<{ submission_id: number }> {
    const maxSelections = 1
    const canonical = pollCanonicalPayload(question, options, maxSelections)
    const signed = await this.ctx.signingPipeline.sign(
      [
        "POLL",
        this.ctx.siteId,
        this.ctx.pageSlug,
        canonical,
        opts.replyToId ?? null,
        opts.threadRootId ?? null,
      ],
      opts.signal,
    )
    const body = {
      question,
      options,
      max_selections: maxSelections,
      display_name: opts.displayName ?? "Anonymous",
      author_public_key: signed.author_public_key,
      author_signature: signed.author_signature,
      reply_to: opts.replyToId ?? null,
      thread_root: opts.threadRootId ?? null,
      challenge_response: signed.challenge_response,
    }
    const res = await this.ctx.transport.request<{ submission_id: number }>(
      "POST",
      `/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/pages/${encodeURIComponent(this.ctx.pageSlug)}/polls`,
      {
        body,
        idempotencyKey: opts.idempotencyKey ?? newIdempotencyKey(),
        signal: opts.signal,
      },
    )
    return res.data
  }

  async vote(pollId: string, optionId: string, signal?: AbortSignal): Promise<void> {
    const signed = await this.ctx.signingPipeline.sign(
      ["VOTE", this.ctx.siteId, this.ctx.pageSlug, pollId, optionId],
      signal,
    )
    await this.ctx.transport.request<void>(
      "POST",
      `/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/pages/${encodeURIComponent(this.ctx.pageSlug)}/polls/${encodeURIComponent(pollId)}/votes`,
      {
        body: {
          option_id: optionId,
          author_public_key: signed.author_public_key,
          author_signature: signed.author_signature,
          challenge_response: signed.challenge_response,
        },
        signal,
      },
    )
  }
}
