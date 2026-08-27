import { describe, expect, it } from "vitest"
import { formatChallengeResponse, PowSolver, parseChallengeResponse, verifyPow } from "./pow"

describe("pow", () => {
  it("verifyPow matches expected hex prefix", async () => {
    // difficulty 0 always passes
    expect(await verifyPow("any-prefix", 0, "0")).toBe(true)
    expect(await verifyPow("any-prefix", 0, "9999")).toBe(true)
  })

  it("finds nonce for difficulty 1 (main thread fallback forced)", async () => {
    const solver = new PowSolver(() => {
      throw new Error("no worker")
    })
    const prefix = "test-prefix-123"
    const nonce = await solver.solve(prefix, 1)
    expect(await verifyPow(prefix, 1, nonce)).toBe(true)
    expect(formatChallengeResponse(prefix, nonce)).toBe(`${prefix}|${nonce}`)
    expect(parseChallengeResponse(`${prefix}|${nonce}`)).toEqual({ prefix, nonce })
  })

  it("finds nonce for difficulty 2", async () => {
    const solver = new PowSolver(() => {
      throw new Error("no worker")
    })
    const prefix = `abc-${Math.random().toString(16).slice(2, 10)}`
    const nonce = await solver.solve(prefix, 2)
    expect(await verifyPow(prefix, 2, nonce)).toBe(true)
  })

  it("difficulty 0 returns immediately", async () => {
    const solver = new PowSolver(() => {
      throw new Error("no worker")
    })
    await expect(solver.solve("any", 0)).resolves.toBe("0")
  })

  it("aborts via signal", async () => {
    const solver = new PowSolver(() => {
      throw new Error("no worker")
    })
    const controller = new AbortController()
    // Use high difficulty to ensure it would take a while, then abort quickly
    const p = solver.solve("abort-test-prefix", 5, controller.signal)
    controller.abort()
    await expect(p).rejects.toMatchObject({ name: "AbortError" })
  })

  it("parseChallengeResponse handles edge", () => {
    expect(parseChallengeResponse("a|b")).toEqual({ prefix: "a", nonce: "b" })
    expect(parseChallengeResponse("a|b|c")).toEqual({ prefix: "a|b", nonce: "c" })
    expect(parseChallengeResponse("no-pipe")).toBeNull()
  })
})
