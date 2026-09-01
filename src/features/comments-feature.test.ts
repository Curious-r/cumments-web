import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { CommentsClient } from "../api/comments"
import { ClientContext } from "../api/context"
import type { Message } from "../api/contract/query"
import { PollsClient } from "../api/polls"
import { ReactionsClient } from "../api/reactions"
import { EntityCache } from "../state/entity-cache"
import { PageView } from "../state/page-view"
import { PendingOperation } from "../state/pending-operation"
import { CommentsFeature } from "./comments-feature"

const server = setupServer()
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

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

function makeFeature(opts: { page?: number; perPage?: number } = {}) {
  const ctx = new ClientContext({
    endpoint: "https://example.com",
    siteId: "s",
    pageSlug: "p",
    identity: { publicKey: "pk", privateKey: "sk" } as never,
  })
  vi.spyOn(ctx.challengeManager, "get").mockResolvedValue({
    prefix: "test.",
    difficulty: 1,
  } as never)
  vi.spyOn(ctx.powSolver, "solve").mockResolvedValue("nonce")
  const commentsApi = new CommentsClient(ctx)
  const reactionsApi = new ReactionsClient(ctx)
  const pollsApi = new PollsClient(ctx)
  const feature = new CommentsFeature(
    commentsApi,
    reactionsApi,
    pollsApi,
    new EntityCache(),
    new PageView(),
    new PendingOperation(),
    {
      page: opts.page,
      perPage: opts.perPage,
      getIdentity: () => ({ publicKey: "pk" }),
      siteId: "s",
      pageSlug: "p",
    },
  )
  return { ctx, commentsApi, reactionsApi, pollsApi, feature }
}

