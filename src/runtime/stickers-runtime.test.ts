import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { StickerPack } from "../api/stickers"
import { HttpTransport } from "../api/transport"
import { AppRuntime } from "./app-runtime"

const STICKER_PACKS: StickerPack[] = [
  {
    pack_id: "pack1",
    display_name: "Test Pack",
    images: [{ shortcode: ":s1:", url: "https://example.com/s1.png" }],
  },
]

describe("Sticker runtime integration", () => {
  let origFetch: typeof fetch

  beforeEach(() => {
    origFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = origFetch
  })

  function mockFetch(packs: unknown[] | null = STICKER_PACKS) {
    globalThis.fetch = vi.fn(async () => {
      if (packs === null) {
        throw new Error("network error")
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ packs }),
        text: async () => "",
        clone: () => ({ json: async () => ({ packs }) }) as unknown as Response,
      } as unknown as Response
    }) as unknown as typeof fetch
  }

  it("Sticker client uses the shared HttpTransport from ClientContext", async () => {
    mockFetch()
    const runtime = new AppRuntime({
      endpoint: "https://comments.curious.host",
      siteId: "s",
      pageSlug: "p",
    })
    // Verify the transport is shared (not created per-request)
    const transport = (runtime as unknown as { clientContext: { transport: HttpTransport } })
      .clientContext.transport
    expect(transport).toBeInstanceOf(HttpTransport)
    // Start runtime to trigger sticker loading
    await runtime.start()
    await new Promise((r) => setTimeout(r, 100))
    // Stickers should be loaded
    expect(runtime.stickerPacks).toBeTruthy()
    expect(runtime.stickerPacks?.length).toBeGreaterThan(0)
    runtime.stop()
  })

  it("initial runtime creation: stickersClient uses initial clientContext", async () => {
    mockFetch()
    const runtime = new AppRuntime({
      endpoint: "https://example.com",
      siteId: "s",
      pageSlug: "p",
    })
    // Before start, stickersClient should be created with initial context
    const stickersClient = (runtime as unknown as { stickersClient: { ctx: unknown } })
      .stickersClient
    const clientContext = (runtime as unknown as { clientContext: unknown }).clientContext
    expect(stickersClient.ctx).toBe(clientContext)
    await runtime.start()
    await new Promise((r) => setTimeout(r, 100))
    expect(runtime.stickerPacks).toBeTruthy()
    runtime.stop()
  })

  it("AppRuntime.update() rebinds stickersClient to new context", async () => {
    mockFetch()
    const runtime = new AppRuntime({
      endpoint: "https://site-a.example.com",
      siteId: "siteA",
      pageSlug: "p",
    })
    await runtime.start()
    await new Promise((r) => setTimeout(r, 100))

    // Capture initial context and client
    const initialContext = (runtime as unknown as { clientContext: unknown }).clientContext
    const initialClient = (runtime as unknown as { stickersClient: { ctx: unknown } })
      .stickersClient
    expect(initialClient.ctx).toBe(initialContext)

    // Update to site B (triggers context rebuild)
    runtime.update({ endpoint: "https://site-b.example.com", siteId: "siteB" })

    // After update, context should be different
    const newContext = (runtime as unknown as { clientContext: unknown }).clientContext
    const newClient = (runtime as unknown as { stickersClient: { ctx: unknown } }).stickersClient

    // Verify context was replaced
    expect(newContext).not.toBe(initialContext)
    // Verify client was rebound to new context
    expect(newClient).not.toBe(initialClient)
    expect(newClient.ctx).toBe(newContext)

    runtime.stop()
  })

  it("subsequent Sticker request after update uses new context", async () => {
    mockFetch()
    const runtime = new AppRuntime({
      endpoint: "https://site-a.example.com",
      siteId: "siteA",
      pageSlug: "p",
    })
    await runtime.start()
    await new Promise((r) => setTimeout(r, 100))
    expect(runtime.stickerPacks).toBeTruthy()

    // Update to site B
    mockFetch([
      {
        pack_id: "pack-b",
        display_name: "Site B Pack",
        images: [{ shortcode: ":b:", url: "https://site-b.example.com/b.png" }],
      },
    ])
    runtime.update({ endpoint: "https://site-b.example.com", siteId: "siteB" })
    // Trigger a reload with the new context
    await (runtime as unknown as { loadStickers: () => Promise<void> }).loadStickers()
    await new Promise((r) => setTimeout(r, 100))
    // Should have loaded site B's packs
    expect(runtime.stickerPacks?.[0]?.pack_id).toBe("pack-b")
    runtime.stop()
  })

  it("stale Sticker request cannot overwrite state after AppRuntime.update()", async () => {
    let resolveFirst: (value: unknown) => void = () => {}
    let callCount = 0
    globalThis.fetch = vi.fn(async () => {
      callCount++
      if (callCount === 1) {
        // First call: delay resolution
        return new Promise((resolve) => {
          resolveFirst = resolve
        })
      }
      // Subsequent calls: immediate
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          packs: [
            {
              pack_id: `pack-${callCount}`,
              display_name: `Pack ${callCount}`,
              images: [],
            },
          ],
        }),
        text: async () => "",
        clone: () => ({ json: async () => ({}) }) as unknown as Response,
      } as unknown as Response
    }) as unknown as typeof fetch

    const runtime = new AppRuntime({
      endpoint: "https://example.com",
      siteId: "s",
      pageSlug: "p",
    })
    // Start runtime but don't await (stickers load async)
    const startPromise = runtime.start()
    // Let first request start but not resolve
    await new Promise((r) => setTimeout(r, 50))
    // Update context (increments configEpoch)
    runtime.update({ siteId: "s2" })
    // Resolve the stale first request
    resolveFirst({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        packs: [
          {
            pack_id: "stale-pack",
            display_name: "Stale",
            images: [],
          },
        ],
      }),
      text: async () => "",
      clone: () => ({ json: async () => ({}) }) as unknown as Response,
    })
    // Wait for start to complete and any async operations to settle
    await startPromise
    await new Promise((r) => setTimeout(r, 200))
    // Stale result should NOT have overwritten state
    expect(runtime.stickerPacks?.[0]?.pack_id).not.toBe("stale-pack")
    runtime.stop()
  }, 15000)

  it("stale Sticker request cannot update state after AppRuntime.stop()", async () => {
    let resolveFirst: (value: unknown) => void = () => {}
    let callCount = 0
    globalThis.fetch = vi.fn(async () => {
      callCount++
      if (callCount === 1) {
        return new Promise((resolve) => {
          resolveFirst = resolve
        })
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ packs: [] }),
        text: async () => "",
        clone: () => ({ json: async () => ({}) }) as unknown as Response,
      } as unknown as Response
    }) as unknown as typeof fetch

    const runtime = new AppRuntime({
      endpoint: "https://example.com",
      siteId: "s",
      pageSlug: "p",
    })
    // Start runtime but don't await
    const startPromise = runtime.start()
    await new Promise((r) => setTimeout(r, 50))
    // Stop runtime immediately
    runtime.stop()
    // Now resolve the stale request
    resolveFirst({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        packs: [
          {
            pack_id: "stale-after-stop",
            display_name: "Stale",
            images: [],
          },
        ],
      }),
      text: async () => "",
      clone: () => ({ json: async () => ({}) }) as unknown as Response,
    })
    // Wait for any async operations to settle
    await startPromise.catch(() => {}) // start may reject after stop
    await new Promise((r) => setTimeout(r, 200))
    // State should not be updated after stop
    expect(runtime.stickerPacks?.[0]?.pack_id).not.toBe("stale-after-stop")
  }, 15000)

  it("successful Sticker loading works through runtime", async () => {
    mockFetch()
    const runtime = new AppRuntime({
      endpoint: "https://example.com",
      siteId: "s",
      pageSlug: "p",
    })
    await runtime.start()
    await new Promise((r) => setTimeout(r, 100))
    expect(runtime.stickerLoading).toBe(false)
    expect(runtime.stickerPacks).toEqual(STICKER_PACKS)
    expect(runtime.stickerError).toBeNull()
    runtime.stop()
  })

  it("empty response produces usable empty state", async () => {
    mockFetch([])
    const runtime = new AppRuntime({
      endpoint: "https://example.com",
      siteId: "s",
      pageSlug: "p",
    })
    await runtime.start()
    await new Promise((r) => setTimeout(r, 100))
    expect(runtime.stickerLoading).toBe(false)
    expect(runtime.stickerPacks).toEqual([])
    expect(runtime.stickerError).toBeNull()
    runtime.stop()
  })

  it("failed request produces usable failure state", async () => {
    mockFetch(null) // triggers error
    const runtime = new AppRuntime({
      endpoint: "https://example.com",
      siteId: "s",
      pageSlug: "p",
    })
    await runtime.start()
    await new Promise((r) => setTimeout(r, 100))
    expect(runtime.stickerLoading).toBe(false)
    expect(runtime.stickerPacks).toBeNull()
    expect(runtime.stickerError).toBeTruthy()
    runtime.stop()
  })
})
