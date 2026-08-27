import { describe, expect, it, vi } from "vitest"
import type { Message } from "../api/contract/query"
import { CommentStore } from "./comment-store"

function msg(overrides: Partial<Message> & { event_id: string }): Message {
  return {
    site_id: "s",
    page_slug: "p",
    author: { type: "visitor", display_name: "A", avatar_url: null, public_key: "pk", mxid: null },
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

describe("CommentStore", () => {
  it("loads page and orders", () => {
    const store = new CommentStore()
    store.loadPage({
      data: [msg({ event_id: "$2" }), msg({ event_id: "$1" })],
      meta: { total: 2, page: 1, per_page: 20, total_pages: 1 },
    })
    expect(store.getOrdered().map((m) => m.event_id)).toEqual(["$2", "$1"])
    expect(store.snapshot.meta?.total).toBe(2)
  })

  it("merges message_created", () => {
    const store = new CommentStore()
    store.loadPage({
      data: [msg({ event_id: "$1" })],
      meta: { total: 1, page: 1, per_page: 20, total_pages: 1 },
    })
    store.mergeRealtime({
      type: "message_created",
      payload: { site_id: "s", page_slug: "p", message: msg({ event_id: "$2" }) },
    } as never)
    expect(store.getOrdered()[0].event_id).toBe("$2")
  })

  it("merges message_deleted", () => {
    const store = new CommentStore()
    store.loadPage({
      data: [msg({ event_id: "$1" }), msg({ event_id: "$2" })],
      meta: { total: 2, page: 1, per_page: 20, total_pages: 1 },
    })
    store.mergeRealtime({
      type: "message_deleted",
      payload: { site_id: "s", page_slug: "p", event_id: "$1" },
    } as never)
    expect(store.getOrdered().map((m) => m.event_id)).toEqual(["$2"])
  })

  it("clears pending when synced by submission_id", () => {
    const store = new CommentStore()
    store.setPending({
      submissionId: 42,
      publicKey: "pk",
      content: "hello",
      submittedAt: Date.now(),
    })
    store.loadPage({
      data: [msg({ event_id: "$1", submission_id: 42 })],
      meta: { total: 1, page: 1, per_page: 20, total_pages: 1 },
    })
    expect(store.snapshot.pending).toBeNull()
  })

  it("notifies subscribers", () => {
    const store = new CommentStore()
    const cb = vi.fn()
    const off = store.subscribe(cb)
    store.loadPage({ data: [], meta: { total: 0, page: 1, per_page: 20, total_pages: 0 } })
    expect(cb).toHaveBeenCalledTimes(1)
    off()
    store.loadPage({ data: [], meta: { total: 0, page: 1, per_page: 20, total_pages: 0 } })
    expect(cb).toHaveBeenCalledTimes(1)
  })
})
