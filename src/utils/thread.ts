import type { Message } from "../api/contract/query"

/**
 * Canonical Thread root for a message.
 *
 * Matrix thread identity is explicit: a message either is a Thread root (no
 * `thread_root` of its own) or belongs to the Thread named by `thread_root`.
 * `reply_to` is the direct parent and is orthogonal — it must never be walked
 * to derive Thread identity.
 */
export function getThreadRootId(message: Message): string {
  return message.thread_root ?? message.event_id
}

/**
 * Whether a message belongs to the main timeline.
 *
 * The backend's main page query currently returns Thread members alongside
 * roots, so the frontend applies this presentation-level filter when building
 * the main feed. Thread members stay in the shared `EntityCache` and are
 * materialized by `ThreadFeature`; this predicate only decides whether they
 * appear as ordinary main-feed comments.
 *
 * When the backend exposes a main-timeline-only query this filter becomes
 * redundant and can be removed without touching ThreadFeature.
 */
export function isMainTimelineMessage(message: Message): boolean {
  return message.thread_root == null
}
