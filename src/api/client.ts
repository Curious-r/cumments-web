import type { Identity } from "../identity/keypair"
import type { PowSolver } from "../security/pow"
import type { ChallengeManager } from "./challenge"
import { CommentsClient } from "./comments"
import { ClientContext } from "./context"
import { PollsClient } from "./polls"
import { ReactionsClient } from "./reactions"

export interface CummentsClientOptions {
  endpoint: string
  siteId: string
  pageSlug: string
  identity?: Identity | null
  powSolver?: PowSolver
  challengeManager?: ChallengeManager
}

export class CummentsClient {
  readonly context: ClientContext
  readonly comments: CommentsClient
  readonly reactions: ReactionsClient
  readonly polls: PollsClient

  get challengeManager(): ChallengeManager {
    return this.context.challengeManager
  }

  get powSolver(): PowSolver {
    return this.context.powSolver
  }

  constructor(opts: CummentsClientOptions) {
    this.context = new ClientContext({
      endpoint: opts.endpoint,
      siteId: opts.siteId,
      pageSlug: opts.pageSlug,
      identity: opts.identity ?? null,
      challengeManager: opts.challengeManager,
      powSolver: opts.powSolver,
    })
    this.comments = new CommentsClient(this.context)
    this.reactions = new ReactionsClient(this.context)
    this.polls = new PollsClient(this.context)
  }

  setIdentity(identity: Identity | null): void {
    this.context.setIdentity(identity)
  }
}
