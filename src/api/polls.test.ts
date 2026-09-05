import { describe, expect, it, vi } from "vitest"
import { pollCanonicalPayload } from "../identity/signing"
import type { ClientContext } from "./context"
import { PollsClient } from "./polls"

function createClient() {
  const signSpy = vi.fn(async (parts: (string | null | undefined)[]) => ({
    author_public_key: "pk_test",
    author_signature: "sig_test",
    challenge_response: "prefix|nonce",
  }))
  const requestSpy = vi.fn(async () => ({
    data: { submission_id: 42 },
    headers: new Headers(),
    status: 202,
  }))
  const ctx = {
    siteId: "my-site",
    pageSlug: "hello-world",
    signingPipeline: { sign: signSpy } as unknown as ClientContext["signingPipeline"],
    transport: { request: requestSpy } as unknown as ClientContext["transport"],
  } as unknown as ClientContext
  const client = new PollsClient(ctx)
  return { client, signSpy, requestSpy }
}

describe("PollsClient.create", () => {
  it("calls correct endpoint with POST and Idempotency-Key", async () => {
    const { client, requestSpy } = createClient()
    await client.create("Best?", ["A", "B"], { displayName: "Alice" })
    expect(requestSpy).toHaveBeenCalledTimes(1)
    const call = requestSpy.mock.calls[0] as unknown as [string, string, Record<string, unknown>]
    const [method, path, opts] = call
    expect(method).toBe("POST")
    expect(path).toBe("/api/v1/sites/my-site/pages/hello-world/polls")
    expect(opts).toHaveProperty("idempotencyKey")
    const key = (opts as { idempotencyKey: string }).idempotencyKey
    expect(typeof key).toBe("string")
    expect(key.length).toBeGreaterThanOrEqual(8)
    const body = (opts as { body: Record<string, unknown> }).body as Record<string, unknown>
    expect(body.question).toBe("Best?")
    expect(body.options).toEqual(["A", "B"])
    expect(body.max_selections).toBe(1)
    expect(body.display_name).toBe("Alice")
    expect(body.author_public_key).toBe("pk_test")
    expect(body.author_signature).toBe("sig_test")
    expect(body.challenge_response).toBe("prefix|nonce")
    expect(body.reply_to).toBeNull()
    expect(body.thread_root).toBeNull()
  })

  it("sends trimmed reply_to and thread_root when provided", async () => {
    const { client, requestSpy } = createClient()
    await client.create("Q?", ["X", "Y"], {
      displayName: "Bob",
      replyToId: "$reply:hs",
      threadRootId: "$root:hs",
    })
    const call = requestSpy.mock.calls[0] as unknown as [
      string,
      string,
      { body: Record<string, unknown> },
    ]
    const opts = call[2]
    expect(opts.body.reply_to).toBe("$reply:hs")
    expect(opts.body.thread_root).toBe("$root:hs")
  })

  it("uses provided Idempotency-Key when given", async () => {
    const { client, requestSpy } = createClient()
    await client.create("Q?", ["A", "B"], { idempotencyKey: "my-key-12345678" })
    const call = requestSpy.mock.calls[0] as unknown as [string, string, { idempotencyKey: string }]
    const opts = call[2]
    expect(opts.idempotencyKey).toBe("my-key-12345678")
  })

  it("uses existing auth/signing mechanism with canonical payload and POLL version", async () => {
    const { client, signSpy } = createClient()
    const question = "Best programming language?"
    const options = ["Rust", "TypeScript"]
    await client.create(question, options, { displayName: "Alice" })
    expect(signSpy).toHaveBeenCalledTimes(1)
    const parts = signSpy.mock.calls[0][0] as (string | null)[]
    expect(parts[0]).toBe("POLL")
    expect(parts[1]).toBe("my-site")
    expect(parts[2]).toBe("hello-world")
    const expectedPayload = pollCanonicalPayload(question, options, 1)
    expect(parts[3]).toBe(expectedPayload)
    expect(expectedPayload).toBe(JSON.stringify({ question, options, max_selections: 1 }))
    expect(parts[4]).toBeNull()
    expect(parts[5]).toBeNull()
  })

  it("handles async 202 response and returns submission_id", async () => {
    const { client } = createClient()
    const res = await client.create("Q?", ["A", "B"])
    expect(res).toEqual({ submission_id: 42 })
  })

  it("always sends max_selections 1", async () => {
    const { client, requestSpy } = createClient()
    await client.create("Q?", ["A", "B"])
    const call0 = requestSpy.mock.calls[0] as unknown as [
      string,
      string,
      { body: Record<string, unknown> },
    ]
    const body = call0[2].body as { max_selections: number }
    expect(body.max_selections).toBe(1)
    await client.create("Q?", ["A", "B", "C", "D"])
    const call1 = requestSpy.mock.calls[1] as unknown as [
      string,
      string,
      { body: Record<string, unknown> },
    ]
    const body2 = call1[2].body as { max_selections: number }
    expect(body2.max_selections).toBe(1)
  })

  it("does NOT call /comments endpoint", async () => {
    const { client, requestSpy } = createClient()
    await client.create("Q?", ["A", "B"])
    const call = requestSpy.mock.calls[0] as unknown as [string, string, unknown]
    const path = call[1] as string
    expect(path).not.toContain("/comments")
    expect(path).toBe("/api/v1/sites/my-site/pages/hello-world/polls")
  })
})
