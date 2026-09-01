import type { Message } from "../api/contract/query"

export interface PendingSubmission {
  submissionId: number | null
  publicKey: string
  content: string
  submittedAt: number
}

export class PendingOperation {
  pending: PendingSubmission | null = null

  setPending(pending: PendingSubmission | null): void {
    this.pending = pending
  }

  clearIfSatisfied(messages: Message[]): void {
    const pending = this.pending
    if (!pending) return
    const found = messages.some((m) => {
      if (pending.submissionId !== null && m.submission_id === pending.submissionId) return true
      if (
        m.author.public_key === pending.publicKey &&
        (m.content as unknown as { body?: string }).body === pending.content
      ) {
        const ts = m.timestamp ? Date.parse(m.timestamp) : Number.NaN
        if (!Number.isNaN(ts) && Math.abs(ts - pending.submittedAt) < 5 * 60 * 1000) return true
      }
      return false
    })
    if (found) this.pending = null
  }
}
