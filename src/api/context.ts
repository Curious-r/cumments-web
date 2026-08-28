import type { Identity } from "../identity/keypair"
import { PowSolver } from "../security/pow"
import { ChallengeManager } from "./challenge"

export class ClientContext {
  endpoint: string
  siteId: string
  pageSlug: string
  identity: Identity | null
  challengeManager: ChallengeManager
  powSolver: PowSolver

  constructor(opts: {
    endpoint: string
    siteId: string
    pageSlug: string
    identity?: Identity | null
    challengeManager?: ChallengeManager
    powSolver?: PowSolver
  }) {
    this.endpoint = opts.endpoint
    this.siteId = opts.siteId
    this.pageSlug = opts.pageSlug
    this.identity = opts.identity ?? null
    this.challengeManager = opts.challengeManager ?? new ChallengeManager(opts.endpoint)
    this.powSolver = opts.powSolver ?? new PowSolver()
  }

  setIdentity(identity: Identity | null): void {
    this.identity = identity
  }

  updateEndpoint(endpoint: string): void {
    this.endpoint = endpoint
    this.challengeManager.setEndpoint(endpoint)
  }
}
