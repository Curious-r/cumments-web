import { describe, expect, it, vi } from "vitest"
import { graphemeLength } from "../utils/grapheme"
import type { ClientContext } from "./context"
import { ReactionsClient } from "./reactions"

function createClient() {
  const ctx = {
    siteId: "s",
    pageSlug: "p",
    signingPipeline: {
      sign: vi.fn(async () => ({
        author_public_key: "pk",
        author_signature: "sig",
        challenge_response: "c|r",
      })),
    },
    transport: {
      request: vi.fn(async () => ({ data: undefined })),
    },
  } as unknown as ClientContext
  return { client: new ReactionsClient(ctx), ctx }
}

describe("ReactionsClient grapheme validation", () => {
  it("accepts 31 graphemes", async () => {
    const { client } = createClient()
    await expect(client.add("c1", "a".repeat(31))).resolves.toBeUndefined()
  })

  it("accepts 32 graphemes", async () => {
    const { client } = createClient()
    await expect(client.add("c1", "a".repeat(32))).resolves.toBeUndefined()
  })

  it("rejects 33 graphemes", async () => {
    const { client } = createClient()
    await expect(client.add("c1", "a".repeat(33))).rejects.toThrow("invalid reaction key")
  })

  it("accepts 32 Chinese graphemes", async () => {
    const { client } = createClient()
    const key = "中".repeat(32)
    expect(graphemeLength(key)).toBe(32)
    expect(key.length).toBe(32)
    await expect(client.add("c1", key)).resolves.toBeUndefined()
  })

  it("accepts 32 flag graphemes even though JS length > 32", async () => {
    const { client } = createClient()
    const key = "🇩🇪".repeat(32)
    expect(graphemeLength(key)).toBe(32)
    expect(key.length).toBeGreaterThan(32)
    await expect(client.add("c1", key)).resolves.toBeUndefined()
  })

  it("accepts 32 ZWJ emoji graphemes even though JS length > 32", async () => {
    const { client } = createClient()
    const key = "👩‍👩‍👧‍👦".repeat(32)
    expect(graphemeLength(key)).toBe(32)
    expect(key.length).toBeGreaterThan(32)
    await expect(client.add("c1", key)).resolves.toBeUndefined()
  })

  it("counts combining sequences correctly", async () => {
    const { client, ctx } = createClient()
    const key32 = "e\u0301".repeat(32)
    expect(graphemeLength(key32)).toBe(32)
    expect(key32.length).toBe(64)
    await expect(client.add("c1", key32)).resolves.toBeUndefined()
    const key33 = "e\u0301".repeat(33)
    expect(graphemeLength(key33)).toBe(33)
    await expect(client.add("c1", key33)).rejects.toThrow("invalid reaction key")
    // Ensure transport not called for rejected case
    expect((ctx.transport.request as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })

  it("rejects empty and whitespace keys", async () => {
    const { client } = createClient()
    await expect(client.add("c1", "")).rejects.toThrow("invalid reaction key")
    await expect(client.add("c1", "   ")).rejects.toThrow("invalid reaction key")
    await expect(client.add("c1", "\t\n")).rejects.toThrow("invalid reaction key")
  })

  it("trims keys before counting", async () => {
    const { client } = createClient()
    const keyWithSpaces = `  ${"a".repeat(32)}  `
    expect(graphemeLength(keyWithSpaces.trim())).toBe(32)
    await expect(client.add("c1", keyWithSpaces)).resolves.toBeUndefined()

    const key33WithSpaces = `  ${"a".repeat(33)}  `
    await expect(client.add("c1", key33WithSpaces)).rejects.toThrow("invalid reaction key")
  })

  it("graphemeLength differs from length for flags while validation passes", async () => {
    const { client } = createClient()
    const flags32 = "🇩🇪".repeat(32)
    // demonstrates the bug that would occur with value.length
    expect(flags32.length).toBe(128)
    expect(graphemeLength(flags32)).toBe(32)
    // With old code `normalized.length > 32` this would be rejected, with grapheme it must be accepted
    await expect(client.add("c1", flags32)).resolves.toBeUndefined()
  })
})
