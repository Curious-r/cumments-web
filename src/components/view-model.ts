import type { components } from "../api/contract/generated"
import type { Message } from "../api/contract/query"

export type Reactor = components["schemas"]["Reactor"]

export interface CommentViewModel {
  eventId: string
  displayName: string
  timestamp: string
  body: string
  replyTo: string | null
  reactions: Array<{ key: string; count: number; mine: boolean; reactors: Reactor[] }>
  isOwn: boolean
}

export function toViewModel(m: Message, ownPublicKey: string | null): CommentViewModel {
  return {
    eventId: m.event_id,
    displayName: m.author.display_name ?? "Anonymous",
    timestamp: m.timestamp,
    body: m.content.body ?? "",
    replyTo: m.reply_to ?? null,
    reactions: (m.reactions ?? []).map((r) => ({
      key: r.key,
      count: r.count,
      mine: !!r.mine,
      reactors: r.reactors,
    })),
    isOwn: !!ownPublicKey && m.author.public_key === ownPublicKey,
  }
}
