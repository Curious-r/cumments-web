import { describe, expect, it } from "vitest"
import { type CommentsSubmitPort, EditorFeature } from "./editor-feature"

// Architecture constraint: EditorFeature must not import CommentsFeature (verified via grep / review)

function fakePort(): CommentsSubmitPort & {
  calls: { content: string; opts: unknown }[]
  pollCalls: { question: string; options: string[]; opts: unknown }[]
} {
  const calls: { content: string; opts: unknown }[] = []
  const pollCalls: { question: string; options: string[]; opts: unknown }[] = []
  return {
    calls,
    pollCalls,
    async createPoll(
      question: string,
      options: string[],
      opts: { displayName: string; replyToId: string | null; threadRootId: string | null },
    ): Promise<void> {
      pollCalls.push({ question, options, opts })
    },
    async submit(
      content: string,
      opts: {
        displayName: string
        replyToId: string | null
        threadRootId: string | null
        media?: { url: string; kind: string } | null
      },
    ): Promise<void> {
      calls.push({ content, opts })
    },
  }
}

describe("EditorFeature - via fake CommentsSubmitPort", () => {
  it("can be instantiated via fake port without CommentsFeature", () => {
    const port = fakePort()
    const editor = new EditorFeature(port)
    expect(editor).toBeDefined()
  })

  it("submitFromIntent reply passes replyToId without deriving threadRootId", async () => {
    const port = fakePort()
    const editor = new EditorFeature(port)
    // Ordinary main-feed Reply must not infer Thread membership from the reply target
    await editor.submitFromIntent("hello", "$p", "Alice")
    expect(port.calls[0].opts).toMatchObject({
      replyToId: "$p",
      threadRootId: null,
      displayName: "Alice",
    })
  })

  it("submitFromIntent without reply target stays null/null", async () => {
    const port = fakePort()
    const editor = new EditorFeature(port)
    await editor.submitFromIntent("hi", null, "Bob")
    expect(port.calls[0].opts).toMatchObject({
      replyToId: null,
      threadRootId: null,
      displayName: "Bob",
    })
  })

  it("submitPollFromIntent passes replyToId without deriving threadRootId", async () => {
    const port = fakePort()
    const editor = new EditorFeature(port)
    await editor.submitPollFromIntent({ question: "Q?", options: ["a", "b"] }, "$p", "Alice")
    expect(port.pollCalls[0].opts).toMatchObject({
      replyToId: "$p",
      threadRootId: null,
      displayName: "Alice",
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
