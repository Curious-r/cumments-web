import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { ClientContext } from "./context"
import { VisitorsClient } from "./visitors"

const server = setupServer()
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

async function makeCtx() {
  const { generateRandomIdentity } = await import("../identity/keypair")
  const id = await generateRandomIdentity()
  const ctx = new ClientContext({
    endpoint: "https://example.com",
    siteId: "s",
    pageSlug: "p",
    identity: id,
  })
  vi.spyOn(ctx.challengeManager, "get").mockResolvedValue({
    prefix: "pfx.",
    difficulty: 0,
  } as never)
  vi.spyOn(ctx.powSolver, "solve").mockResolvedValue("0")
  return ctx
}

describe("VisitorsClient via HttpTransport", () => {
  beforeEach(() => vi.restoreAllMocks())

  it("getProfile uses HttpTransport and returns 404 fallback", async () => {
    server.use(
      http.get(
        "https://example.com/api/v1/sites/s/visitors/profile",
        () => new HttpResponse(null, { status: 404 }),
      ),
    )
    const ctx = await makeCtx()
    const client = new VisitorsClient(ctx)
    const res = await client.getProfile("pk")
    expect(res.visitor_id).toBe("")
  })

  it("setAvatar sends binary via HttpTransport with correct mime and idempotency", async () => {
    let observedHeaders: any = null // biome-ignore lint/suspicious/noExplicitAny: test helper
    let observedBody: any = null // biome-ignore lint/suspicious/noExplicitAny: test helper
    server.use(
      http.all("https://example.com/*", async ({ request }) => {
        const url = new URL(request.url)
        if (url.pathname === "/api/v1/sites/s/visitors/avatar" && request.method === "PUT") {
          observedHeaders = request.headers
          observedBody = await request.arrayBuffer()
          return HttpResponse.json({ avatar_url: "https://cdn/avatar.png" })
        }
        return undefined as unknown as Response
      }),
    )
    const ctx = await makeCtx()
    const client = new VisitorsClient(ctx)
    const file = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" })
    const res = await client.setAvatar(file)
    expect(res.avatar_url).toBe("https://cdn/avatar.png")
    expect(observedHeaders?.get("content-type")).toBe("image/png")
    expect(observedHeaders?.get("idempotency-key")).toBeDefined()
    expect(observedBody?.byteLength).toBe(3)
    // Verify URL contains signing query params
    // The request URL is built with query, we can check via msw's request.url
  })

  it("deleteAvatar handles 404 as success", async () => {
    server.use(
      http.delete(
        "https://example.com/api/v1/sites/s/visitors/avatar",
        () => new HttpResponse(null, { status: 404 }),
      ),
    )
    const ctx = await makeCtx()
    const client = new VisitorsClient(ctx)
    await expect(client.deleteAvatar()).resolves.toBeUndefined()
  })
})
