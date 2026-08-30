import { describe, expect, it } from "vitest"
import type { Message } from "../api/contract/query"
import { toViewModel } from "./view-model"

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    event_id: "$test",
    site_id: "s",
    page_slug: "p",
    author: {
      type: "visitor",
      display_name: "Author",
      avatar_url: null,
      public_key: "pk_author",
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

describe("toViewModel preserves reactors", () => {
  it("retains reactor display_name and avatar_url", () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 3,
          mine: true,
          reactors: [
            { display_name: "Alice", avatar_url: "https://example.com/avatar.png" },
            { display_name: null, avatar_url: null },
          ],
        } as unknown as Message["reactions"][number],
      ],
    })
    const vm = toViewModel(msg, "pk_other")
    expect(vm.reactions).toHaveLength(1)
    expect(vm.reactions[0].key).toBe("👍")
    expect(vm.reactions[0].count).toBe(3)
    expect(vm.reactions[0].mine).toBe(true)
    expect(vm.reactions[0].reactors).toEqual([
      { display_name: "Alice", avatar_url: "https://example.com/avatar.png" },
      { display_name: null, avatar_url: null },
    ])
  })

  it("retains empty reactors array", () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "❤️",
          count: 1,
          mine: false,
          reactors: [],
        } as unknown as Message["reactions"][number],
      ],
    })
    const vm = toViewModel(msg, null)
    expect(vm.reactions[0].reactors).toEqual([])
  })

  it("does not drop mine or count when reactors present", () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "😂",
          count: 2,
          mine: false,
          reactors: [{ display_name: "Bob", avatar_url: null }],
        } as unknown as Message["reactions"][number],
        {
          key: "👍",
          count: 1,
          mine: true,
          reactors: [{ display_name: "Alice", avatar_url: null }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const vm = toViewModel(msg, "pk_author")
    expect(vm.reactions).toHaveLength(2)
    expect(vm.reactions[0].mine).toBe(false)
    expect(vm.reactions[1].mine).toBe(true)
    expect(vm.reactions[1].reactors[0].display_name).toBe("Alice")
  })

  it("preserves reactors through view-model without exposing physical IDs", () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [{ display_name: "Alice", avatar_url: "mxc://example.com/abc" }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const vm = toViewModel(msg, null)
    const reactor = vm.reactions[0].reactors[0] as Record<string, unknown>
    // Must only expose display_name and avatar_url, no mxid/public_key/event_id
    expect(Object.keys(reactor).sort()).toEqual(["avatar_url", "display_name"])
    expect(reactor).not.toHaveProperty("mxid")
    expect(reactor).not.toHaveProperty("public_key")
    expect(reactor).not.toHaveProperty("event_id")
  })
})
