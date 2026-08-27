/**
 * Hand-written SSE contract patch.
 *
 * `api/openapi.yaml` models `text/event-stream` with `itemSchema: CommentSseFrame`
 * and `contentMediaType: application/json` + `contentSchema: oneOf(ProjectorEvent, EphemeralEvent)`.
 * `openapi-typescript` emits `data: string` and `content: unknown`, so the
 * parsed shape is re-typed here.
 */

import type { components } from "./generated"

export type SseEventType = components["schemas"]["CommentSseFrame"]["event"]

export type ProjectorEvent = components["schemas"]["ProjectorEvent"]
export type MessageCreatedEvent = components["schemas"]["MessageCreatedEvent"]
export type MessageUpdatedEvent = components["schemas"]["MessageUpdatedEvent"]
export type MessageAnnotationsChangedEvent = components["schemas"]["MessageAnnotationsChangedEvent"]
export type MessageDeletedEvent = components["schemas"]["MessageDeletedEvent"]
export type PageMessagePayload = components["schemas"]["PageMessagePayload"]

export type EphemeralEvent = components["schemas"]["EphemeralEvent"]
export type EphemeralTypingEvent = components["schemas"]["EphemeralTypingEvent"]
export type EphemeralPresenceEvent = components["schemas"]["EphemeralPresenceEvent"]

export type SseData = ProjectorEvent | EphemeralEvent

export interface SseFrame {
  event: SseEventType
  data: SseData
  id?: string
  retry?: number
}

/**
 * Narrowing helpers — mirrors `discriminator.propertyName: type` in the
 * OpenAPI.
 */
export function isProjectorEvent(data: SseData): data is ProjectorEvent {
  return (
    data.type === "message_created" ||
    data.type === "message_updated" ||
    data.type === "message_annotations_changed" ||
    data.type === "message_deleted"
  )
}

export function isEphemeralEvent(data: SseData): data is EphemeralEvent {
  return !isProjectorEvent(data)
}
