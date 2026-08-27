import type { Identity } from "../identity/keypair"
import { PowSolver } from "../security/pow"
import { ChallengeManager } from "./challenge"
import { CommentsClient } from "./comments"

export interface CummentsClientOptions {
  endpoint: string
  siteId: string
  pageSlug: string
  identity?: Identity | null
  powSolver?: PowSolver
  challengeManager?: ChallengeManager
}

export class CummentsClient {
  readonly comments: CommentsClient
  readonly challengeManager: ChallengeManager
  readonly powSolver: PowSolver

  constructor(opts: CummentsClientOptions) {
    this.challengeManager = opts.challengeManager ?? new ChallengeManager(opts.endpoint)
    this.powSolver = opts.powSolver ?? new PowSolver()
    this.comments = new CommentsClient({
      endpoint: opts.endpoint,
      siteId: opts.siteId,
      pageSlug: opts.pageSlug,
      identity: opts.identity ?? null,
      challengeManager: this.challengeManager,
      powSolver: this.powSolver,
    })
  }

  setIdentity(identity: Identity | null): void {
    ;(this.comments as unknown as { opts: { identity: Identity | null } }).opts.identity = identity
  }
}
