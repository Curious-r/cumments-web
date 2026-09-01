import type { ClientContext } from "./context"
import { CummentsError } from "./errors"

export interface VisitorProfile {
  visitor_id: string
  display_name: string | null
  avatar_url: string | null
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

export class VisitorsClient {
  constructor(private readonly ctx: ClientContext) {}

  async getProfile(publicKey: string, signal?: AbortSignal): Promise<VisitorProfile> {
    const path = `/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/visitors/profile?author_public_key=${encodeURIComponent(publicKey)}`
    try {
      const res = await this.ctx.transport.request<VisitorProfile>("GET", path, {
        signal,
      })
      return res.data
    } catch (e) {
      if (e instanceof CummentsError && e.status === 404) {
        return { visitor_id: "", display_name: null, avatar_url: null }
      }
      // Fallback for generic 404 without CummentsError shape (e.g., mocked fetch returning plain 404)
      if (e instanceof Error && e.message.includes("404")) {
        // Check if it's a 404 from HttpTransport that didn't produce CummentsError
        // We treat any 404 as not found for profile
        const maybe404 = e as CummentsError
        if (maybe404.status === 404) return { visitor_id: "", display_name: null, avatar_url: null }
      }
      // Re-throw as is; callers expect Error with status
      if (e instanceof CummentsError && e.status === 404) {
        return { visitor_id: "", display_name: null, avatar_url: null }
      }
      // For direct 404 without CummentsError, check if e is CummentsError-like
      throw e
    }
  }

  async setAvatar(file: File, signal?: AbortSignal): Promise<{ avatar_url: string }> {
    const mime = file.type || "application/octet-stream"
    if (!mime.startsWith("image/")) throw new Error("avatar must be image/*")
    if (file.size > 20 * 1024 * 1024) throw new Error("avatar too large")
    const buf = await file.arrayBuffer()
    const hash = await sha256Hex(buf)
    const signed = await this.ctx.signingPipeline.sign(
      ["UPLOAD_AVATAR", this.ctx.siteId, mime, hash],
      signal,
    )
    const path = `/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/visitors/avatar?mime=${encodeURIComponent(mime)}&filename=${encodeURIComponent(file.name)}&author_public_key=${encodeURIComponent(signed.author_public_key)}&author_signature=${encodeURIComponent(signed.author_signature)}&challenge_response=${encodeURIComponent(signed.challenge_response)}`
    const idempotencyKey = newIdempotencyKey()
    const res = await this.ctx.transport.request<{ avatar_url: string }>("PUT", path, {
      body: buf,
      headers: { "Content-Type": mime },
      idempotencyKey,
      signal,
    })
    return res.data
  }

  async deleteAvatar(signal?: AbortSignal): Promise<void> {
    const signed = await this.ctx.signingPipeline.sign(["DELETE_AVATAR", this.ctx.siteId], signal)
    const path = `/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/visitors/avatar?author_public_key=${encodeURIComponent(signed.author_public_key)}&author_signature=${encodeURIComponent(signed.author_signature)}&challenge_response=${encodeURIComponent(signed.challenge_response)}`
    try {
      await this.ctx.transport.request<void>("DELETE", path, {
        signal,
      })
    } catch (e) {
      if (e instanceof CummentsError && e.status === 404) {
        return
      }
      throw e
    }
  }
}
