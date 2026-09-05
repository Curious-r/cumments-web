/**
 * Semantic thread/reply relation state.
 *
 * The backend contract carries two independent relation fields on messages
 * and creation requests: `thread_root` (Matrix `m.thread`) and `reply_to`
 * (Matrix `m.in_reply_to`). Neither field implies the other; all four
 * combinations are valid:
 *
 * | threadRootId | replyToId | Context                      |
 * | ------------ | --------- | ---------------------------- |
 * | null         | null      | normal message               |
 * | null         | A         | main-feed reply              |
 * | A            | null      | thread-context general reply |
 * | A            | B         | thread-context direct reply  |
 *
 * Matrix wire concerns (`m.thread`, `m.in_reply_to`, `is_falling_back`)
 * stay behind the transport boundary and are not part of this model.
 */

import type { Message } from "./query"

export interface MessageRelations {
  /** Thread scope the message participates in; null when not a Thread member. */
  threadRootId: string | null
  /** Specific message this message directly responds to; null when not a direct reply. */
  replyToId: string | null
}

/**
 * Reads the semantic relation state off a backend `Message` without deriving
 * one relation field from the other.
 */
export function messageRelations(m: Message): MessageRelations {
  return { threadRootId: m.thread_root ?? null, replyToId: m.reply_to ?? null }
}
