import type { Identity } from "../identity/keypair"
import { PowSolver } from "../security/pow"
import { ChallengeManager } from "./challenge"
import { SigningPipeline } from "./signing-pipeline"
import { HttpTransport } from "./transport"

export class ClientContext {
  endpoint: string
  siteId: string
  pageSlug: string
  identity: Identity | null
  challengeManager: ChallengeManager
  powSolver: PowSolver
  transport: HttpTransport
  signingPipeline: SigningPipeline

  constructor(opts: {
    endpoint: string
    siteId: string
    pageSlug: string
    identity?: Identity | null
    challengeManager?: ChallengeManager
    powSolver?: PowSolver
    transport?: HttpTransport
    signingPipeline?: SigningPipeline
  }) {
    this.endpoint = opts.endpoint
    this.siteId = opts.siteId
    this.pageSlug = opts.pageSlug
    this.identity = opts.identity ?? null
    this.challengeManager = opts.challengeManager ?? new ChallengeManager(opts.endpoint)
    this.powSolver = opts.powSolver ?? new PowSolver()
    this.transport = opts.transport ?? new HttpTransport(opts.endpoint)
    this.signingPipeline =
      opts.signingPipeline ??
      new SigningPipeline({
        getIdentity: () => this.identity,
        challengeManager: this.challengeManager,
        powSolver: this.powSolver,
      })
  }

  setIdentity(identity: Identity | null): void {
    this.identity = identity
  }

  updateEndpoint(endpoint: string): void {
    this.endpoint = endpoint
    this.challengeManager.setEndpoint(endpoint)
    this.transport.setEndpoint(endpoint)
  }
}
