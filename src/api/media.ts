import type { ClientContext } from "./context"

const MEDIA_MAX_BYTES = 20 * 1024 * 1024
const ALLOWED_PREFIXES = ["image/", "video/", "audio/", "application/"]

function isAllowedMime(mime: string): boolean {
  return ALLOWED_PREFIXES.some((p) => mime.startsWith(p))
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes)
  const arr = new Uint8Array(hash)
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

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

export interface MediaUploadResult {
  url: string
  filename: string | null
  mimetype: string | null
  size: number | null
  voice: boolean
}

export class MediaClient {
  constructor(private readonly ctx: ClientContext) {}

  async upload(
    file: File,
    opts: { signal?: AbortSignal; filename?: string; mime?: string } = {},
  ): Promise<MediaUploadResult> {
    const mime = opts.mime ?? file.type ?? "application/octet-stream"
    const filename = opts.filename ?? file.name ?? "file"
    if (!isAllowedMime(mime)) {
      throw new Error(`unsupported upload media type ${mime}`)
    }
    if (filename.length > 255) throw new Error("filename too long")
    if (mime.length > 128) throw new Error("mimetype too long")
    if (file.size > MEDIA_MAX_BYTES) throw new Error("file too large (20MiB limit)")
    const buf = await file.arrayBuffer()
    const hash = await sha256Hex(buf)
    // UPLOAD does NOT use version "1" — signing tuple is ["UPLOAD", siteId, pageSlug, mime, filename, hash]
    const signed = await this.ctx.signingPipeline.sign(
      ["UPLOAD", this.ctx.siteId, this.ctx.pageSlug, mime, filename, hash],
      opts.signal,
    )
    const path = `/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/pages/${encodeURIComponent(this.ctx.pageSlug)}/media?mime=${encodeURIComponent(mime)}&filename=${encodeURIComponent(filename)}&author_public_key=${encodeURIComponent(signed.author_public_key)}&author_signature=${encodeURIComponent(signed.author_signature)}&challenge_response=${encodeURIComponent(signed.challenge_response)}`
    const idempotencyKey = newIdempotencyKey()
    const res = await this.ctx.transport.request<MediaUploadResult>("POST", path, {
      body: buf,
      headers: { "Content-Type": mime },
      idempotencyKey,
      signal: opts.signal,
    })
    const data = res.data
    if (!data.url || !data.url.startsWith("mxc://")) throw new Error("invalid media url")
    return data
  }
}
