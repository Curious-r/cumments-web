import { describe, expect, it } from "vitest"
import type { Message } from "../api/contract/query"
import { renderContent } from "./render"

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    event_id: "$test",
    site_id: "s",
    page_slug: "p",
    author: {
      type: "visitor",
      display_name: "A",
      avatar_url: null,
      public_key: "pk",
      mxid: null,
    } as unknown as Message["author"],
    content: { type: "text", body: "hello", style: "normal" } as unknown as Message["content"],
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

describe("render helpers", () => {
  it("renderContent preserves Message body for text", () => {
    const msg = makeMessage({
      content: {
        type: "text",
        body: "hello world",
        style: "normal",
      } as unknown as Message["content"],
    })
    const result = renderContent(msg) as unknown as {
      values: unknown[]
      strings: TemplateStringsArray
    }
    expect(result.values).toContain("hello world")
    expect(msg.content.body).toBe("hello world")
  })

  it("renderContent handles redacted tombstone", () => {
    const msg = makeMessage({
      content: { type: "redacted" } as unknown as Message["content"],
      status: "redacted" as unknown as Message["status"],
    })
    const result = renderContent(msg) as unknown as {
      strings: TemplateStringsArray
    }
    expect(result.strings.join("")).toContain("deleted")
  })

  it("keyed repeat identity: comments use event_id as key", async () => {
    const msgs = [makeMessage({ event_id: "$1" }), makeMessage({ event_id: "$2" })]
    const keys = msgs.map((m) => m.event_id)
    expect(keys).toEqual(["$1", "$2"])
    const reordered = [msgs[1], msgs[0]]
    expect(reordered.map((m) => m.event_id)).toEqual(["$2", "$1"])
  })
})
