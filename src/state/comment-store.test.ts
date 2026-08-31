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

  it("incremental byId retains previous page messages", () => {
    const store = new CommentStore()
    store.loadPage({
      data: [
        msg({
          event_id: "$1",
          content: { type: "text", body: "page1" } as unknown as Message["content"],
        }),
      ],
      meta: { total: 2, page: 1, per_page: 1, total_pages: 2 },
    })
    expect(store.getMessage("$1")?.content.body).toBe("page1")
    store.loadPage({
      data: [
        msg({
          event_id: "$2",
          content: { type: "text", body: "page2" } as unknown as Message["content"],
        }),
      ],
      meta: { total: 2, page: 2, per_page: 1, total_pages: 2 },
    })
    // order is current page only
    expect(store.getOrdered().map((m) => m.event_id)).toEqual(["$2"])
    // but byId retains $1 for cross-page reply lookup
    expect(store.getMessage("$1")).toBeDefined()
    expect(store.getMessage("$1")?.content.body).toBe("page1")
    expect(store.getMessage("$2")).toBeDefined()
  })

  it("cross-page reply lookup succeeds after pagination", () => {
    const store = new CommentStore()
    const parent = msg({
      event_id: "$parent",
      content: { type: "text", body: "parent" } as unknown as Message["content"],
    })
    store.loadPage({
      data: [parent],
      meta: { total: 2, page: 1, per_page: 1, total_pages: 2 },
    })
    const reply = msg({
      event_id: "$reply",
      reply_to: "$parent",
      content: { type: "text", body: "reply" } as unknown as Message["content"],
    })
    store.loadPage({
      data: [reply],
      meta: { total: 2, page: 2, per_page: 1, total_pages: 2 },
    })
    expect(store.getOrdered()[0].reply_to).toBe("$parent")
    const target = store.getMessage("$parent")
    expect(target).toBeDefined()
    expect(target?.content.body).toBe("parent")
  })

  it("preserves redacted tombstone via incremental merge", () => {
    const store = new CommentStore()
    const active = msg({
      event_id: "$1",
      status: "active",
      content: { type: "text", body: "hi" } as unknown as Message["content"],
    })
    store.loadPage({
      data: [active],
      meta: { total: 1, page: 1, per_page: 20, total_pages: 1 },
    })
    const redacted = msg({
      event_id: "$1",
      status: "redacted" as unknown as Message["status"],
      content: { type: "redacted" } as unknown as Message["content"],
      redacted_at: new Date().toISOString(),
    })
    store.loadPage({
      data: [redacted],
      meta: { total: 1, page: 1, per_page: 20, total_pages: 1 },
    })
    const cached = store.getMessage("$1")
    expect(cached?.status).toBe("redacted")
    expect(cached?.content.type).toBe("redacted")
    expect(store.getOrdered()[0].content.type).toBe("redacted")
  })

  it("getMessage returns undefined for unknown id", () => {
    const store = new CommentStore()
    expect(store.getMessage("$unknown")).toBeUndefined()
  })

  it("message_updated for cached but not current page updates byId", () => {
    const store = new CommentStore()
    store.loadPage({
      data: [
        msg({
          event_id: "$1",
          content: { type: "text", body: "v1" } as unknown as Message["content"],
        }),
      ],
      meta: { total: 2, page: 1, per_page: 1, total_pages: 2 },
    })
    store.loadPage({
      data: [
        msg({
          event_id: "$2",
          content: { type: "text", body: "v1" } as unknown as Message["content"],
        }),
      ],
      meta: { total: 2, page: 2, per_page: 1, total_pages: 2 },
    })
    // $1 is not in current order but is in byId cache
    store.mergeRealtime({
      type: "message_updated",
      payload: {
        site_id: "s",
        page_slug: "p",
        message: msg({
          event_id: "$1",
          content: { type: "text", body: "v2-updated" } as unknown as Message["content"],
        }),
      },
    } as never)
    expect(store.getMessage("$1")?.content.body).toBe("v2-updated")
    // order still only contains $2
    expect(store.getOrdered().map((m) => m.event_id)).toEqual(["$2"])
  })
})
