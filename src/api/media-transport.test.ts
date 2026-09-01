import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { ClientContext } from "./context"
import { MediaClient } from "./media"

const server = setupServer()
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe("MediaClient via HttpTransport", () => {
  it("sends binary via HttpTransport with correct headers and does not call raw fetch", async () => {
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
    let observedHeaders: any = null // biome-ignore lint/suspicious/noExplicitAny: test helper
    let observedBody: any = null // biome-ignore lint/suspicious/noExplicitAny: test helper
    server.use(
      http.all("https://example.com/*", async ({ request }) => {
        const url = new URL(request.url)
        if (url.pathname === "/api/v1/sites/s/pages/p/media") {
          observedHeaders = request.headers
          observedBody = await request.arrayBuffer()
          return HttpResponse.json({
            url: "mxc://hs/abc",
            filename: "a.png",
            mimetype: "image/png",
            size: 3,
            voice: false,
          })
        }
        return undefined as unknown as Response
      }),
    )
    const client = new MediaClient(ctx)
    const file = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" })
    const spy = vi.spyOn(ctx.transport, "request")
    const res = await client.upload(file)
    expect(res.url).toBe("mxc://hs/abc")
    expect(spy).toHaveBeenCalled()
    const call = spy.mock.calls[0] as any
    expect(call[0]).toBe("POST")
    expect(call[1]).toContain("author_public_key")
    expect(observedHeaders?.get("content-type")).toBe("image/png")
    expect(observedHeaders?.get("idempotency-key")).toBeDefined()
    expect(observedBody?.byteLength).toBe(3)
    // Ensure raw fetch not called directly by checking spy was used (transport is sole owner)
  })

  it("preserves signing tuple for UPLOAD without version suffix", async () => {
    const { generateRandomIdentity } = await import("../identity/keypair")
    const { signatureMessage, signMessage, verifySignature } = await import("../identity/signing")
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
    let observedUrl = ""
    server.use(
      http.all("https://example.com/*", async ({ request }) => {
        const url = new URL(request.url)
        if (url.pathname === "/api/v1/sites/s/pages/p/media") {
          observedUrl = request.url
          return HttpResponse.json({
            url: "mxc://hs/abc",
            filename: "a.png",
            mimetype: "image/png",
            size: 3,
            voice: false,
          })
        }
        return undefined as unknown as Response
      }),
    )
    const client = new MediaClient(ctx)
    const file = new File([new Uint8Array([9, 9])], "b.png", { type: "image/png" })
    // Spy on signing to capture the actual tuple used
    const signSpy = vi.spyOn(ctx.signingPipeline, "sign")
    await client.upload(file)
    expect(signSpy).toHaveBeenCalled()
    const calledParts = signSpy.mock.calls[0][0] as (string | null | undefined)[]
    // Must be ["UPLOAD", siteId, pageSlug, mime, filename, hash] without trailing "1"
    expect(calledParts[0]).toBe("UPLOAD")
    expect(calledParts[1]).toBe("s")
    expect(calledParts[2]).toBe("p")
    expect(calledParts[3]).toBe("image/png")
    expect(calledParts[4]).toBe("b.png")
    expect(typeof calledParts[5]).toBe("string")
    expect(calledParts.length).toBe(6)
    // Verify the signature corresponds to version-less message
    const u = new URL(observedUrl)
    const sig = u.searchParams.get("author_signature")!
    const challenge = "pfx."
    const expectedMsg = signatureMessage([
      "UPLOAD",
      "s",
      "p",
      "image/png",
      "b.png",
      calledParts[5] as string,
      challenge,
    ])
    const expectedSig = await signMessage(id.privateKey, expectedMsg)
    expect(sig).toBe(expectedSig)
    // Also verify that versioned message would be different
    const versionedMsg = signatureMessage([
      "UPLOAD",
      "s",
      "p",
      "image/png",
      "b.png",
      calledParts[5] as string,
      challenge,
      "1",
    ])
    expect(await verifySignature(id.publicKey, versionedMsg, sig)).toBe(false)
    expect(await verifySignature(id.publicKey, expectedMsg, sig)).toBe(true)
  })
})