describe("CommentsFeature - initial load", () => {
  it("query replaces PageView", async () => {
    const { feature } = makeFeature()
    const msg1 = makeMessage({ event_id: "$1" })
    const msg2 = makeMessage({ event_id: "$2" })
    server.use(
      http.all("https://example.com/*", async ({ request }) => {
        const url = new URL(request.url)
        if (url.pathname.includes("/comments")) {
          return HttpResponse.json({
            data: [msg1, msg2],
            meta: { total: 2, page: 1, per_page: 20, total_pages: 1 },
          })
        }
        return HttpResponse.json({})
      }),
    )
    await feature.loadPage({ page: 1 })
    expect(feature.pageMessages.map((m) => m.event_id)).toEqual(["$1", "$2"])
    expect(feature.snapshot().meta?.total).toBe(2)
  })

  it("entity cache survives page switch", async () => {
    const { feature } = makeFeature()
    const msg1 = makeMessage({ event_id: "$1" })
    const msg2 = makeMessage({ event_id: "$2" })
    server.use(
      http.all("https://example.com/*", async ({ request }) => {
        const url = new URL(request.url)
        if (url.pathname.includes("/comments")) {
          const body = await request.text().then((t) => {
            try {
              return JSON.parse(t)
            } catch {
              return {}
            }
          })
          const page = (body as any).page ?? 1
          if (page === 1)
            return HttpResponse.json({
              data: [msg1],
              meta: { total: 2, page: 1, per_page: 1, total_pages: 2 },
            })
          return HttpResponse.json({
            data: [msg2],
            meta: { total: 2, page: 2, per_page: 1, total_pages: 2 },
          })
        }
        return HttpResponse.json({})
      }),
    )
    await feature.loadPage({ page: 1, perPage: 1 })
    expect(feature.getMessage("$1")).toBeDefined()
    await feature.loadPage({ page: 2, perPage: 1 })
    expect(feature.getMessage("$1")).toBeDefined() // still in cache
    expect(feature.pageMessages[0].event_id).toBe("$2")
  })

  it("perPage change", async () => {
    const { feature } = makeFeature({ perPage: 20 })
    server.use(
      http.all("https://example.com/*", async () =>
        HttpResponse.json({ data: [], meta: { total: 0, page: 1, per_page: 10, total_pages: 0 } }),
      ),
    )
    await feature.loadPage({ perPage: 10 })
    expect(feature.snapshot().meta?.per_page).toBe(10)
  })

  it("pending single slot", async () => {
    const { feature } = makeFeature()
    // Mock comments create to return submission_id
    const ctx = new ClientContext({
      endpoint: "https://example.com",
      siteId: "s",
      pageSlug: "p",
      identity: { publicKey: "pk", privateKey: "sk" } as never,
    })
    vi.spyOn(ctx.challengeManager, "get").mockResolvedValue({
      prefix: "test.",
      difficulty: 1,
    } as never)
    vi.spyOn(ctx.powSolver, "solve").mockResolvedValue("nonce")
    const commentsApi = new CommentsClient(ctx)
    const reactionsApi = new ReactionsClient(ctx)
    const pollsApi = new PollsClient(ctx)
    const f = new CommentsFeature(
      commentsApi,
      reactionsApi,
      pollsApi,
      new EntityCache(),
      new PageView(),
      new PendingOperation(),
      { getIdentity: () => ({ publicKey: "pk" }) },
    )
    server.use(
      http.post("https://example.com/api/v1/sites/s/pages/p/comments", async () =>
        HttpResponse.json({ submission_id: 1 }),
      ),
      http.all("https://example.com/*", async ({ request }) => {
        const url = new URL(request.url)
        if (url.pathname.includes("/comments") && request.method === "QUERY") {
          return HttpResponse.json({
            data: [],
            meta: { total: 0, page: 1, per_page: 20, total_pages: 0 },
          })
        }
        return HttpResponse.json({})
      }),
    )
    // Mock sign
    const mod = await import("../identity/signing")
    vi.spyOn(mod, "signMessage").mockResolvedValue("sig")
    await f.submit("hello", { displayName: "A", replyTo: null, threadRoot: null })
    expect(f.snapshot().pending).not.toBeNull()
    await expect(
      f.submit("second", { displayName: "A", replyTo: null, threadRoot: null }),
    ).rejects.toThrow()
    expect(f.snapshot().pending?.submissionId).toBe(1)
  })

  it("REACT/VOTE never occupy pending", async () => {
    const { feature } = makeFeature()
    server.use(
      http.post("https://example.com/api/v1/sites/s/pages/p/comments/:id/reactions", () =>
        HttpResponse.json({}),
      ),
      http.delete("https://example.com/api/v1/sites/s/pages/p/comments/:id/reactions/:key", () =>
        HttpResponse.json({}),
      ),
      http.post("https://example.com/api/v1/sites/s/pages/p/polls/:id/votes", () =>
        HttpResponse.json({}),
      ),
      http.all("https://example.com/*", async ({ request }) => {
        if (request.method === "QUERY")
          return HttpResponse.json({
            data: [],
            meta: { total: 0, page: 1, per_page: 20, total_pages: 0 },
          })
        return HttpResponse.json({})
      }),
    )
    const mod = await import("../identity/signing")
    vi.spyOn(mod, "signMessage").mockResolvedValue("sig")
    await feature.toggleReaction("$1", "👍", false)
    expect(feature.snapshot().pending).toBeNull()
    await feature.votePoll("$poll", "opt1")
    expect(feature.snapshot().pending).toBeNull()
  })

  it("reconcile message_created prepends", () => {
    const { feature } = makeFeature()
    const msg = makeMessage({ event_id: "$1" })
    feature.reconcile({
      type: "message_created",
      payload: { site_id: "s", page_slug: "p", message: msg },
    } as any)
    expect(feature.pageMessages[0].event_id).toBe("$1")
  })

  it("reconcile message_deleted tombstone", () => {
    const { feature } = makeFeature()
    const msg = makeMessage({ event_id: "$1" })
    feature.reconcile({
      type: "message_created",
      payload: { site_id: "s", page_slug: "p", message: msg },
    } as any)
    feature.reconcile({
      type: "message_deleted",
      payload: { site_id: "s", page_slug: "p", event_id: "$1" },
    } as any)
    expect(feature.pageMessages.length).toBe(0)
    expect(feature.getMessage("$1")?.status).toBe("redacted")
  })

  it("reconcile annotations_changed ignored if not exists", () => {
    const { feature } = makeFeature()
    const msg = makeMessage({ event_id: "$1" })
    feature.reconcile({
      type: "message_annotations_changed",
      payload: { site_id: "s", page_slug: "p", message: msg },
    } as any)
    expect(feature.getMessage("$1")).toBeUndefined()
  })

  it("GET authoritative overwrites SSE", async () => {
    const { feature } = makeFeature()
    const sseMsg = makeMessage({ event_id: "$s" })
    feature.reconcile({
      type: "message_created",
      payload: { site_id: "s", page_slug: "p", message: sseMsg },
    } as any)
    expect(feature.pageMessages[0].event_id).toBe("$s")
    const serverMsg = makeMessage({ event_id: "$g" })
    server.use(
      http.all("https://example.com/*", async () =>
        HttpResponse.json({
          data: [serverMsg],
          meta: { total: 1, page: 1, per_page: 20, total_pages: 1 },
        }),
      ),
    )
    await feature.loadPage({ page: 1 })
    expect(feature.pageMessages[0].event_id).toBe("$g")
  })

  it("message_created current page: entity and order prepend", () => {
    const { feature } = makeFeature()
    // Configure with s/p
    feature.configurePageContext("s", "p")
    const msg = makeMessage({ event_id: "$new", site_id: "s", page_slug: "p" })
    feature.reconcile({
      type: "message_created",
      payload: { site_id: "s", page_slug: "p", message: msg },
    } as any)
    expect(feature.getMessage("$new")).toBeDefined()
    expect(feature.pageMessages[0].event_id).toBe("$new")
  })

  it("message_created different page: entity only, order unchanged", () => {
    const { feature } = makeFeature()
    feature.configurePageContext("s", "p")
    const initial = makeMessage({ event_id: "$old", site_id: "s", page_slug: "p" })
    feature.reconcile({
      type: "message_created",
      payload: { site_id: "s", page_slug: "p", message: initial },
    } as any)
    expect(feature.pageMessages.length).toBe(1)
    const other = makeMessage({ event_id: "$other", site_id: "s", page_slug: "other-page" })
    feature.reconcile({
      type: "message_created",
      payload: { site_id: "s", page_slug: "other-page", message: other },
    } as any)
    expect(feature.getMessage("$other")).toBeDefined()
    expect(feature.pageMessages.length).toBe(1)
    expect(feature.pageMessages[0].event_id).toBe("$old")
  })

  it("message_created different site: entity only", () => {
    const { feature } = makeFeature()
    feature.configurePageContext("s", "p")
    const msg = makeMessage({ event_id: "$x", site_id: "other-site", page_slug: "p" })
    feature.reconcile({
      type: "message_created",
      payload: { site_id: "other-site", page_slug: "p", message: msg },
    } as any)
    expect(feature.getMessage("$x")).toBeDefined()
    expect(feature.pageMessages.length).toBe(0)
  })

  it("duplicate message_created does not duplicate order", () => {
    const { feature } = makeFeature()
    feature.configurePageContext("s", "p")
    const msg = makeMessage({ event_id: "$dup", site_id: "s", page_slug: "p" })
    feature.reconcile({
      type: "message_created",
      payload: { site_id: "s", page_slug: "p", message: msg },
    } as any)
    feature.reconcile({
      type: "message_created",
      payload: { site_id: "s", page_slug: "p", message: msg },
    } as any)
    expect(feature.pageMessages.length).toBe(1)
  })

  it("message_updated unknown does not create order entry", () => {
    const { feature } = makeFeature()
    feature.configurePageContext("s", "p")
    const msg = makeMessage({ event_id: "$unknown", site_id: "s", page_slug: "p" })
    feature.reconcile({
      type: "message_updated",
      payload: { site_id: "s", page_slug: "p", message: msg },
    } as any)
    expect(feature.getMessage("$unknown")).toBeDefined()
    expect(feature.pageMessages.length).toBe(0)
  })

  it("rebindApis updates internal clients - subsequent operation uses new API", async () => {
    const { feature } = makeFeature()
    const newCtx = new ClientContext({
      endpoint: "https://example.com",
      siteId: "s2",
      pageSlug: "p2",
      identity: { publicKey: "pk", privateKey: "sk" } as never,
    })
    const newCommentsApi = new CommentsClient(newCtx)
    const newReactionsApi = new ReactionsClient(newCtx)
    const newPollsApi = new PollsClient(newCtx)
    const spyNew = vi.spyOn(newCommentsApi, "list").mockResolvedValue({
      data: [makeMessage({ event_id: "$rebound" })],
      meta: { total: 1, page: 1, per_page: 20, total_pages: 1 },
    })
    feature.rebindApis({
      commentsApi: newCommentsApi,
      reactionsApi: newReactionsApi,
      pollsApi: newPollsApi,
    })
    feature.configurePageContext("s2", "p2")
    await feature.loadPage({ page: 1 })
    expect(spyNew).toHaveBeenCalled()
    expect(feature.pageMessages[0].event_id).toBe("$rebound")
    spyNew.mockRestore()
  })

  it("stale query cannot overwrite newer", async () => {
    const { feature } = makeFeature()
    let resolveFirst!: (value?: unknown) => void
    let firstPromise: Promise<any> | null = null
    server.use(
      http.all("https://example.com/*", async ({ request }) => {
        const url = new URL(request.url)
        if (url.pathname.includes("/comments")) {
          const body = await request.text().then((t) => {
            try {
              return JSON.parse(t)
            } catch {
              return {}
            }
          })
          const page = (body as any).page
          if (page === 1 && !firstPromise) {
            firstPromise = new Promise((r) => (resolveFirst = r))
            await firstPromise
            return HttpResponse.json({
              data: [makeMessage({ event_id: "$old" })],
              meta: { total: 1, page: 1, per_page: 20, total_pages: 1 },
            })
          }
          return HttpResponse.json({
            data: [makeMessage({ event_id: "$new" })],
            meta: { total: 1, page: 1, per_page: 20, total_pages: 1 },
          })
        }
        return HttpResponse.json({})
      }),
    )
    const p1 = feature.loadPage({ page: 1 })
    await new Promise((r) => setTimeout(r, 10))
    const p2 = feature.loadPage({ page: 1 })
    await p2
    resolveFirst()
    await p1.catch(() => {})
    await new Promise((r) => setTimeout(r, 10))
    expect(feature.pageMessages[0].event_id).toBe("$new")
  })
})
