import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SseTransport } from "./sse-transport"

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

describe("SseTransport", () => {
  let orig: typeof globalThis.EventSource
  beforeEach(() => {
    orig = globalThis.EventSource
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource
  })
  afterEach(() => {
    globalThis.EventSource = orig
  })

  it("connect and dedupe seenIds", async () => {
    const onEvent = vi.fn()
    const transport = new SseTransport({ endpoint: "https://ex.com", siteId: "s", pageSlug: "p" })
    transport.connect(onEvent)
    await new Promise((r) => setTimeout(r, 10))
    const es = (transport as unknown as { es: MockEventSource }).es as unknown as MockEventSource
    es.dispatch("message_created", { type: "message_created", payload: {} }, "id1")
    expect(onEvent).toHaveBeenCalledTimes(1)
    es.dispatch("message_created", { type: "message_created", payload: {} }, "id1")
    expect(onEvent).toHaveBeenCalledTimes(1)
  })

  it("stale callback ignored after close and reconnect", async () => {
    const onEvent = vi.fn()
    const transport = new SseTransport({ endpoint: "https://ex.com", siteId: "s", pageSlug: "p" })
    transport.connect(onEvent)
    await new Promise((r) => setTimeout(r, 10))
    const firstEs = (transport as unknown as { es: MockEventSource })
      .es as unknown as MockEventSource
    transport.close()
    transport.connect(onEvent)
    await new Promise((r) => setTimeout(r, 10))
    // Old callback should not trigger
    firstEs.dispatch("message_created", { type: "message_created", payload: {} }, "old")
    expect(onEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: "message_created" }))
  })

  it("seenIds LRU 500", async () => {
    const onEvent = vi.fn()
    const transport = new SseTransport({ endpoint: "https://ex.com", siteId: "s", pageSlug: "p" })
    transport.connect(onEvent)
    await new Promise((r) => setTimeout(r, 10))
    const es = (transport as unknown as { es: MockEventSource }).es as unknown as MockEventSource
    for (let i = 0; i < 501; i++) {
      es.dispatch("message_created", { type: "message_created", payload: {} }, `id${i}`)
    }
    expect((transport as unknown as { seenIds: Set<string> }).seenIds.size).toBe(500)
    transport.close()
  })

  it("close cancels reconnect", async () => {
    const onEvent = vi.fn()
    const transport = new SseTransport({ endpoint: "https://ex.com", siteId: "s", pageSlug: "p" })
    transport.connect(onEvent)
    await new Promise((r) => setTimeout(r, 10))
    const es = (transport as unknown as { es: MockEventSource }).es as unknown as MockEventSource
    // Simulate error to trigger reconnect
    es.onerror?.()
    expect((transport as unknown as { reconnectTimer: unknown }).reconnectTimer).not.toBeNull()
    transport.close()
    expect((transport as unknown as { reconnectTimer: unknown }).reconnectTimer).toBeNull()
  })

  it("setEndpoint updates", () => {
    const transport = new SseTransport({ endpoint: "https://ex.com", siteId: "s", pageSlug: "p" })
    transport.setEndpoint("https://new.com")
    expect((transport as unknown as { endpoint: string }).endpoint).toBe("https://new.com")
    transport.close()
  })
})
