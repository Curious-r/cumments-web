import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { ClientContext } from "../api/context"
import { VisitorsClient } from "../api/visitors"
import { ProfileFeature } from "./profile-feature"

const server = setupServer()
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function makeProfileFeature() {
  const ctx = new ClientContext({
    endpoint: "https://example.com",
    siteId: "s",
    pageSlug: "p",
    identity: null,
  })
  vi.spyOn(ctx.challengeManager, "get").mockResolvedValue({
    prefix: "pfx.",
    difficulty: 0,
  } as never)
  vi.spyOn(ctx.powSolver, "solve").mockResolvedValue("0")
  const visitors = new VisitorsClient(ctx)
  const feature = new ProfileFeature(visitors)
  return { ctx, visitors, feature }
}

describe("ProfileFeature - cache", () => {
  beforeEach(() => vi.restoreAllMocks())

  it("cache hit within TTL does not re-fetch", async () => {
    let callCount = 0
    server.use(
      http.get("https://example.com/api/v1/sites/s/visitors/profile", () => {
        callCount++
        return HttpResponse.json({ visitor_id: "v1", display_name: "Alice", avatar_url: null })
      }),
    )
    const { feature } = makeProfileFeature()
    const p1 = await feature.fetch("pk1")
    expect(p1.display_name).toBe("Alice")
    expect(callCount).toBe(1)
    const p2 = await feature.fetch("pk1")
    expect(p2.display_name).toBe("Alice")
    expect(callCount).toBe(1) // cached
  })

  it("TTL expiry forces re-fetch", async () => {
    let callCount = 0
    server.use(
      http.get("https://example.com/api/v1/sites/s/visitors/profile", () => {
        callCount++
        return HttpResponse.json({ visitor_id: "v1", display_name: "Bob", avatar_url: null })
      }),
    )
    const { feature } = makeProfileFeature()
    await feature.fetch("pk1")
    expect(callCount).toBe(1)
    // expire by manipulating private cache expires? Instead use fake timer.
    // Directly mutate cache expiry to past
    const cache = (feature as unknown as { cache: Map<string, { expires: number }> }).cache
    const entry = cache.get("pk1")
    if (entry) entry.expires = Date.now() - 1
    await feature.fetch("pk1")
    expect(callCount).toBe(2)
  })

  it("force refresh bypasses cache", async () => {
    let callCount = 0
    server.use(
      http.get("https://example.com/api/v1/sites/s/visitors/profile", () => {
        callCount++
        return HttpResponse.json({ visitor_id: "v1", display_name: "Carol", avatar_url: null })
      }),
    )
    const { feature } = makeProfileFeature()
    await feature.fetch("pk1")
    expect(callCount).toBe(1)
    await feature.fetch("pk1", true)
    expect(callCount).toBe(2)
  })

  it("refreshCurrent(null) clears current", async () => {
    server.use(
      http.get("https://example.com/api/v1/sites/s/visitors/profile", () =>
        HttpResponse.json({ visitor_id: "v1", display_name: "Dave", avatar_url: null }),
      ),
    )
    const { feature } = makeProfileFeature()
    await feature.refreshCurrent("pk1")
    expect(feature.current?.display_name).toBe("Dave")
    await feature.refreshCurrent(null)
    expect(feature.current).toBeNull()
  })

  it("identity A -> B current switch updates projection", async () => {
    server.use(
      http.get("https://example.com/api/v1/sites/s/visitors/profile", ({ request }) => {
        const url = new URL(request.url)
        const pk = url.searchParams.get("author_public_key")
        if (pk === "pkA")
          return HttpResponse.json({ visitor_id: "vA", display_name: "Alice", avatar_url: null })
        if (pk === "pkB")
          return HttpResponse.json({ visitor_id: "vB", display_name: "Bob", avatar_url: null })
        return HttpResponse.json({ visitor_id: "", display_name: null, avatar_url: null })
      }),
    )
    const { feature } = makeProfileFeature()
    await feature.refreshCurrent("pkA")
    expect(feature.current?.display_name).toBe("Alice")
    await feature.refreshCurrent("pkB")
    expect(feature.current?.display_name).toBe("Bob")
    // Cache should have both
    await feature.fetch("pkA")
    // Should be cached, no extra fetch needed (callCount not tracked, but at least current switched)
  })

  it("404 returns fallback profile and caches it", async () => {
    server.use(
      http.get(
        "https://example.com/api/v1/sites/s/visitors/profile",
        () => new HttpResponse(null, { status: 404 }),
      ),
    )
    const { feature } = makeProfileFeature()
    const p = await feature.fetch("unknown")
    expect(p.visitor_id).toBe("")
    expect(p.display_name).toBeNull()
    // 404 fallback should be cached? Check second fetch still returns same without hitting 404 again within TTL
    // Our implementation caches the fallback profile as well
    let secondHit = false
    server.use(
      http.get("https://example.com/api/v1/sites/s/visitors/profile", () => {
        secondHit = true
        return HttpResponse.json({
          visitor_id: "v2",
          display_name: "ShouldNotHit",
          avatar_url: null,
        })
      }),
    )
    const p2 = await feature.fetch("unknown")
    expect(p2.visitor_id).toBe("")
    expect(secondHit).toBe(false)
  })
})

