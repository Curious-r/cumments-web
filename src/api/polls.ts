import type { ClientContext } from "./context"

export class PollsClient {
  constructor(private readonly ctx: ClientContext) {}

  async vote(pollId: string, optionId: string, signal?: AbortSignal): Promise<void> {
    const signed = await this.ctx.signingPipeline.sign(
      ["VOTE", this.ctx.siteId, this.ctx.pageSlug, pollId, optionId],
      signal,
    )
    await this.ctx.transport.request<void>(
      "POST",
      `/api/v1/sites/${encodeURIComponent(this.ctx.siteId)}/pages/${encodeURIComponent(this.ctx.pageSlug)}/polls/${encodeURIComponent(pollId)}/votes`,
      {
        body: {
          option_id: optionId,
          author_public_key: signed.author_public_key,
          author_signature: signed.author_signature,
          challenge_response: signed.challenge_response,
        },
        signal,
      },
    )
  }
}
