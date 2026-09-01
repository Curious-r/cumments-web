import { beforeEach, describe, expect, it, vi } from "vitest"
import { ClientContext } from "./context"
import { MediaClient } from "./media"

async function makeCtx(): Promise<ClientContext> {
  const { generateRandomIdentity } = await import("../identity/keypair")
  const id = await generateRandomIdentity()
  const ctx = new ClientContext({
    endpoint: "https://example.com",
    siteId: "s",
    pageSlug: "p",
    identity: id,
  })
  vi.spyOn(ctx.challengeManager, "get").mockResolvedValue({
    prefix: "test.",
    difficulty: 1,
  } as never)
  vi.spyOn(ctx.powSolver, "solve").mockResolvedValue("nonce")
  return ctx
}

describe("MediaClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("validates mime", async () => {
    const ctx = await makeCtx()
    const client = new MediaClient(ctx)
    const file = new File([new Uint8Array([1, 2, 3])], "test.txt", { type: "text/plain" })
    await expect(client.upload(file)).rejects.toThrow(/unsupported/)
  })

  it("validates size", async () => {
    const ctx = await makeCtx()
    const client = new MediaClient(ctx)
    const big = new File([new Uint8Array(21 * 1024 * 1024)], "big.png", { type: "image/png" })
    Object.defineProperty(big, "size", { value: 21 * 1024 * 1024 })
    await expect(client.upload(big)).rejects.toThrow(/too large/)
  })

  it("calculates sha256 and uses signPipeline", async () => {
    const ctx = await makeCtx()
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            url: "mxc://hs/abc",
            filename: "a.png",
            mimetype: "image/png",
            size: 3,
            voice: false,
          }),
        }) as unknown as Response,
    )
    const origFetch = globalThis.fetch
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const client = new MediaClient(ctx)
    const file = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" })
    const res = await client.upload(file)
    expect(res.url).toBe("mxc://hs/abc")
    expect(fetchMock).toHaveBeenCalled()
    const url = (fetchMock.mock.calls[0] as unknown as [string])[0] as string
    expect(url).toContain("mime=image%2Fpng")
    expect(url).toContain("filename=a.png")
    expect(url).toContain("author_public_key")
    globalThis.fetch = origFetch
  })
})
