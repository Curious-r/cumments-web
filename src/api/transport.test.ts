import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import type { CummentsError } from "./errors"
import { query, request } from "./transport"

const server = setupServer()

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe("transport", () => {
  it("sends QUERY with JSON body", async () => {
    let observedMethod = ""
    let observedBody: unknown = null

    server.use(
      http.all("http://example.com/api/v1/sites/s/pages/p/comments", async ({ request }) => {
        observedMethod = request.method
        observedBody = await request.json().catch(() => null)
        return HttpResponse.json({
          data: [],
          meta: { total: 0, page: 1, per_page: 20, total_pages: 0 },
        })
      }),
    )

    const res = await query("http://example.com", "/api/v1/sites/s/pages/p/comments", {
      page: 1,
      per_page: 20,
    })

    expect(observedMethod).toBe("QUERY")
    expect(observedBody).toEqual({ page: 1, per_page: 20 })
    expect(res.data).toBeDefined()
  })

  it("maps ProblemDetails to CummentsError with retryAfter", async () => {
    server.use(
      http.get("http://example.com/api/v1/challenge", () => {
        return new HttpResponse(
          JSON.stringify({
            type: "https://cumments.example.com/problems/rate-limited",
            title: "Too Many Requests",
            status: 429,
            detail: "rate limited",
            code: "rate-limited",
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/problem+json",
              "Retry-After": "42",
            },
          },
        )
      }),
    )

    await expect(
      request({ method: "GET", endpoint: "http://example.com", path: "/api/v1/challenge" }),
    ).rejects.toMatchObject({
      status: 429,
      code: "rate-limited",
      retryAfter: 42,
    } as Partial<CummentsError>)
  })
})

describe("HttpTransport", () => {
  it("sends binary ArrayBuffer with custom Content-Type and Idempotency-Key", async () => {
    let observedHeaders: any = null // biome-ignore lint/suspicious/noExplicitAny: test helper
    let observedBody: any = null // biome-ignore lint/suspicious/noExplicitAny: test helper
    let observedMethod = ""
    server.use(
      http.all("http://example.com/*", async ({ request }) => {
        const url = new URL(request.url)
        if (url.pathname === "/api/v1/sites/s/pages/p/media") {
          observedMethod = request.method
          observedHeaders = request.headers
          observedBody = await request.arrayBuffer()
          return HttpResponse.json({
            url: "mxc://x",
            filename: "a.png",
            mimetype: "image/png",
            size: 3,
            voice: false,
          })
        }
        return undefined as unknown as Response
      }),
    )
    const { HttpTransport } = await import("./transport")
    const transport = new HttpTransport("http://example.com")
    const buf = new Uint8Array([1, 2, 3]).buffer
    const res = await transport.request("POST", "/api/v1/sites/s/pages/p/media?mime=image%2Fpng", {
      body: buf,
      headers: { "Content-Type": "image/png" },
      idempotencyKey: "test-key-123",
    })
    expect(observedMethod).toBe("POST")
    expect(observedHeaders?.get("content-type")).toBe("image/png")
    expect(observedHeaders?.get("idempotency-key")).toBe("test-key-123")
    expect(observedBody?.byteLength).toBe(3)
    expect(res.data).toBeDefined()
  })

  it("does not fabricate Idempotency-Key when not supplied", async () => {
    let observedHeaders: Record<string, string> = {}
    server.use(
      http.get("http://example.com/api/v1/challenge", async ({ request }) => {
        observedHeaders = Object.fromEntries(request.headers.entries())
        return HttpResponse.json({ prefix: "p.", difficulty: 0 })
      }),
    )
    const { HttpTransport } = await import("./transport")
    const transport = new HttpTransport("http://example.com")
    await transport.request("GET", "/api/v1/challenge")
    expect(observedHeaders["idempotency-key"]).toBeUndefined()
  })

  it("handles 204 with undefined data", async () => {
    server.use(
      http.delete("http://example.com/api/v1/sites/s/visitors/avatar", () => {
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { HttpTransport } = await import("./transport")
    const transport = new HttpTransport("http://example.com")
    const res = await transport.request("DELETE", "/api/v1/sites/s/visitors/avatar")
    expect(res.status).toBe(204)
    expect(res.data).toBeUndefined()
  })

  it("preserves AbortSignal", async () => {
    const controller = new AbortController()
    controller.abort()
    const { HttpTransport } = await import("./transport")
    const transport = new HttpTransport("http://example.com")
    server.use(
      http.get("http://example.com/api/v1/sites/s/visitors/profile", () => {
        return HttpResponse.json({ visitor_id: "x", display_name: null, avatar_url: null })
      }),
    )
    await expect(
      transport.request("GET", "/api/v1/sites/s/visitors/profile", { signal: controller.signal }),
    ).rejects.toThrow()
  })

  it("supports QUERY via HttpTransport", async () => {
    let observedMethod = ""
    server.use(
      http.all("http://example.com/api/v1/sites/s/pages/p/comments", async ({ request }) => {
        observedMethod = request.method
        return HttpResponse.json({
          data: [],
          meta: { total: 0, page: 1, per_page: 20, total_pages: 0 },
        })
      }),
    )
    const { HttpTransport } = await import("./transport")
    const transport = new HttpTransport("http://example.com")
    const res = await transport.query("/api/v1/sites/s/pages/p/comments", { page: 1 })
    expect(observedMethod).toBe("QUERY")
    expect(res.data).toBeDefined()
  })
})
