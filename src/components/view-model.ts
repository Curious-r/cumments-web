import type { components } from "../api/contract/generated"
import type { Message } from "../api/contract/query"
import { normalizeDisplayName } from "../utils/display-name"

export type Reactor = components["schemas"]["Reactor"]

export interface CommentViewModel {
  message: Message
  isOwn: boolean
  displayName: string
  avatarUrl: string | null
}

export function toViewModel(m: Message, ownPublicKey: string | null): CommentViewModel {
  return {
    message: m,
    isOwn: !!ownPublicKey && m.author.public_key === ownPublicKey,
    displayName: normalizeDisplayName(m.author.display_name),
    avatarUrl: m.author.avatar_url ?? null,
  }
}
