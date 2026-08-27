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
