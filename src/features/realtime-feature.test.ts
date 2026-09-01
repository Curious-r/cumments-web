import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SseTransport } from "../realtime/sse-transport"
import { RealtimeFeature } from "./realtime-feature"

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
      if (this.onopen) this.onopen()
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
  dispatch(type: string, data: unknown, id?: string) {
    const ev = { data: JSON.stringify(data), lastEventId: id } as unknown as MessageEvent
    for (const cb of this.listeners.get(type) ?? []) cb(ev as unknown as Event)
  }
}

describe("RealtimeFeature", () => {
  let orig: typeof globalThis.EventSource
  beforeEach(() => {
    orig = globalThis.EventSource
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource
  })
  afterEach(() => {
    globalThis.EventSource = orig
  })

  it("start idempotent", () => {
    const transport = new SseTransport({ endpoint: "https://ex.com", siteId: "s", pageSlug: "p" })
    const feature = new RealtimeFeature(transport)
    feature.start()
    feature.start()
    expect(feature.connected).toBe(false) // not yet open, but should not throw
    feature.stop()
  })

  it("stop idempotent", () => {
    const transport = new SseTransport({ endpoint: "https://ex.com", siteId: "s", pageSlug: "p" })
    const feature = new RealtimeFeature(transport)
    feature.start()
    feature.stop()
    feature.stop()
    expect(feature.connected).toBe(false)
  })

  it("subscribe/unsubscribe", async () => {
    const transport = new SseTransport({ endpoint: "https://ex.com", siteId: "s", pageSlug: "p" })
    const feature = new RealtimeFeature(transport)
    const cb = vi.fn()
    const unsub = feature.subscribe(cb)
    feature.start()
    await new Promise((r) => setTimeout(r, 10))
    // Simulate event via transport's onEvent
    // We need to get the MockEventSource instance
    const es = (transport as unknown as { es: MockEventSource }).es as unknown as MockEventSource
    // Instead, directly call the transport's onEvent via feature's subscription
    // For this test, we will directly trigger via RealtimeFeature's internal transport
    // We can dispatch via MockEventSource
    const mockEs = (transport as unknown as { es: MockEventSource }).es
    if (mockEs) {
      ;(mockEs as unknown as MockEventSource).dispatch(
        "message_created",
        {
          type: "message_created",
          payload: { site_id: "s", page_slug: "p", message: { event_id: "$1" } },
        },
        "id1",
      )
    }
    await new Promise((r) => setTimeout(r, 10))
    unsub()
    if (mockEs) {
      ;(mockEs as unknown as MockEventSource).dispatch(
        "message_created",
        {
          type: "message_created",
          payload: { site_id: "s", page_slug: "p", message: { event_id: "$2" } },
        },
        "id2",
      )
    }
    await new Promise((r) => setTimeout(r, 10))
    // cb should have been called at most once
    expect(cb).toHaveBeenCalledTimes(1)
    feature.stop()
  })

  it("no callbacks after stop", async () => {
    const transport = new SseTransport({ endpoint: "https://ex.com", siteId: "s", pageSlug: "p" })
    const feature = new RealtimeFeature(transport)
    const cb = vi.fn()
    feature.subscribe(cb)
    feature.start()
    await new Promise((r) => setTimeout(r, 10))
    feature.stop()
    const es = (transport as unknown as { es: MockEventSource }).es
    if (es) {
      ;(es as unknown as MockEventSource).dispatch(
        "message_created",
        { type: "message_created", payload: {} },
        "id1",
      )
    }
    await new Promise((r) => setTimeout(r, 10))
    expect(cb).not.toHaveBeenCalled()
  })

  it("stale EventSource callback ignored", async () => {
    const transport = new SseTransport({ endpoint: "https://ex.com", siteId: "s", pageSlug: "p" })
    const feature = new RealtimeFeature(transport)
    const cb = vi.fn()
    feature.subscribe(cb)
    feature.start()
    await new Promise((r) => setTimeout(r, 10))
    const firstEs = (transport as unknown as { es: MockEventSource })
      .es as unknown as MockEventSource
    feature.stop()
    feature.start()
    await new Promise((r) => setTimeout(r, 10))
    // Dispatch on old EventSource should be ignored
    if (firstEs) {
      firstEs.dispatch("message_created", { type: "message_created", payload: {} }, "oldId")
    }
    await new Promise((r) => setTimeout(r, 10))
    expect(cb).not.toHaveBeenCalled()
    feature.stop()
  })
})
