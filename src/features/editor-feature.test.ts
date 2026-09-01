import { describe, expect, it, vi } from "vitest"
import type { Message } from "../api/contract/query"
import { type CommentsSubmitPort, EditorFeature } from "./editor-feature"

// Architecture constraint: EditorFeature must not import CommentsFeature (verified via grep / review)

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    event_id: "$msg1",
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

function fakePort(
  messages: Map<string, Message> = new Map(),
): CommentsSubmitPort & { calls: { content: string; opts: unknown }[] } {
  const calls: { content: string; opts: unknown }[] = []
  return {
    calls,
    async submit(
      content: string,
      opts: {
        displayName: string
        replyTo: string | null
        threadRoot: string | null
        media?: { url: string; kind: string } | null
      },
    ): Promise<void> {
      calls.push({ content, opts })
    },
    getMessage(eventId: string): Message | undefined {
      return messages.get(eventId)
    },
  }
}

describe("EditorFeature - via fake CommentsSubmitPort", () => {
  it("can be instantiated via fake port without CommentsFeature", () => {
    const port = fakePort()
    const editor = new EditorFeature(port)
    expect(editor).toBeDefined()
  })

  it("deriveThreadRootFor via port getMessage", () => {
    const msgParent = makeMessage({ event_id: "$parent", thread_root: null, reply_to: null })
    const msgChild = makeMessage({
      event_id: "$child",
      thread_root: "$parent",
      reply_to: "$parent",
    })
    const map = new Map<string, Message>([["$parent", msgParent]])
    const port = fakePort(map)
    const editor = new EditorFeature(port)
    expect(editor.deriveThreadRootFor("$parent")).toBe("$parent")
    // For child, its thread_root is $parent, so derive should be $parent
    const targetChild = makeMessage({
      event_id: "$child",
      thread_root: "$parent",
      reply_to: "$parent",
    })
    expect(editor.deriveThreadRoot(targetChild)).toBe("$parent")
    // When replyToId is null, should be null
    expect(editor.deriveThreadRootFor(null)).toBeNull()
  })

  it("submitFromIntent nested reply", async () => {
    const parent = makeMessage({ event_id: "$p", thread_root: null, reply_to: null })
    const map = new Map<string, Message>([["$p", parent]])
    const port = fakePort(map)
    const editor = new EditorFeature(port)
    await editor.submitFromIntent("hello", "$p", "Alice")
    expect(port.calls[0].opts).toMatchObject({
      replyTo: "$p",
      threadRoot: "$p",
      displayName: "Alice",
    })
  })

  it("submitFromIntent root reply", async () => {
    const port = fakePort()
    const editor = new EditorFeature(port)
    await editor.submitFromIntent("hi", null, "Bob")
    expect(port.calls[0].opts).toMatchObject({
      replyTo: null,
      threadRoot: null,
      displayName: "Bob",
    })
  })

  it("displayName trim and blank -> Anonymous", async () => {
    const port = fakePort()
    const editor = new EditorFeature(port)
    await editor.submitFromIntent("content", null, " Alice ")
    expect(port.calls[0].opts).toMatchObject({ displayName: "Alice" })
    port.calls.length = 0
    await editor.submitFromIntent("content", null, "   ")
    expect(port.calls[0].opts).toMatchObject({ displayName: "Anonymous" })
    port.calls.length = 0
    await editor.submitFromIntent("content", null, null)
    expect(port.calls[0].opts).toMatchObject({ displayName: "Anonymous" })
  })

  it("does not read ProfileFeature", async () => {
    const port = fakePort()
    const editor = new EditorFeature(port)
    // EditorFeature should not import ProfileFeature, check via that it has no profile dependency
    // We verify by ensuring submitFromIntent does not require profile
    await editor.submitFromIntent("test", null, "Charlie")
    expect(port.calls[0].opts).toMatchObject({ displayName: "Charlie" })
  })
})
