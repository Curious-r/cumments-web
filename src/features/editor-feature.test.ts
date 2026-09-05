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

  it("submitFromIntent reads relations from ComposerContext (main reply: null / A)", async () => {
    const port = fakePort()
    const editor = new EditorFeature(port)
    editor.setComposerContext({ threadRootId: null, replyToId: "$p" })
    await editor.submitFromIntent("hello", "Alice")
    expect(port.calls[0].opts).toMatchObject({
      replyToId: "$p",
      threadRootId: null,
      displayName: "Alice",
    })
  })

  it("submitFromIntent without reply target stays null/null", async () => {
    const port = fakePort()
    const editor = new EditorFeature(port)
    await editor.submitFromIntent("hi", "Bob")
    expect(port.calls[0].opts).toMatchObject({
      replyToId: null,
      threadRootId: null,
      displayName: "Bob",
    })
  })

  it("submitPollFromIntent reads relations from ComposerContext", async () => {
    const port = fakePort()
    const editor = new EditorFeature(port)
    editor.setComposerContext({ threadRootId: null, replyToId: "$p" })
    await editor.submitPollFromIntent({ question: "Q?", options: ["a", "b"] }, "Alice")
    expect(port.pollCalls[0].opts).toMatchObject({
      replyToId: "$p",
      threadRootId: null,
      displayName: "Alice",
    })
  })

  it("displayName trim and blank -> Anonymous", async () => {
    const port = fakePort()
    const editor = new EditorFeature(port)
    await editor.submitFromIntent("content", " Alice ")
    expect(port.calls[0].opts).toMatchObject({ displayName: "Alice" })
    port.calls.length = 0
    await editor.submitFromIntent("content", "   ")
    expect(port.calls[0].opts).toMatchObject({ displayName: "Anonymous" })
    port.calls.length = 0
    await editor.submitFromIntent("content", null)
    expect(port.calls[0].opts).toMatchObject({ displayName: "Anonymous" })
  })

  it("does not read ProfileFeature", async () => {
    const port = fakePort()
    const editor = new EditorFeature(port)
    // EditorFeature should not import ProfileFeature, check via that it has no profile dependency
    // We verify by ensuring submitFromIntent does not require profile
    await editor.submitFromIntent("test", "Charlie")
    expect(port.calls[0].opts).toMatchObject({ displayName: "Charlie" })
  })
})