describe("ProfileFeature - avatar", () => {
  beforeEach(() => vi.restoreAllMocks())

  it("setAvatar uploads via VisitorsClient and refreshes", async () => {
    let avatarCalled = false
    let profileFetchCount = 0
    server.use(
      http.put("https://example.com/api/v1/sites/s/visitors/avatar", async () => {
        avatarCalled = true
        return HttpResponse.json({ avatar_url: "https://cdn/avatar.png" })
      }),
      http.get("https://example.com/api/v1/sites/s/visitors/profile", () => {
        profileFetchCount++
        return HttpResponse.json({
          visitor_id: "v1",
          display_name: "Alice",
          avatar_url: "https://cdn/avatar.png",
        })
      }),
    )
    const { generateRandomIdentity } = await import("./keypair")
    const id = await generateRandomIdentity()
    const ctx = new ClientContext({
      endpoint: "https://example.com",
      siteId: "s",
      pageSlug: "p",
      identity: id as never,
    })
    vi.spyOn(ctx.challengeManager, "get").mockResolvedValue({
      prefix: "pfx.",
      difficulty: 0,
    } as never)
    vi.spyOn(ctx.powSolver, "solve").mockResolvedValue("0")
    const visitors = new VisitorsClient(ctx)
    const feature = new ProfileFeature(visitors)
    await feature.refreshCurrent("pk1")
    expect(feature.current?.avatar_url).toBe("https://cdn/avatar.png")
    // Now set avatar
    const file = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" })
    await feature.setAvatar(file)
    expect(avatarCalled).toBe(true)
    expect(feature.current?.avatar_url).toBe("https://cdn/avatar.png")
    expect(profileFetchCount).toBeGreaterThanOrEqual(2)
  })

  it("deleteAvatar clears and refreshes", async () => {
    let deleteCalled = false
    server.use(
      http.delete("https://example.com/api/v1/sites/s/visitors/avatar", () => {
        deleteCalled = true
        return new HttpResponse(null, { status: 204 })
      }),
      http.get("https://example.com/api/v1/sites/s/visitors/profile", () =>
        HttpResponse.json({ visitor_id: "v1", display_name: "Bob", avatar_url: null }),
      ),
    )
    const { generateRandomIdentity } = await import("./keypair")
    const id = await generateRandomIdentity()
    const ctx = new ClientContext({
      endpoint: "https://example.com",
      siteId: "s",
      pageSlug: "p",
      identity: id as never,
    })
    vi.spyOn(ctx.challengeManager, "get").mockResolvedValue({
      prefix: "pfx.",
      difficulty: 0,
    } as never)
    vi.spyOn(ctx.powSolver, "solve").mockResolvedValue("0")
    const visitors = new VisitorsClient(ctx)
    const feature = new ProfileFeature(visitors)
    await feature.refreshCurrent("pk1")
    await feature.deleteAvatar()
    expect(deleteCalled).toBe(true)
    expect(feature.current?.avatar_url).toBeNull()
  })

  it("current is projection not independent cache", async () => {
    server.use(
      http.get("https://example.com/api/v1/sites/s/visitors/profile", ({ request }) => {
        const url = new URL(request.url)
        const pk = url.searchParams.get("author_public_key")
        if (pk === "pkA")
          return HttpResponse.json({ visitor_id: "vA", display_name: "Alice", avatar_url: null })
        if (pk === "pkB")
          return HttpResponse.json({ visitor_id: "vB", display_name: "Bob", avatar_url: null })
        return HttpResponse.json({ visitor_id: "", display_name: null, avatar_url: null })
      }),
    )
    const { feature } = makeProfileFeature()
    await feature.fetch("pkA")
    expect(feature.current).toBeNull() // fetch alone does not set current
    await feature.refreshCurrent("pkA")
    expect(feature.current?.display_name).toBe("Alice")
    await feature.fetch("pkB")
    expect(feature.current?.display_name).toBe("Alice") // still A, because B not refreshed as current
    await feature.refreshCurrent("pkB")
    expect(feature.current?.display_name).toBe("Bob")
  })
})
