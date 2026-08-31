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
      avatar_url: "https://example.com/avatar.png",
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

describe("toViewModel thin wrapper", () => {
  it("preserves Message as source of truth", () => {
    const msg = makeMessage({
      content: {
        type: "text",
        body: "hello world",
        style: "normal",
      } as unknown as Message["content"],
      reactions: [
        {
          key: "👍",
          count: 3,
          mine: true,
          reactors: [{ display_name: "Alice", avatar_url: "https://example.com/a.png" }],
        } as unknown as Message["reactions"][number],
      ],
    })
    const vm = toViewModel(msg, "pk_other")
    // Message preserved by reference
    expect(vm.message).toBe(msg)
    expect(vm.message.content).toEqual(msg.content)
    expect(vm.message.reactions).toBe(msg.reactions)
    // No flattening
    expect(vm as unknown as Record<string, unknown>).not.toHaveProperty("body")
    expect(vm as unknown as Record<string, unknown>).not.toHaveProperty("reactions")
    expect(vm as unknown as Record<string, unknown>).not.toHaveProperty("eventId")
  })

  it("derives isOwn correctly", () => {
    const msg = makeMessage()
    expect(toViewModel(msg, "pk_author").isOwn).toBe(true)
    expect(toViewModel(msg, "pk_other").isOwn).toBe(false)
    expect(toViewModel(msg, null).isOwn).toBe(false)
  })

  it("derives displayName and avatarUrl", () => {
    const msg = makeMessage()
    const vm = toViewModel(msg, null)
    expect(vm.displayName).toBe("Author")
    expect(vm.avatarUrl).toBe("https://example.com/avatar.png")

    const anon = makeMessage({
      author: {
        type: "visitor",
        display_name: null,
        avatar_url: null,
        public_key: "pk",
        mxid: null,
      } as unknown as Message["author"],
    })
    const vm2 = toViewModel(anon, null)
    expect(vm2.displayName).toBe("Anonymous")
    expect(vm2.avatarUrl).toBeNull()
  })

  it("does not copy reactions", () => {
    const reactors = [{ display_name: "Alice", avatar_url: null }]
    const msg = makeMessage({
      reactions: [
        { key: "👍", count: 1, mine: true, reactors } as unknown as Message["reactions"][number],
      ],
    })
    const vm = toViewModel(msg, null)
    // ViewModel should not have reactions array; message does
    expect((vm as unknown as Record<string, unknown>).reactions).toBeUndefined()
    expect(vm.message.reactions[0].reactors).toBe(reactors)
    // Mutating message reactions is visible via vm.message (no copy)
    expect(vm.message.reactions[0].reactors).toBe(reactors)
  })

  it("does not duplicate nested content", () => {
    const msg = makeMessage({
      content: {
        type: "media",
        kind: "image",
        url: "mxc://x",
        body: "fallback",
      } as unknown as Message["content"],
    })
    const vm = toViewModel(msg, null)
    expect(vm.message.content).toEqual(msg.content)
    expect((vm as unknown as Record<string, unknown>).body).toBeUndefined()
  })

  it("reactor privacy: Message reactors only expose display_name/avatar_url", () => {
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
    const reactor = vm.message.reactions[0].reactors[0] as Record<string, unknown>
    expect(Object.keys(reactor).sort()).toEqual(["avatar_url", "display_name"])
  })
})