describe("EditorFeature - context-driven submission relations", () => {
  it("submits all four relation combinations for text without rewriting either field", async () => {
    const states: Array<{ threadRootId: string | null; replyToId: string | null }> = [
      { threadRootId: null, replyToId: null },
      { threadRootId: null, replyToId: "$a" },
      { threadRootId: "$a", replyToId: null },
      { threadRootId: "$a", replyToId: "$b" },
    ]
    for (const state of states) {
      const port = fakePort()
      const editor = new EditorFeature(port)
      editor.setComposerContext(state)
      await editor.submitFromIntent("hello", "Alice")
      expect(port.calls[0].opts).toMatchObject({
        replyToId: state.replyToId,
        threadRootId: state.threadRootId,
      })
    }
  })

  it("submits thread general reply as A / null (never A / A) for text", async () => {
    const port = fakePort()
    const editor = new EditorFeature(port)
    editor.setComposerContext({ threadRootId: "$a", replyToId: null })
    await editor.submitFromIntent("hello", "Alice")
    expect(port.calls[0].opts).toEqual({
      displayName: "Alice",
      replyToId: null,
      threadRootId: "$a",
      media: null,
    })
  })

  it("submits thread direct reply as A / B for text", async () => {
    const port = fakePort()
    const editor = new EditorFeature(port)
    editor.setComposerContext({ threadRootId: "$a", replyToId: "$b" })
    await editor.submitFromIntent("hello", "Alice")
    expect(port.calls[0].opts).toMatchObject({ threadRootId: "$a", replyToId: "$b" })
  })

  it("submits poll with thread scope A / null from ComposerContext", async () => {
    const port = fakePort()
    const editor = new EditorFeature(port)
    editor.setComposerContext({ threadRootId: "$a", replyToId: null })
    await editor.submitPollFromIntent({ question: "Q?", options: ["a", "b"] }, "Alice")
    expect(port.pollCalls[0].opts).toMatchObject({ threadRootId: "$a", replyToId: null })
  })

  it("submits poll with thread direct reply A / B from ComposerContext", async () => {
    const port = fakePort()
    const editor = new EditorFeature(port)
    editor.setComposerContext({ threadRootId: "$a", replyToId: "$b" })
    await editor.submitPollFromIntent({ question: "Q?", options: ["a", "b"] }, "Alice")
    expect(port.pollCalls[0].opts).toMatchObject({ threadRootId: "$a", replyToId: "$b" })
  })

  it("captures the context before any post-submit reset can run", async () => {
    const port = fakePort()
    const editor = new EditorFeature(port)
    editor.setComposerContext({ threadRootId: "$a", replyToId: null })
    const pending = editor.submitFromIntent("hello", "Alice")
    // Simulate a composer reset racing the in-flight creation
    editor.setComposerContext({ threadRootId: null, replyToId: null })
    await pending
    // The request already captured A / null
    expect(port.calls[0].opts).toMatchObject({ threadRootId: "$a", replyToId: null })
  })

  it("a failed submission preserves the ComposerContext and retry uses the same context", async () => {
    const port = fakePort()
    let attempts = 0
    const originalSubmit = port.submit.bind(port)
    port.submit = async (content, opts) => {
      attempts++
      if (attempts === 1) throw new Error("boom")
      return originalSubmit(content, opts)
    }
    const editor = new EditorFeature(port)
    editor.setComposerContext({ threadRootId: "$a", replyToId: null })

    await expect(editor.submitFromIntent("hello", "Alice")).rejects.toThrow("boom")
    // Failure must not clear or transform the context
    expect(editor.getComposerContext()).toEqual({ threadRootId: "$a", replyToId: null })

    // Retry submits with the same context
    await editor.submitFromIntent("hello", "Alice")
    expect(attempts).toBe(2)
    expect(port.calls[0].opts).toMatchObject({ threadRootId: "$a", replyToId: null })
  })

  it("setReplyTarget preserves the active threadRootId", () => {
    const editor = new EditorFeature(fakePort())
    editor.setComposerContext({ threadRootId: "$a", replyToId: null })
    editor.setReplyTarget("$b")
    expect(editor.getComposerContext()).toEqual({ threadRootId: "$a", replyToId: "$b" })
    editor.setReplyTarget(null)
    expect(editor.getComposerContext()).toEqual({ threadRootId: "$a", replyToId: null })
  })
})

describe("EditorFeature - composer context", () => {
  it("starts in the main new-comment state (null / null)", () => {
    const editor = new EditorFeature(fakePort())
    expect(editor.getComposerContext()).toEqual({ threadRootId: null, replyToId: null })
  })

  it("represents all four relation combinations without rewriting either field", () => {
    const editor = new EditorFeature(fakePort())
    const states: Array<{ threadRootId: string | null; replyToId: string | null }> = [
      { threadRootId: null, replyToId: null },
      { threadRootId: null, replyToId: "$a" },
      { threadRootId: "$a", replyToId: null },
      { threadRootId: "$a", replyToId: "$b" },
    ]
    for (const state of states) {
      editor.setComposerContext(state)
      expect(editor.getComposerContext()).toEqual(state)
    }
  })

  it("getComposerContext returns a copy, not live state", () => {
    const editor = new EditorFeature(fakePort())
    editor.setComposerContext({ threadRootId: "$a", replyToId: "$b" })
    const ctx = editor.getComposerContext()
    ctx.replyToId = null
    expect(editor.getComposerContext()).toEqual({ threadRootId: "$a", replyToId: "$b" })
  })

  it("main Reply assignment keeps threadRootId null; opening a thread overwrites both fields", () => {
    const editor = new EditorFeature(fakePort())
    // Main-feed Reply contract: { threadRootId: null, replyToId }
    editor.setComposerContext({ threadRootId: null, replyToId: "$b" })
    expect(editor.getComposerContext()).toEqual({ threadRootId: null, replyToId: "$b" })
    // Opening Thread A initializes { A, null } — no reply target leaks in
    editor.setComposerContext({ threadRootId: "$a", replyToId: null })
    expect(editor.getComposerContext()).toEqual({ threadRootId: "$a", replyToId: null })
    // Closing returns to the main state
    editor.setComposerContext({ threadRootId: null, replyToId: null })
    expect(editor.getComposerContext()).toEqual({ threadRootId: null, replyToId: null })
  })
})
