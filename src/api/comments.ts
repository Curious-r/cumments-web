import type { Identity } from "../identity/keypair"
import { postSignatureMessage, signatureMessage, signMessage } from "../identity/signing"
import type { PowSolver } from "../security/pow"
import { formatChallengeResponse } from "../security/pow"
import type { ChallengeManager } from "./challenge"
import type { PaginatedResponse, PaginationQuery } from "./contract/query"
import { signQueryComments } from "./pipeline"
import { request, query as transportQuery } from "./transport"

export interface CommentsClientOptions {
  endpoint: string
  siteId: string
  pageSlug: string
  identity?: Identity | null
  challengeManager: ChallengeManager
  powSolver: PowSolver
}

function newIdempotencyKey(): string {
  const c = globalThis.crypto as unknown as Crypto & { randomUUID?: () => string }
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID()
  }
  // fallback
  const b = new Uint8Array(16)
  globalThis.crypto.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export class CommentsClient {
  constructor(private readonly opts: CommentsClientOptions) {}

  async list(pagination: PaginationQuery = {}, signal?: AbortSignal): Promise<PaginatedResponse> {
    const personalization = await signQueryComments({
      endpoint: this.opts.endpoint,
      siteId: this.opts.siteId,
      pageSlug: this.opts.pageSlug,
      identity: this.opts.identity ?? null,
      challengeManager: this.opts.challengeManager,
      powSolver: this.opts.powSolver,
    })
    const body: PaginationQuery = { ...pagination }
    if (personalization) {
      body.author_public_key = personalization.author_public_key
      body.author_signature = personalization.author_signature
    }
    const res = await transportQuery<PaginatedResponse, PaginationQuery>(
      this.opts.endpoint,
      `/api/v1/sites/${encodeURIComponent(this.opts.siteId)}/pages/${encodeURIComponent(this.opts.pageSlug)}/comments`,
      body,
      undefined,
      signal,
    )
    return res.data
  }

  async create(
    content: string,
    options: {
      replyTo?: string | null
      threadRoot?: string | null
      displayName?: string
      media?: { url: string } | null
      idempotencyKey?: string
      signal?: AbortSignal
    } = {},
  ): Promise<{ submission_id: number }> {
    if (!this.opts.identity) throw new Error("identity required to create comment")
    const challenge = await this.opts.challengeManager.get()
    const nonce = await this.opts.powSolver.solve(
      challenge.prefix,
      challenge.difficulty,
      options.signal,
    )
    const challengeResponse = formatChallengeResponse(challenge.prefix, nonce)
    const signedContent = options.media?.url ?? content
    const message = postSignatureMessage(
      this.opts.siteId,
      this.opts.pageSlug,
      signedContent,
      options.replyTo ?? null,
      options.threadRoot ?? null,
      challenge.prefix,
    )
    const signature = await signMessage(this.opts.identity.privateKey, message)
    const body = {
      content,
      media: options.media ?? null,
      display_name: options.displayName ?? "Anonymous",
      author_public_key: this.opts.identity.publicKey,
      author_signature: signature,
      reply_to: options.replyTo ?? null,
      thread_root: options.threadRoot ?? null,
      challenge_response: challengeResponse,
    }
    const res = await request<{ submission_id: number }>({
      method: "POST",
      endpoint: this.opts.endpoint,
      path: `/api/v1/sites/${encodeURIComponent(this.opts.siteId)}/pages/${encodeURIComponent(this.opts.pageSlug)}/comments`,
      body,
      headers: { "Idempotency-Key": options.idempotencyKey ?? newIdempotencyKey() },
      signal: options.signal,
    })
    return res.data
  }

  async update(
    commentId: string,
    content: string,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<{ submission_id: number }> {
    if (!this.opts.identity) throw new Error("identity required to update comment")
    const challenge = await this.opts.challengeManager.get()
    const nonce = await this.opts.powSolver.solve(
      challenge.prefix,
      challenge.difficulty,
      options.signal,
    )
    const challengeResponse = formatChallengeResponse(challenge.prefix, nonce)
    const message = signatureMessage([
      "PATCH",
      this.opts.siteId,
      this.opts.pageSlug,
      commentId,
      content,
      challenge.prefix,
    ])
    const signature = await signMessage(this.opts.identity.privateKey, message)
    const body = {
      content,
      author_public_key: this.opts.identity.publicKey,
      author_signature: signature,
      challenge_response: challengeResponse,
    }
    const res = await request<{ submission_id: number }>({
      method: "PATCH",
      endpoint: this.opts.endpoint,
      path: `/api/v1/sites/${encodeURIComponent(this.opts.siteId)}/pages/${encodeURIComponent(this.opts.pageSlug)}/comments/${encodeURIComponent(commentId)}`,
      body,
      headers: { "Idempotency-Key": options.idempotencyKey ?? newIdempotencyKey() },
      signal: options.signal,
    })
    return res.data
  }

  async remove(
    commentId: string,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<{ submission_id: number }> {
    if (!this.opts.identity) throw new Error("identity required to delete comment")
    const challenge = await this.opts.challengeManager.get()
    const nonce = await this.opts.powSolver.solve(
      challenge.prefix,
      challenge.difficulty,
      options.signal,
    )
    const challengeResponse = formatChallengeResponse(challenge.prefix, nonce)
    const message = signatureMessage([
      "DELETE",
      this.opts.siteId,
      this.opts.pageSlug,
      commentId,
      challenge.prefix,
    ])
    const signature = await signMessage(this.opts.identity.privateKey, message)
    const body = {
      author_public_key: this.opts.identity.publicKey,
      author_signature: signature,
      challenge_response: challengeResponse,
    }
    const res = await request<{ submission_id: number }>({
      method: "DELETE",
      endpoint: this.opts.endpoint,
      path: `/api/v1/sites/${encodeURIComponent(this.opts.siteId)}/pages/${encodeURIComponent(this.opts.pageSlug)}/comments/${encodeURIComponent(commentId)}`,
      body,
      headers: { "Idempotency-Key": options.idempotencyKey ?? newIdempotencyKey() },
      signal: options.signal,
    })
    return res.data
  }
}
