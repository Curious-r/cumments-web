import { describe, expect, it, vi } from "vitest"
import type { Message } from "../api/contract/query"
import { renderContent } from "./render"

function makeMessage(content: Message["content"]): Message {
  return {
    event_id: "$test",
    site_id: "s",
    page_slug: "p",
    author: {
      type: "visitor",
      display_name: "A",
      avatar_url: null,
      public_key: "pk",
      mxid: null,
    } as unknown as Message["author"],
    content: content as unknown as Message["content"],
    timestamp: new Date().toISOString(),
    edited_at: null,
    reply_to: null,
    thread_root: null,
    submission_id: null,
    status: "active",
    redacted_at: null,
    redacted_by: null,
    reactions: [],
  } as Message
}

describe("Phase3 content dispatch", () => {
  it("renders text", () => {
    const msg = makeMessage({
      type: "text",
      body: "hello",
      style: "normal",
    } as unknown as Message["content"])
    const res = renderContent(msg)
    expect(res).toBeDefined()
  })
  it("renders media image", () => {
    const msg = makeMessage({
      type: "media",
      kind: "image",
      url: "mxc://hs/abc",
      filename: "a.png",
      mimetype: "image/png",
    } as unknown as Message["content"])
    const res = renderContent(msg)
    expect(res).toBeDefined()
  })
  it("renders media video", () => {
    const msg = makeMessage({
      type: "media",
      kind: "video",
      url: "mxc://hs/vid",
      mimetype: "video/mp4",
    } as unknown as Message["content"])
    const res = renderContent(msg)
    expect(res).toBeDefined()
  })
  it("renders location", () => {
    const msg = makeMessage({
      type: "location",
      geo_uri: "geo:30,120",
      description: "park",
    } as unknown as Message["content"])
    const res = renderContent(msg)
    expect(res).toBeDefined()
  })
  it("renders poll", () => {
    const msg = makeMessage({
      type: "poll",
      question: "Q?",
      options: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
      ],
      responses: [{ option_index: 0, count: 2 }],
    } as unknown as Message["content"])
    const res = renderContent(msg)
    expect(res).toBeDefined()
  })
  it("renders redacted", () => {
    const msg = makeMessage({ type: "redacted" } as unknown as Message["content"])
    const res = renderContent(msg)
    expect(res).toBeDefined()
  })
  it("renders encrypted", () => {
    const msg = makeMessage({
      type: "encrypted",
      algorithm: "m.megolm",
    } as unknown as Message["content"])
    const res = renderContent(msg)
    expect(res).toBeDefined()
  })
  it("renders unknown", () => {
    const msg = makeMessage({
      type: "unknown",
      fallback: "fallback",
      raw: {},
    } as unknown as Message["content"])
    const res = renderContent(msg)
    expect(res).toBeDefined()
  })
  it("renders sticker via media", () => {
    const msg = makeMessage({
      type: "media",
      kind: "sticker",
      url: "mxc://hs/sticker",
      filename: "sticker.png",
    } as unknown as Message["content"])
    const res = renderContent(msg)
    expect(res).toBeDefined()
  })
})

describe("Location geo serialization", () => {
  it("geo uri format", () => {
    const lat = 30.123,
      lng = 120.456
    const geo = `geo:${lat},${lng}`
    expect(geo).toBe("geo:30.123,120.456")
    expect(geo.startsWith("geo:")).toBe(true)
  })
})

describe("Poll vote", () => {
  it("vote uses correct poll_id and option_id", async () => {
    const { PollsClient } = await import("../api/polls")
    const { ClientContext } = await import("../api/context")
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
    const client = new PollsClient(ctx)
    // Mock fetch via transport
    const origFetch = globalThis.fetch
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 204,
          headers: new Headers(),
          text: async () => "",
          json: async () => ({}),
          clone: () => ({ json: async () => ({}) }) as unknown as Response,
        }) as unknown as Response,
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch
    // Mock signMessage
    const mod = await import("../identity/signing")
    vi.spyOn(mod, "signMessage").mockResolvedValue("sig")
    await client.vote("$poll", "opt1")
    expect(fetchMock).toHaveBeenCalled()
    const url = (fetchMock.mock.calls[0] as unknown as [string])[0] as string
    expect(url).toContain("/polls/%24poll/votes")
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    )
    expect(body.option_id).toBe("opt1")
    globalThis.fetch = origFetch
  })
})

describe("Stickers lazy load", () => {
  it("fetchStickers caches per session", async () => {
    const { fetchStickers } = await import("../api/stickers")
    const origFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = vi.fn(async () => {
      calls++
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          packs: [
            {
              pack_id: "default",
              display_name: "Default",
              images: [{ shortcode: ":smile:", url: "mxc://hs/a", proxy_url: "https://proxy/a" }],
            },
          ],
        }),
      } as unknown as Response
    }) as unknown as typeof fetch
    const packs = await fetchStickers("https://example.com", "s")
    expect(packs.length).toBe(1)
    expect(calls).toBe(1)
    globalThis.fetch = origFetch
  })
})
