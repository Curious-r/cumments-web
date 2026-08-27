import type { Message } from "../api/contract/query"

export interface CommentViewModel {
  eventId: string
  displayName: string
  timestamp: string
  body: string
  replyTo: string | null
  reactions: Array<{ key: string; count: number; mine: boolean }>
  isOwn: boolean
}

export function toViewModel(m: Message, ownPublicKey: string | null): CommentViewModel {
  const author = m.author as unknown as { display_name?: string | null; public_key?: string | null }
  const content = m.content as unknown as { body?: string | null }
  return {
    eventId: m.event_id,
    displayName: author?.display_name ?? "Anonymous",
    timestamp: m.timestamp,
    body: content?.body ?? "",
    replyTo: m.reply_to ?? null,
    reactions: (m.reactions ?? []).map((r) => ({ key: r.key, count: r.count, mine: !!r.mine })),
    isOwn: !!ownPublicKey && author?.public_key === ownPublicKey,
  }
}
