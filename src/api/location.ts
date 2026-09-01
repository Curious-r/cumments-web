import type { ClientContext } from "./context"

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

export class LocationClient {
  constructor(private readonly ctx: ClientContext) {}

  async share(
    geoUri: string,
    options: {
      description?: string | null
      replyTo?: string | null
      threadRoot?: string | null
      displayName?: string
      signal?: AbortSignal
    } = {},
  ): Promise<{ submission_id: number }> {
    if (!geoUri.startsWith("geo:")) throw new Error("geo_uri must start with geo:")
    if (geoUri.length > 512) throw new Error("geo_uri too long")
    const desc = options.description ?? null
    if (desc && desc.length > 500) throw new Error("description too long")
    const signed = await this.ctx.signingPipeline.sign(
      [
        "LOCATE",
        this.ctx.siteId,
        this.ctx.pageSlug,
        geoUri,
        options.replyTo ?? null,
        options.threadRoot ?? null,
      ],
      options.signal,
    )
    const body = {
      geo_uri: geoUri,
      description: desc,
      display_name: options.displayName ?? "Anonymous",
      author_public_key: signed.author_public_key,
      author_signature: signed.author_signature,
      reply_to: options.replyTo ?? null,
      thread_root: options.threadRoot ?? null,
      challenge_response: signed.challenge_response,
    }
    const res = await this.ctx.transport.request<{ submission_id: number }>(
      "POST",
      `/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/pages/${encodeURIComponent(this.ctx.pageSlug)}/location`,
      {
        body,
        idempotencyKey: newIdempotencyKey(),
        signal: options.signal,
      },
    )
    return res.data
  }
}
