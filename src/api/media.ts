import type { ClientContext } from "./context"
import { signPipeline } from "./pipeline"

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
    // UPLOAD does NOT use version "1"
    const signed = await signPipeline(
      {
        endpoint: this.ctx.endpoint,
        siteId: this.ctx.siteId,
        pageSlug: this.ctx.pageSlug,
        identity: this.ctx.identity,
        challengeManager: this.ctx.challengeManager,
        powSolver: this.ctx.powSolver,
      },
      ["UPLOAD", this.ctx.siteId, this.ctx.pageSlug, mime, filename, hash],
      opts.signal,
    )
    const endpoint = this.ctx.endpoint.replace(/\/$/, "")
    const path = `/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/pages/${encodeURIComponent(this.ctx.pageSlug)}/media`
    const url = `${endpoint}${path}?mime=${encodeURIComponent(mime)}&filename=${encodeURIComponent(filename)}&author_public_key=${encodeURIComponent(signed.author_public_key)}&author_signature=${encodeURIComponent(signed.author_signature)}&challenge_response=${encodeURIComponent(signed.challenge_response)}`
    const idempotencyKey = globalThis.crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Idempotency-Key": idempotencyKey,
        "Content-Type": mime,
      },
      body: buf,
      signal: opts.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      let detail = text
      try {
        const j = JSON.parse(text) as { detail?: string; title?: string }
        detail = j.detail ?? j.title ?? text
      } catch {}
      throw new Error(detail || `upload failed ${res.status}`)
    }
    const data = (await res.json()) as MediaUploadResult
    if (!data.url || !data.url.startsWith("mxc://")) throw new Error("invalid media url")
    return data
  }
}
