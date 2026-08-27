import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { ChallengeManager } from "./challenge"

const server = setupServer()
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe("ChallengeManager", () => {
  it("fetches fresh challenge each time (single-use)", async () => {
    let calls = 0
    server.use(
      http.get("http://example.com/api/v1/challenge", () => {
        calls++
        return HttpResponse.json({ prefix: `a.b.c${calls}`, difficulty: 4 })
      }),
    )

    const mgr = new ChallengeManager("http://example.com")
    const first = await mgr.get()
    const second = await mgr.get()
    expect(calls).toBe(2)
    expect(first).not.toEqual(second)
  })

  it("dedupes concurrent fetches", async () => {
    let calls = 0
    server.use(
      http.get("http://example.com/api/v1/challenge", async () => {
        calls++
        await new Promise((r) => setTimeout(r, 10))
        return HttpResponse.json({ prefix: "p", difficulty: 1 })
      }),
    )

    const mgr = new ChallengeManager("http://example.com")
    const [a, b] = await Promise.all([mgr.get(), mgr.get()])
    expect(calls).toBe(1)
    expect(a).toEqual(b)
  })
})
