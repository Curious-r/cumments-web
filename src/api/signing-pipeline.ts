import type { Identity } from "../identity/keypair"
import type { PowSolver } from "../security/pow"
import type { ChallengeManager } from "./challenge"
import {
  signPipeline as rawSignPipeline,
  signQueryComments as rawSignQueryComments,
} from "./pipeline"

export interface SigningPipelineOptions {
  getIdentity: () => Identity | null
  challengeManager: ChallengeManager
  powSolver: PowSolver
  // endpoint/siteId/pageSlug are not stored here; they are supplied per-call via context or via parts
  // For signQuery, siteId/pageSlug are passed explicitly
}

export class SigningPipeline {
  constructor(private readonly opts: SigningPipelineOptions) {}

  async sign(
    parts: (string | null | undefined)[],
    signal?: AbortSignal,
  ): Promise<{ author_public_key: string; author_signature: string; challenge_response: string }> {
    // We need endpoint/siteId/pageSlug for PipelineContext, but rawSignPipeline currently requires them.
    // However, signPipeline only uses endpoint for challengeManager.get() which already has endpoint,
    // and siteId/pageSlug are already in parts, so we can supply dummy values for context that are not used beyond challenge.
    // To preserve exact behavior, we supply empty strings for endpoint/siteId/pageSlug in context, but use the real challengeManager/powSolver/identity.
    // The actual signing message is built from parts + challenge, so endpoint/siteId/pageSlug in context are not used for message construction except for challenge fetch (which uses challengeManager's endpoint).
    const identity = this.opts.getIdentity()
    if (!identity) throw new Error("identity required for signing")
    // Use a minimal context; endpoint is not used directly by signPipeline except for challengeManager which we already provide
    return rawSignPipeline(
      {
        endpoint: "", // not used, challengeManager has endpoint
        siteId: "",
        pageSlug: "",
        identity,
        challengeManager: this.opts.challengeManager,
        powSolver: this.opts.powSolver,
      },
      parts,
      signal,
    )
  }

  async signQuery(
    siteId: string,
    pageSlug: string,
  ): Promise<{ author_public_key: string; author_signature: string } | null> {
    const identity = this.opts.getIdentity()
    if (!identity) return null
    return rawSignQueryComments({
      endpoint: "",
      siteId,
      pageSlug,
      identity,
      challengeManager: this.opts.challengeManager,
      powSolver: this.opts.powSolver,
    })
  }

  // Convenience to expose underlying managers for AppRuntime wiring
  get challengeManager(): ChallengeManager {
    return this.opts.challengeManager
  }

  get powSolver(): PowSolver {
    return this.opts.powSolver
  }
}
