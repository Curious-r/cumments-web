import type { Identity } from "../identity/keypair"
import { signatureMessage, signMessage } from "../identity/signing"
import { formatChallengeResponse, type PowSolver } from "../security/pow"
import type { ChallengeManager } from "./challenge"

export interface PipelineContext {
  endpoint: string
  siteId: string
  pageSlug: string
  identity?: Identity | null
  challengeManager: ChallengeManager
  powSolver: PowSolver
}

export interface SignedRequest {
  author_public_key: string
  author_signature: string
  challenge_response: string
}

/**
 * Execute a signing pipeline: challenge -> PoW -> sign.
 * messageParts are the canonical parts *without* the challenge prefix;
 * the pipeline appends the prefix before signing to avoid duplication.
 */
export async function signPipeline(
  ctx: PipelineContext,
  messageParts: (string | null | undefined)[],
  signal?: AbortSignal,
): Promise<SignedRequest> {
  if (!ctx.identity) throw new Error("identity required for signing")
  const challenge = await ctx.challengeManager.get()
  const nonce = await ctx.powSolver.solve(challenge.prefix, challenge.difficulty, signal)
  const challengeResponse = formatChallengeResponse(challenge.prefix, nonce)
  const needsVersion =
    messageParts[0] === "POST" ||
    messageParts[0] === "LOCATE" ||
    messageParts[0] === "PATCH" ||
    messageParts[0] === "REACT" ||
    messageParts[0] === "VOTE"
  const message = signatureMessage(
    needsVersion ? [...messageParts, challenge.prefix, "1"] : [...messageParts, challenge.prefix],
  )
  const signature = await signMessage(ctx.identity.privateKey, message)
  return {
    author_public_key: ctx.identity.publicKey,
    author_signature: signature,
    challenge_response: challengeResponse,
  }
}

export async function signQueryComments(
  ctx: PipelineContext,
): Promise<{ author_public_key: string; author_signature: string } | null> {
  if (!ctx.identity) return null
  try {
    const message = signatureMessage(["QUERY_COMMENTS", ctx.siteId, ctx.pageSlug])
    const signature = await signMessage(ctx.identity.privateKey, message)
    return { author_public_key: ctx.identity.publicKey, author_signature: signature }
  } catch {
    return null
  }
}
