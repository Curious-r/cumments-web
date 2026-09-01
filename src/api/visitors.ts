import type { ClientContext } from "./context"
import { signPipeline } from "./pipeline"

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

export class VisitorsClient {
  constructor(private readonly ctx: ClientContext) {}

  async getProfile(publicKey: string, signal?: AbortSignal): Promise<VisitorProfile> {
    const base = this.ctx.endpoint.replace(/\/$/, "")
    const url = `${base}/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/visitors/profile?author_public_key=${encodeURIComponent(publicKey)}`
    const res = await fetch(url, { signal })
    if (!res.ok) {
      if (res.status === 404) return { visitor_id: "", display_name: null, avatar_url: null }
      throw new Error(`getProfile failed ${res.status}`)
    }
    const data = (await res.json()) as VisitorProfile
    return data
  }

  async setAvatar(file: File, signal?: AbortSignal): Promise<{ avatar_url: string }> {
    const mime = file.type || "application/octet-stream"
    if (!mime.startsWith("image/")) throw new Error("avatar must be image/*")
    if (file.size > 20 * 1024 * 1024) throw new Error("avatar too large")
    const buf = await file.arrayBuffer()
    const hash = await sha256Hex(buf)
    const signed = await signPipeline(
      {
        endpoint: this.ctx.endpoint,
        siteId: this.ctx.siteId,
        pageSlug: this.ctx.pageSlug,
        identity: this.ctx.identity,
        challengeManager: this.ctx.challengeManager,
        powSolver: this.ctx.powSolver,
      },
      ["UPLOAD_AVATAR", this.ctx.siteId, mime, hash],
      signal,
    )
    const base = this.ctx.endpoint.replace(/\/$/, "")
    const path = `/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/visitors/avatar`
    const url = `${base}${path}?mime=${encodeURIComponent(mime)}&filename=${encodeURIComponent(file.name)}&author_public_key=${encodeURIComponent(signed.author_public_key)}&author_signature=${encodeURIComponent(signed.author_signature)}&challenge_response=${encodeURIComponent(signed.challenge_response)}`
    const idempotencyKey = globalThis.crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Idempotency-Key": idempotencyKey,
        "Content-Type": mime,
      },
      body: buf,
      signal,
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => "")
      throw new Error(txt || `setAvatar failed ${res.status}`)
    }
    const data = (await res.json()) as { avatar_url: string }
    return data
  }

  async deleteAvatar(signal?: AbortSignal): Promise<void> {
    const signed = await signPipeline(
      {
        endpoint: this.ctx.endpoint,
        siteId: this.ctx.siteId,
        pageSlug: this.ctx.pageSlug,
        identity: this.ctx.identity,
        challengeManager: this.ctx.challengeManager,
        powSolver: this.ctx.powSolver,
      },
      ["DELETE_AVATAR", this.ctx.siteId],
      signal,
    )
    const base = this.ctx.endpoint.replace(/\/$/, "")
    const path = `/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/visitors/avatar`
    const url = `${base}${path}?author_public_key=${encodeURIComponent(signed.author_public_key)}&author_signature=${encodeURIComponent(signed.author_signature)}&challenge_response=${encodeURIComponent(signed.challenge_response)}`
    const res = await fetch(url, { method: "DELETE", signal })
    if (!res.ok && res.status !== 404) {
      const txt = await res.text().catch(() => "")
      throw new Error(txt || `deleteAvatar failed ${res.status}`)
    }
  }
}
