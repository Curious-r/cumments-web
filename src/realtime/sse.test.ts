import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SseClient } from "./sse"

// Minimal EventSource mock
class MockEventSource {
  static OPEN = 1
  static CLOSED = 2
  static instances: MockEventSource[] = []
  url: string
  readyState = 0
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  listeners = new Map<string, Set<EventListener>>()
  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
    setTimeout(() => {
      this.readyState = 1
      this.onopen?.()
    }, 0)
  }
  addEventListener(type: string, cb: EventListener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)?.add(cb)
  }
  removeEventListener(type: string, cb: EventListener) {
    this.listeners.get(type)?.delete(cb)
  }
  close() {
    this.readyState = 2
  }
  dispatch(type: string, data: unknown, lastEventId?: string) {
    const event = { data: JSON.stringify(data), lastEventId } as MessageEvent
    for (const cb of this.listeners.get(type) ?? []) cb(event as unknown as Event)
  }
}

describe("SseClient", () => {
  let orig: typeof globalThis.EventSource
  beforeEach(() => {
    orig = globalThis.EventSource
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource
    MockEventSource.instances = []
  })
  afterEach(() => {
    globalThis.EventSource = orig
  })

  it("connects and handles message_created", async () => {
    const onEvent = vi.fn()
    const onStatus = vi.fn()
    const client = new SseClient({
      endpoint: "http://ex.com",
      siteId: "s",
      pageSlug: "p",
      onEvent,
      onStatus,
    })
    client.connect()
    await new Promise((r) => setTimeout(r, 10))
    expect(onStatus).toHaveBeenCalledWith(true)
    const es = MockEventSource.instances[0]
    es.dispatch(
      "message_created",
      {
        type: "message_created",
        payload: { site_id: "s", page_slug: "p", message: { event_id: "$1" } },
      },
      "id1",
    )
    expect(onEvent).toHaveBeenCalledTimes(1)
    // dedupe
    es.dispatch(
      "message_created",
      {
        type: "message_created",
        payload: { site_id: "s", page_slug: "p", message: { event_id: "$1" } },
      },
      "id1",
    )
    expect(onEvent).toHaveBeenCalledTimes(1)
  })

  it("close stops reconnect", async () => {
    const client = new SseClient({
      endpoint: "http://ex.com",
      siteId: "s",
      pageSlug: "p",
      onEvent: vi.fn(),
    })
    client.connect()
    await new Promise((r) => setTimeout(r, 10))
    client.close()
    expect(client.connected).toBe(false)
  })
})
