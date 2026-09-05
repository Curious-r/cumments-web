import { describe, expect, it, vi } from "vitest"
import { CommentsClient } from "../api/comments"
import type { ClientContext } from "../api/context"
import type { Message, PaginatedResponse } from "../api/contract/query"
import { EntityCache } from "../state/entity-cache"
import { PageView } from "../state/page-view"
import { PendingOperation } from "../state/pending-operation"
import { CommentsFeature } from "./comments-feature"
import { ThreadFeature } from "./thread-feature"

function makeMessage(eventId: string, overrides: Partial<Message> = {}): Message {
  return {
    event_id: eventId,
    site_id: "my-site",
    page_slug: "hello-world",
    author: {
      type: "visitor",
      display_name: "A",
      avatar_url: null,
      public_key: "pk",
      mxid: null,
    } as unknown as Message["author"],
    content: { type: "text", body: `body of ${eventId}` } as unknown as Message["content"],
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

function page(data: Message[], total: number, pageNum: number, totalPages = 1): PaginatedResponse {
  return {
    data,
    meta: { total, page: pageNum, per_page: 2, total_pages: totalPages },
  }
}

function createFeature(handler: (method: string, path: string, body: unknown) => unknown): {
  feature: ThreadFeature
  cache: EntityCache
  requestSpy: ReturnType<typeof vi.fn>
} {
  const requestSpy = vi.fn(
    async (method: string, path: string, opts: { body?: unknown; signal?: AbortSignal }) => ({
      data: handler(method, path, opts?.body),
      headers: new Headers(),
      status: 200,
    }),
  )
  const ctx = {
    siteId: "my-site",
    pageSlug: "hello-world",
    signingPipeline: { signQuery: async () => null },
    transport: { request: requestSpy },
  } as unknown as ClientContext
  const cache = new EntityCache()
  const feature = new ThreadFeature(new CommentsClient(ctx), cache, { perPage: 2 })
  return { feature, cache, requestSpy }
}

describe("ThreadFeature - initial load", () => {
  it("loads members in backend order and resolves them through the shared EntityCache", async () => {
    const b = makeMessage("$b", { thread_root: "$a", reply_to: null })
    const c = makeMessage("$c", { thread_root: "$a", reply_to: "$b" })
    const { feature, cache, requestSpy } = createFeature(() => page([b, c], 2, 1))
    // Root already present from the main feed
    const root = makeMessage("$a")
    cache.set("$a", root)

    await feature.open("$a")

    const snap = feature.snapshot()
    expect(snap.rootId).toBe("$a")
    expect(snap.memberIds).toEqual(["$b", "$c"])
    expect(snap.loading).toBe(false)
    expect(snap.error).toBeNull()
    expect(snap.pagination).toEqual({ total: 2, page: 1, per_page: 2, total_pages: 1 })
    // Members resolved through the shared cache, preserving backend order
    expect(feature.members).toEqual([b, c])
    expect(cache.has("$b")).toBe(true)
    expect(cache.has("$c")).toBe(true)
    // The root was reused from the cache: no comment fetch happened
    expect(requestSpy.mock.calls.filter(([method]) => method === "GET")).toHaveLength(0)
  })

  it("queries the backend with the contract's thread_root filter and page metadata", async () => {
    const { feature, cache, requestSpy } = createFeature(() => page([], 0, 1))
    // Root already known: only the member query goes to the backend
    cache.set("$a", makeMessage("$a"))
    await feature.open("$a")
    expect(requestSpy).toHaveBeenCalledTimes(1)
    const [method, path, opts] = requestSpy.mock.calls[0] as unknown as [
      string,
      string,
      { body: Record<string, unknown> },
    ]
    expect(method).toBe("QUERY")
    expect(path).toBe("/api/v1/sites/my-site/pages/hello-world/comments")
    // Backend contract: thread_root filter + pagination; no personalization
    // without viewer identity, no client-side derivation fields.
    expect(opts.body).toEqual({ page: 1, per_page: 2, thread_root: "$a" })
  })

  it("fetches and caches the root via getComment only when it is not already known", async () => {
    const root = makeMessage("$a", { thread_summary: { num_replies: 2, latest_reply: "$c" } })
    const b = makeMessage("$b", { thread_root: "$a" })
    const c = makeMessage("$c", { thread_root: "$a", reply_to: "$b" })
    const { feature, cache, requestSpy } = createFeature((method, path) => {
      if (method === "GET") {
        expect(path).toBe("/api/v1/sites/my-site/pages/hello-world/comments/%24a")
        return root
      }
      return page([b, c], 2, 1)
    })

    await feature.open("$a")

    // Root fetched once via GET, upserted into the shared cache, and never
    // turned into a Thread member.
    expect(requestSpy.mock.calls.filter(([method]) => method === "GET")).toHaveLength(1)
    expect(cache.get("$a")).toBe(root)
    expect(feature.root).toBe(root)
    expect(feature.snapshot().memberIds).toEqual(["$b", "$c"])
    expect(feature.snapshot().memberIds).not.toContain("$a")
  })
})

describe("ThreadFeature - empty thread", () => {
  it("represents an empty thread as valid loaded state, not an error", async () => {
    const root = makeMessage("$a")
    const { feature, cache } = createFeature((_m, _p, body) => {
      expect((body as { thread_root: string }).thread_root).toBe("$a")
      return page([], 0, 1)
    })
    cache.set("$a", root)

    await feature.open("$a")

    const snap = feature.snapshot()
    expect(snap.rootId).toBe("$a")
    expect(snap.memberIds).toEqual([])
    expect(snap.pagination).toEqual({ total: 0, page: 1, per_page: 2, total_pages: 1 })
    expect(snap.loading).toBe(false)
    expect(snap.error).toBeNull()
    expect(feature.hasNextPage).toBe(false)
  })
})

describe("ThreadFeature - pagination", () => {
  it("appends the next backend page in backend order without reordering page 1", async () => {
    const b = makeMessage("$b", { thread_root: "$a" })
    const c = makeMessage("$c", { thread_root: "$a" })
    const d = makeMessage("$d", { thread_root: "$a" })
    const e = makeMessage("$e", { thread_root: "$a" })
    const { feature, cache, requestSpy } = createFeature((_m, _p, body) => {
      const q = body as { page?: number }
      if ((q.page ?? 1) === 1) return page([b, c], 4, 1, 2)
      return page([d, e], 4, 2, 2)
    })
    cache.set("$a", makeMessage("$a"))

    await feature.open("$a")
    expect(feature.snapshot().memberIds).toEqual(["$b", "$c"])
    expect(feature.hasNextPage).toBe(true)

    await feature.loadNextPage()

    expect(feature.snapshot().memberIds).toEqual(["$b", "$c", "$d", "$e"])
    expect(feature.snapshot().pagination?.page).toBe(2)
    expect(feature.snapshot().loading).toBe(false)
    expect(feature.snapshot().error).toBeNull()
    // All member entities live in the shared cache
    for (const id of ["$b", "$c", "$d", "$e"]) expect(cache.has(id)).toBe(true)
    // End of pagination: no further request is made
    expect(feature.hasNextPage).toBe(false)
    const queryCalls = requestSpy.mock.calls.filter(([method]) => method === "QUERY").length
    await feature.loadNextPage()
    expect(requestSpy.mock.calls.filter(([method]) => method === "QUERY").length).toBe(queryCalls)
    expect(feature.snapshot().memberIds).toEqual(["$b", "$c", "$d", "$e"])
  })

  it("loadNextPage is a no-op without an open thread", async () => {
    const { feature, requestSpy } = createFeature(() => page([], 0, 1))
    await feature.loadNextPage()
    expect(requestSpy).not.toHaveBeenCalled()
    expect(feature.snapshot().rootId).toBeNull()
  })
})

describe("ThreadFeature - race isolation", () => {
  it("a late response for thread A cannot overwrite active thread B", async () => {
    let resolveA: (value: PaginatedResponse) => void = () => {}
    const b = makeMessage("$b", { thread_root: "$b-root" })
    const c = makeMessage("$c", { thread_root: "$b-root", reply_to: "$b" })
    const staleA = [makeMessage("$a1", { thread_root: "$a" })]
    const { feature, cache } = createFeature((_m, _p, body) => {
      const q = body as { thread_root?: string }
      if (q.thread_root === "$a") {
        return new Promise<PaginatedResponse>((resolve) => {
          resolveA = resolve
        })
      }
      return page([b, c], 2, 1)
    })
    cache.set("$a", makeMessage("$a"))
    cache.set("$b-root", makeMessage("$b-root"))

    const pendingA = feature.open("$a")
    await feature.open("$b-root")
    expect(feature.snapshot().rootId).toBe("$b-root")
    expect(feature.snapshot().memberIds).toEqual(["$b", "$c"])

    // Late response for A must be discarded
    resolveA({ data: staleA, meta: { total: 1, page: 1, per_page: 2, total_pages: 1 } })
    await pendingA

    const snap = feature.snapshot()
    expect(snap.rootId).toBe("$b-root")
    expect(snap.memberIds).toEqual(["$b", "$c"])
    expect(snap.error).toBeNull()
    expect(cache.has("$a1")).toBe(false)
  })

  it("a late response after close() does not commit thread state", async () => {
    let resolveA: (value: PaginatedResponse) => void = () => {}
    const { feature } = createFeature((_m, _p, body) => {
      const q = body as { thread_root?: string }
      if (q.thread_root === "$a") {
        return new Promise<PaginatedResponse>((resolve) => {
          resolveA = resolve
        })
      }
      return page([], 0, 1)
    })

    const pendingA = feature.open("$a")
    feature.close()
    resolveA({
      data: [makeMessage("$a1", { thread_root: "$a" })],
      meta: { total: 1, page: 1, per_page: 2, total_pages: 1 },
    })
    await pendingA

    const snap = feature.snapshot()
    expect(snap.rootId).toBeNull()
    expect(snap.memberIds).toEqual([])
    expect(snap.loading).toBe(false)
    expect(snap.error).toBeNull()
    expect(feature.isOpen).toBe(false)
  })
})

describe("ThreadFeature - error isolation", () => {
  it("a failed thread read sets only the thread error slot, never the main feed's", async () => {
    let queryCalls = 0
    const requestSpy = vi.fn(async (method: string) => {
      if (method === "QUERY") {
        queryCalls++
        if (queryCalls === 1) {
          // Main feed initial page succeeds
          return {
            data: page([], 0, 1),
            headers: new Headers(),
            status: 200,
          }
        }
        // Thread member query fails
        throw new Error("thread boom")
      }
      return { data: makeMessage("$a"), headers: new Headers(), status: 200 }
    })
    const ctx = {
      siteId: "my-site",
      pageSlug: "hello-world",
      signingPipeline: { signQuery: async () => null },
      transport: { request: requestSpy },
    } as unknown as ClientContext
    const commentsApi = new CommentsClient(ctx)
    const cache = new EntityCache()
    const thread = new ThreadFeature(commentsApi, cache, { perPage: 2 })
    // Main feed sharing the same cache and api context
    const comments = new CommentsFeature(
      commentsApi,
      commentsApi as never,
      commentsApi as never,
      cache,
      new PageView(),
      new PendingOperation(),
    )
    await comments.loadPage()
    expect(comments.snapshot().error).toBeNull()

    await thread.open("$a")

    expect(thread.snapshot().error).toBe("thread boom")
    expect(thread.snapshot().loading).toBe(false)
    expect(thread.snapshot().rootId).toBe("$a")
    // Main feed error state is untouched
    expect(comments.snapshot().error).toBeNull()
    // The thread root fetched before the member failure is still cached
    expect(cache.has("$a")).toBe(true)
  })
})

describe("ThreadFeature - entity reuse", () => {
  it("member and root entities are the exact objects held by the shared EntityCache", async () => {
    const root = makeMessage("$a")
    const b = makeMessage("$b", { thread_root: "$a" })
    const c = makeMessage("$c", { thread_root: "$a", reply_to: "$b" })
    const { feature, cache } = createFeature(() => page([b, c], 2, 1))
    cache.set("$a", root)

    await feature.open("$a")

    expect(cache.get("$b")).toBe(b)
    expect(cache.get("$c")).toBe(c)
    expect(feature.members[0]).toBe(b)
    expect(feature.members[1]).toBe(c)
    expect(feature.root).toBe(root)
    expect(feature.getMessage("$b")).toBe(b)
  })
})

describe("ThreadFeature - composer context lifecycle hooks", () => {
  function makeHooks() {
    const events: string[] = []
    return {
      events,
      onThreadOpened: (rootId: string) => events.push(`opened:${rootId}`),
      onThreadClosed: () => events.push("closed"),
    }
  }

  it("fires opened/closed hooks synchronously at the state transitions, not on responses", async () => {
    let resolveA: (value: PaginatedResponse) => void = () => {}
    const { feature } = createFeature((_m, _p, body) => {
      const q = body as { thread_root?: string }
      if (q.thread_root === "$a") {
        return new Promise<PaginatedResponse>((resolve) => {
          resolveA = resolve
        })
      }
      return page([], 0, 1)
    })
    const hooks = makeHooks()
    feature.onThreadOpened = hooks.onThreadOpened
    feature.onThreadClosed = hooks.onThreadClosed

    const pendingA = feature.open("$a")
    // Fired synchronously, before any response arrived
    expect(hooks.events).toEqual(["opened:$a"])

    feature.close()
    expect(hooks.events).toEqual(["opened:$a", "closed"])

    // The late response must not re-fire open lifecycle
    resolveA({ data: [], meta: { total: 0, page: 1, per_page: 2, total_pages: 1 } })
    await pendingA
    expect(hooks.events).toEqual(["opened:$a", "closed"])
  })

  it("open A → close → open B fires hooks in an order that leaves B as the active context", async () => {
    const { feature } = createFeature(() => page([], 0, 1))
    const hooks = makeHooks()
    feature.onThreadOpened = hooks.onThreadOpened
    feature.onThreadClosed = hooks.onThreadClosed

    await feature.open("$a")
    feature.close()
    await feature.open("$b")

    expect(hooks.events).toEqual(["opened:$a", "closed", "opened:$b"])
    expect(feature.snapshot().rootId).toBe("$b")
  })

  it("re-opening the same root re-fires the opened hook (retry keeps context consistent)", async () => {
    let failedOnce = false
    const { feature } = createFeature((_m, _p, body) => {
      const q = (body ?? {}) as { page?: number }
      if ((q.page ?? 1) === 1 && !failedOnce) {
        failedOnce = true
        throw new Error("thread boom")
      }
      return page([], 0, 1)
    })
    const hooks = makeHooks()
    feature.onThreadOpened = hooks.onThreadOpened
    feature.onThreadClosed = hooks.onThreadClosed

    await feature.open("$a")
    expect(hooks.events).toEqual(["opened:$a"])
    await feature.open("$a") // retry
    expect(hooks.events).toEqual(["opened:$a", "opened:$a"])
    expect(feature.snapshot().error).toBeNull()
  })
})

describe("ThreadFeature - local creation reconciliation", () => {
  it("active thread success merges the created member into cache and ordering", async () => {
    const b = makeMessage("$b", { thread_root: "$a" })
    const x = makeMessage("$x", { thread_root: "$a" })
    let page1: Message[] = [b]
    const { feature, cache } = createFeature(() => page(page1, page1.length, 1))
    cache.set("$a", makeMessage("$a"))
    await feature.open("$a")
    expect(feature.snapshot().memberIds).toEqual(["$b"])

    // Creation succeeded: the backend now projects the new member on page 1
    page1 = [x, b]
    await feature.revalidateAfterCreation("$a")

    expect(feature.snapshot().memberIds).toEqual(["$x", "$b"])
    // Canonical entity available through the shared cache, single identity
    expect(cache.get("$x")).toBe(x)
    expect(feature.members[0]).toBe(x)
    // Pagination metadata comes from the backend revalidation, uncorrupted
    expect(feature.snapshot().pagination).toEqual({
      total: 2,
      page: 1,
      per_page: 2,
      total_pages: 1,
    })
  })

  it("an empty thread becomes [newMember] after successful creation", async () => {
    const x = makeMessage("$x", { thread_root: "$a" })
    let page1: Message[] = []
    const { feature, cache } = createFeature(() => page(page1, page1.length, 1))
    cache.set("$a", makeMessage("$a"))
    await feature.open("$a")
    expect(feature.snapshot().memberIds).toEqual([])

    page1 = [x]
    await feature.revalidateAfterCreation("$a")

    expect(feature.snapshot().memberIds).toEqual(["$x"])
    expect(cache.has("$x")).toBe(true)
    expect(feature.snapshot().error).toBeNull()
  })

  it("a creation for another thread does not mutate the active thread", async () => {
    const b = makeMessage("$b", { thread_root: "$a" })
    const { feature, requestSpy } = createFeature(() => page([b], 1, 1))
    await feature.open("$a")
    const callsBefore = requestSpy.mock.calls.length

    await feature.revalidateAfterCreation("$other")

    expect(requestSpy.mock.calls.length).toBe(callsBefore)
    expect(feature.snapshot().memberIds).toEqual(["$b"])
  })

  it("a late revalidation after close/open does not mutate the new thread", async () => {
    let resolveA: (value: PaginatedResponse) => void = () => {}
    let aCalls = 0
    const bm = makeMessage("$bm", { thread_root: "$b" })
    const am = makeMessage("$am", { thread_root: "$a" })
    const { feature, cache } = createFeature((_m, _p, body) => {
      const q = (body ?? {}) as { thread_root?: string }
      if (q.thread_root === "$a") {
        aCalls++
        if (aCalls === 1) return page([], 0, 1) // initial load
        return new Promise<PaginatedResponse>((resolve) => {
          resolveA = resolve // revalidation read, gated
        })
      }
      return page([bm], 1, 1)
    })
    cache.set("$a", makeMessage("$a"))
    cache.set("$b", makeMessage("$b"))

    await feature.open("$a")
    const pendingRevalidate = feature.revalidateAfterCreation("$a")
    // Thread A closed and B opened before the revalidation read resolves
    feature.close()
    await feature.open("$b")
    expect(feature.snapshot().memberIds).toEqual(["$bm"])

    resolveA(page([am], 1, 1))
    await pendingRevalidate

    // The late result must not touch cache or Thread B ordering
    expect(feature.snapshot().rootId).toBe("$b")
    expect(feature.snapshot().memberIds).toEqual(["$bm"])
    expect(cache.has("$am")).toBe(false)
  })

  it("duplicate reconciliation is idempotent", async () => {
    const b = makeMessage("$b", { thread_root: "$a" })
    const x = makeMessage("$x", { thread_root: "$a" })
    let page1: Message[] = [b]
    const { feature } = createFeature(() => page(page1, page1.length, 1))
    await feature.open("$a")

    page1 = [x, b]
    await feature.revalidateAfterCreation("$a")
    await feature.revalidateAfterCreation("$a")

    expect(feature.snapshot().memberIds).toEqual(["$x", "$b"])
  })

  it("the thread root never enters memberIds", async () => {
    const b = makeMessage("$b", { thread_root: "$a" })
    const rootAsMember = makeMessage("$a", { thread_root: "$a" })
    let page1: Message[] = [b]
    const { feature } = createFeature(() => page(page1, 2, 1))
    await feature.open("$a")

    page1 = [rootAsMember, b]
    await feature.revalidateAfterCreation("$a")

    expect(feature.snapshot().memberIds).toEqual(["$b"])
    expect(feature.snapshot().memberIds).not.toContain("$a")
  })

  it("loadNextPage after revalidation does not duplicate members", async () => {
    const b = makeMessage("$b", { thread_root: "$a" })
    const x = makeMessage("$x", { thread_root: "$a" })
    const d = makeMessage("$d", { thread_root: "$a" })
    let page1: Message[] = [b]
    const { feature } = createFeature((_m, _p, body) => {
      const q = (body ?? {}) as { page?: number }
      if ((q.page ?? 1) === 1) return page(page1, 4, 1, 2)
      return page([b, d], 4, 2, 2) // page boundaries shifted by the new member
    })
    await feature.open("$a")

    page1 = [x, b]
    await feature.revalidateAfterCreation("$a")
    await feature.loadNextPage()

    expect(feature.snapshot().memberIds).toEqual(["$x", "$b", "$d"])
  })

  it("an old revalidation resolving after a same-root reopen does not mutate the new view", async () => {
    const b = makeMessage("$b", { thread_root: "$a" })
    const b2 = makeMessage("$b2", { thread_root: "$a" })
    const x = makeMessage("$x", { thread_root: "$a" })
    // Response queue for thread "$a" reads: open #1, gated revalidation, open #2
    const aQueue: Array<PaginatedResponse | Promise<PaginatedResponse>> = []
    let releaseOld: (value: PaginatedResponse) => void = () => {}
    const { feature, cache } = createFeature(async (_m, _p, body) => {
      const q = (body ?? {}) as { thread_root?: string }
      if (q.thread_root === "$a") {
        const next = aQueue.shift()
        if (!next) throw new Error("no queued $a response")
        return await next
      }
      return page([], 0, 1)
    })

    aQueue.push(page([b], 1, 1))
    await feature.open("$a")
    expect(feature.snapshot().memberIds).toEqual(["$b"])

    // Creation revalidation starts and stays in flight
    aQueue.push(
      new Promise<PaginatedResponse>((resolve) => {
        releaseOld = resolve
      }),
    )
    const pendingRevalidate = feature.revalidateAfterCreation("$a")

    // Close and reopen the same root — a new Thread-A lifecycle begins
    aQueue.push(page([b2], 1, 1))
    feature.close()
    await feature.open("$a")
    expect(feature.snapshot().memberIds).toEqual(["$b2"])

    // The old revalidation resolves into the new lifecycle's generation:
    // same root, but a stale view generation — it must be discarded entirely.
    releaseOld(page([x, b], 2, 1))
    await pendingRevalidate

    // New Thread-A state unchanged; no stale entity reached the cache
    expect(feature.snapshot().memberIds).toEqual(["$b2"])
    expect(cache.has("$x")).toBe(false)
  })
})
