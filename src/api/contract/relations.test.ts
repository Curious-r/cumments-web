import { describe, expect, it, vi } from "vitest"
import { CommentsClient } from "../comments"
import type { ClientContext } from "../context"
import type { Message } from "./query"
import { type MessageRelations, messageRelations } from "./relations"

// The four semantic relation states the frontend must keep distinct
// (misc/design contract: threadRootId and replyToId are independent).
const COMBOS: { name: string; relations: MessageRelations }[] = [
  { name: "normal message (null/null)", relations: { threadRootId: null, replyToId: null } },
  { name: "main-feed reply (null/A)", relations: { threadRootId: null, replyToId: "$a" } },
  {
    name: "thread-context general reply (A/null)",
    relations: { threadRootId: "$a", replyToId: null },
  },
  {
    name: "thread-context direct reply (A/B)",
    relations: { threadRootId: "$a", replyToId: "$b" },
  },
]

function makeMessage(relations: MessageRelations): Message {
  return {
    event_id: "$msg",
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
    reply_to: relations.replyToId,
    thread_root: relations.threadRootId,
    submission_id: null,
    status: "active",
    redacted_at: null,
    redacted_by: null,
    reactions: [],
  } as Message
}

describe("messageRelations", () => {
  it("exposes threadRootId and replyToId independently for all four combinations", () => {
    for (const { name, relations } of COMBOS) {
      const m = makeMessage(relations)
      expect(messageRelations(m), name).toEqual(relations)
    }
  })

  it("maps wire fields to semantic fields without deriving one from the other", () => {
    // A / null must not become A / A
    expect(messageRelations(makeMessage({ threadRootId: "$a", replyToId: null }))).toEqual({
      threadRootId: "$a",
      replyToId: null,
    })
    // null / A must not become A / A
    expect(messageRelations(makeMessage({ threadRootId: null, replyToId: "$a" }))).toEqual({
      threadRootId: null,
      replyToId: "$a",
    })
    // A / B must not become B / B
    expect(messageRelations(makeMessage({ threadRootId: "$a", replyToId: "$b" }))).toEqual({
      threadRootId: "$a",
      replyToId: "$b",
    })
  })

  it("returns exactly the two semantic relation fields", () => {
    expect(Object.keys(messageRelations(makeMessage(COMBOS[0].relations)))).toEqual([
      "threadRootId",
      "replyToId",
    ])
  })
})

describe("message relation serialization", () => {
  it("JSON round-trip preserves all four relation combinations", () => {
    for (const { name, relations } of COMBOS) {
      const m = makeMessage(relations)
      const parsed = JSON.parse(JSON.stringify(m)) as Message
      expect(parsed.thread_root, name).toBe(relations.threadRootId)
      expect(parsed.reply_to, name).toBe(relations.replyToId)
      expect(messageRelations(parsed), name).toEqual(relations)
    }
  })

  it("serialization does not collapse distinct states into one another", () => {
    const roundTrip = (relations: MessageRelations): MessageRelations =>
      messageRelations(JSON.parse(JSON.stringify(makeMessage(relations))) as Message)

    // A / null -> A / A  is a regression
    expect(roundTrip({ threadRootId: "$a", replyToId: null })).toEqual({
      threadRootId: "$a",
      replyToId: null,
    })
    // null / A -> A / A  is a regression
    expect(roundTrip({ threadRootId: null, replyToId: "$a" })).toEqual({
      threadRootId: null,
      replyToId: "$a",
    })
    // A / B -> B / B  is a regression
    expect(roundTrip({ threadRootId: "$a", replyToId: "$b" })).toEqual({
      threadRootId: "$a",
      replyToId: "$b",
    })
    // null / null stays empty
    expect(roundTrip({ threadRootId: null, replyToId: null })).toEqual({
      threadRootId: null,
      replyToId: null,
    })
  })
})

function createCommentsClient() {
  const signSpy = vi.fn(async (_parts: (string | null | undefined)[]) => ({
    author_public_key: "pk_test",
    author_signature: "sig_test",
    challenge_response: "prefix|nonce",
  }))
  const requestSpy = vi.fn(async () => ({
    data: { submission_id: 1 },
    headers: new Headers(),
    status: 202,
  }))
  const ctx = {
    siteId: "my-site",
    pageSlug: "hello-world",
    signingPipeline: { sign: signSpy } as unknown as ClientContext["signingPipeline"],
    transport: { request: requestSpy } as unknown as ClientContext["transport"],
  } as unknown as ClientContext
  return { client: new CommentsClient(ctx), signSpy, requestSpy }
}

describe("CreateCommentRequest relation fields", () => {
  it("accepts all four relation combinations and sends them without derivation", async () => {
    for (const { name, relations } of COMBOS) {
      const { client, signSpy, requestSpy } = createCommentsClient()
      await client.create("hello", {
        displayName: "Alice",
        threadRootId: relations.threadRootId,
        replyToId: relations.replyToId,
      })
      const call = requestSpy.mock.calls[0] as unknown as [
        string,
        string,
        { body: Record<string, unknown> },
      ]
      const body = call[2].body
      expect(body.thread_root, name).toBe(relations.threadRootId)
      expect(body.reply_to, name).toBe(relations.replyToId)
      // semantic fields must not leak into the wire body under other names
      expect(body.threadRootId).toBeUndefined()
      expect(body.replyToId).toBeUndefined()
      // Matrix fallback is a wire-level backend concern, not a creation field
      expect(body.is_falling_back).toBeUndefined()
      expect(body.isFallingBack).toBeUndefined()
      // signing covers reply_to and thread_root positions
      const parts = signSpy.mock.calls[0][0] as (string | null)[]
      expect(parts[4], name).toBe(relations.replyToId)
      expect(parts[5], name).toBe(relations.threadRootId)
    }
  })

  it("A/null creation request does not imply a direct reply target", async () => {
    const { client, requestSpy } = createCommentsClient()
    await client.create("hello", { threadRootId: "$a", replyToId: null })
    const call = requestSpy.mock.calls[0] as unknown as [
      string,
      string,
      { body: Record<string, unknown> },
    ]
    expect(call[2].body.thread_root).toBe("$a")
    expect(call[2].body.reply_to).toBeNull()
  })
})
