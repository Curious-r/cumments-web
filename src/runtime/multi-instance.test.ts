import { describe, expect, it, vi } from "vitest"
import type { StorageLike } from "../identity/storage"
import { AppRuntime } from "./app-runtime"

function makeStorage(): StorageLike {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    },
  } as unknown as StorageLike
}

function mockFetchForComments() {
  const orig = globalThis.fetch
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? (input as Request).url : input)
    if (url.includes("/api/v1/challenge")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ prefix: "test.", difficulty: 1 }),
        text: async () => "",
        clone: () =>
          ({ json: async () => ({ prefix: "test.", difficulty: 1 }) }) as unknown as Response,
      } as unknown as Response
    }
    if (url.includes("/comments") && init?.method === "QUERY") {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: [], meta: { total: 0, page: 1, per_page: 20, total_pages: 1 } }),
        text: async () => "",
        clone: () => ({ json: async () => ({}) }) as unknown as Response,
      } as unknown as Response
    }
    if (url.includes("/comments")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: [], meta: { total: 0, page: 1, per_page: 20, total_pages: 1 } }),
        text: async () => "",
        clone: () => ({ json: async () => ({}) }) as unknown as Response,
      } as unknown as Response
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({}),
      text: async () => "",
      clone: () => ({ json: async () => ({}) }) as unknown as Response,
    } as unknown as Response
  }) as unknown as typeof fetch
  return orig
}

class MockEventSource {
  static OPEN = 1
  url: string
  readyState = 0
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  listeners = new Map<string, Set<EventListener>>()
  constructor(url: string) {
    this.url = url
    setTimeout(() => {
      this.readyState = 1
      this.onopen?.()
    }, 0)
  }
  addEventListener(type: string, cb: EventListener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)?.add(cb)
  }
  removeEventListener() {}
  close() {
    this.readyState = 2
  }
}

describe("multi-instance isolation", () => {
  it("two runtimes have isolated EntityCache, PageView, pending, SSE", async () => {
    const origFetch = mockFetchForComments()
    const origES = globalThis.EventSource
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource

    const storage = makeStorage()
    const rtA = new AppRuntime(
      { endpoint: "https://example.com", siteId: "s", pageSlug: "a" },
      { storage },
    )
    const rtB = new AppRuntime(
      { endpoint: "https://example.com", siteId: "s", pageSlug: "b" },
      { storage },
    )

    expect(rtA).not.toBe(rtB)
    expect(rtA.comments).not.toBe(rtB.comments)
    // EntityCache isolation: loadPage for A should not affect B
    await rtA.start()
    await rtB.start()
    // Both have empty messages initially
    expect(rtA.comments.snapshot().messages.length).toBe(0)
    expect(rtB.comments.snapshot().messages.length).toBe(0)

    // Reconcile a message for A only
    const msgA = {
      type: "message_created",
      payload: {
        site_id: "s",
        page_slug: "a",
        message: {
          event_id: "$a1",
          site_id: "s",
          page_slug: "a",
          author: {
            type: "visitor",
            display_name: "A",
            avatar_url: null,
            public_key: "pk",
            mxid: null,
          },
          content: { type: "text", body: "hello A" },
          timestamp: new Date().toISOString(),
          edited_at: null,
          reply_to: null,
          thread_root: null,
          submission_id: null,
          status: "active",
          redacted_at: null,
          redacted_by: null,
          reactions: [],
        },
      },
    } as unknown as import("../api/contract/sse").SseData

    rtA.comments.reconcile(msgA)
    expect(rtA.comments.getMessage("$a1")).toBeDefined()
    expect(rtB.comments.getMessage("$a1")).toBeUndefined()
    expect(rtA.comments.snapshot().messages.length).toBe(1)
    expect(rtB.comments.snapshot().messages.length).toBe(0)

    // Pending isolation
    expect(rtA.comments.snapshot().pending).toBeNull()
    expect(rtB.comments.snapshot().pending).toBeNull()

    // SSE transport not shared (check via realtime instance)
    expect(rtA.realtime).not.toBe(rtB.realtime)
    const transportA = (rtA as unknown as { sseTransport: { seenIds: Set<string> } }).sseTransport
    const transportB = (rtB as unknown as { sseTransport: { seenIds: Set<string> } }).sseTransport
    expect(transportA).not.toBe(transportB)

    rtA.stop()
    rtB.stop()
    globalThis.fetch = origFetch
    globalThis.EventSource = origES
  })

  it("identity persistence can be shared but feature state not polluted", async () => {
    const storage = makeStorage()
    const rtA = new AppRuntime(
      { endpoint: "https://example.com", siteId: "s", pageSlug: "a" },
      { storage },
    )
    const rtB = new AppRuntime(
      { endpoint: "https://example.com", siteId: "s", pageSlug: "b" },
      { storage },
    )
    await rtA.start()
    await rtB.start()
    // Both share same storage, but their identity features are separate instances
    expect(rtA.identity).not.toBe(rtB.identity)
    // Add identity to A, should be visible to B via storage? Actually persistence is shared, but in-memory list is per-instance until reload
    // For v0.3, identity persistence is shared via localStorage, but feature state is per-runtime
    // So adding to A should not automatically appear in B
    const { generateRandomIdentity } = await import("../identity/keypair")
    const id = await generateRandomIdentity()
    rtA.identity.addIdentity(id)
    expect(rtA.identity.identities.length).toBeGreaterThan(0)
    // B's identities should not yet include the new one (isolated)
    expect(rtB.identity.identities.find((x) => x.publicKey === id.publicKey)).toBeUndefined()
    rtA.stop()
    rtB.stop()
  })
})
