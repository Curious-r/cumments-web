import { describe, expect, it } from "vitest"
import type { Message } from "../api/contract/query"
import { EntityCache } from "./entity-cache"

function msg(id: string, overrides: Partial<Message> = {}): Message {
  return {
    event_id: id,
    site_id: "s",
    page_slug: "p",
    author: {
      type: "visitor",
      display_name: "A",
      avatar_url: null,
      public_key: "pk",
      mxid: null,
    } as unknown as Message["author"],
    content: { type: "text", body: "hello" } as unknown as Message["content"],
    timestamp: new Date().toISOString(),
    edited_at: null,
    reply_to: null,
    thread_root: null,
    submission_id: null,
    status: "active",
    redacted_at: null,
    redacted_by: null,
    reactions: [],
    ...overrides,
  } as Message
}

describe("EntityCache", () => {
  it("get/set", () => {
    const cache = new EntityCache()
    const m = msg("$1")
    cache.set(m.event_id, m)
    expect(cache.get("$1")?.event_id).toBe("$1")
    expect(cache.get("$missing")).toBeUndefined()
  })

  it("setBatch", () => {
    const cache = new EntityCache()
    cache.setBatch([msg("$1"), msg("$2")])
    expect(cache.get("$1")).toBeDefined()
    expect(cache.get("$2")).toBeDefined()
    expect(cache.size).toBe(2)
  })

  it("tombstone retained", () => {
    const cache = new EntityCache()
    const m = msg("$1")
    cache.set(m.event_id, m)
    const tombstone = {
      ...m,
      content: { type: "redacted" } as unknown as Message["content"],
      status: "redacted" as const,
      redacted_at: new Date().toISOString(),
    } as Message
    cache.set(tombstone.event_id, tombstone)
    expect(cache.get("$1")?.status).toBe("redacted")
  })

  it("has and clear", () => {
    const cache = new EntityCache()
    cache.set("$1", msg("$1"))
    expect(cache.has("$1")).toBe(true)
    cache.clear()
    expect(cache.has("$1")).toBe(false)
    expect(cache.size).toBe(0)
  })
})
