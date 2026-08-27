import type { ClientContext } from "./context"
import { signPipeline } from "./pipeline"
import { request } from "./transport"

export class PollsClient {
  constructor(private readonly ctx: ClientContext) {}

  async vote(pollId: string, optionId: string, signal?: AbortSignal): Promise<void> {
    const signed = await signPipeline(
      {
        endpoint: this.ctx.endpoint,
        siteId: this.ctx.siteId,
        pageSlug: this.ctx.pageSlug,
        identity: this.ctx.identity,
        challengeManager: this.ctx.challengeManager,
        powSolver: this.ctx.powSolver,
      },
      ["VOTE", this.ctx.siteId, this.ctx.pageSlug, pollId, optionId],
      signal,
    )
    await request<void>({
      method: "POST",
      endpoint: this.ctx.endpoint,
      path: `/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/pages/${encodeURIComponent(this.ctx.pageSlug)}/polls/${encodeURIComponent(pollId)}/votes`,
      body: {
        option_id: optionId,
        author_public_key: signed.author_public_key,
        author_signature: signed.author_signature,
        challenge_response: signed.challenge_response,
      },
      signal,
    })
  }
}
