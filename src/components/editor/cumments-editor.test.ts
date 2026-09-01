import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./cumments-editor"
import type { Message } from "../../api/contract/query"
import type { CummentsEditor } from "./cumments-editor"

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    event_id: "$msg1",
    site_id: "s",
    page_slug: "p",
    author: {
      type: "visitor",
      display_name: "Alice",
      avatar_url: null,
      public_key: "pk",
      mxid: null,
    } as unknown as Message["author"],
    content: { type: "text", body: "hello" } as unknown as Message["content"],
    timestamp: new Date().toISOString(),
    edited_at: null,
    reply_to: null,
    thread_root: null,
    submission_id: null,
    status: "active",
    redacted_at: null,
    redacted_by: null,
    reactions: [],
    ...overrides,
  } as Message
}

describe("<cumments-editor>", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })
  afterEach(() => {
    document.body.innerHTML = ""
    vi.restoreAllMocks()
  })

  async function createEditor(props: Partial<CummentsEditor> = {}): Promise<CummentsEditor> {
    const el = document.createElement("cumments-editor") as CummentsEditor
    Object.assign(el, props)
    document.body.appendChild(el)
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    await new Promise((r) => setTimeout(r, 10))
    return el
  }

  it("initial display-name hint populates the live field", async () => {
    const el = await createEditor({ displayNameHint: "Alice" })
    // Need to wait for updated to propagate
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    const input = el.querySelector('input[aria-label="Display name"]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.value).toBe("Alice")
  })

  it("changing display-name input changes editor-local state", async () => {
    const el = await createEditor({ displayNameHint: "Alice" })
    const input = el.querySelector('input[aria-label="Display name"]') as HTMLInputElement
    input.value = "Bob"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    expect((el as unknown as { currentDisplayName: string }).currentDisplayName).toBe("Bob")
    // Also check that hint remains
    expect(el.displayNameHint).toBe("Alice")
  })

  it("submit emits content, replyToId, displayName", async () => {
    const el = await createEditor({ displayNameHint: "Alice" })
    const draftInput = el.querySelector('input[aria-label="Comment"]') as HTMLInputElement
    draftInput.value = "hello world"
    draftInput.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    // Set replyToId via method
    el.setReplyToId("$parent")
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    let captured: unknown = null
    el.addEventListener("cumments:submit", (e: Event) => {
      captured = (e as CustomEvent).detail
    })
    const postBtn = el.querySelector('[aria-label="Post comment"]') as HTMLButtonElement
    postBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    expect(captured).toBeTruthy()
    const detail = captured as { content: string; replyToId: string | null; displayName: string }
    expect(detail.content).toBe("hello world")
    expect(detail.replyToId).toBe("$parent")
    expect(detail.displayName).toBe("Alice") // from hint initially
  })

  it("submit event is composed and bubbling", async () => {
    const el = await createEditor()
    const draftInput = el.querySelector('input[aria-label="Comment"]') as HTMLInputElement
    draftInput.value = "test"
    draftInput.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    let received: CustomEvent | null = null
    // Listen on document to test composed bubbling
    const handler = (e: Event) => {
      received = e as CustomEvent
    }
    document.addEventListener("cumments:submit", handler)
    const postBtn = el.querySelector('[aria-label="Post comment"]') as HTMLButtonElement
    postBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    document.removeEventListener("cumments:submit", handler)
    expect(received).toBeTruthy()
    // biome-ignore lint/style/noNonNullAssertion: test helper
    expect(received!.bubbles).toBe(true)
    // biome-ignore lint/style/noNonNullAssertion: test helper
    expect(received!.composed).toBe(true)
  })

  it("Escape cancels reply", async () => {
    const el = await createEditor()
    el.setReplyToId("$123")
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    await new Promise((r) => setTimeout(r, 10))
    expect(el.innerHTML).toContain("Replying to")
    // Find draft input and send Escape
    const draftInput = el.querySelector('input[aria-label="Comment"]') as HTMLInputElement
    draftInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(el.innerHTML).not.toContain("Replying to")
    expect((el as unknown as { currentReplyToId: string | null }).currentReplyToId).toBeNull()
  })

  it("reply target can be selected and cleared", async () => {
    const parent = makeMessage({
      event_id: "$p",
      author: { display_name: "Bob" } as unknown as Message["author"],
    })
    const el = await createEditor({
      getMessage: (id: string) => (id === "$p" ? parent : undefined),
    })
    el.setReplyToId("$p")
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(el.innerHTML).toContain("Replying to")
    expect(el.innerHTML).toContain("Bob")
    // Clear via cancel button
    const cancelBtn = el.querySelector('button[aria-label="Cancel reply"]') as HTMLButtonElement
    expect(cancelBtn).toBeTruthy()
    cancelBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect((el as unknown as { currentReplyToId: string | null }).currentReplyToId).toBeNull()
    expect(el.innerHTML).not.toContain("Replying to")
  })

  it("media picker cancellation does not submit", async () => {
    const el = await createEditor({
      uploadMedia: vi.fn(async () => ({
        url: "mxc://a",
        filename: "a.png",
        mimetype: "image/png",
        size: 100,
        voice: false,
      })),
    })
    let submitted = false
    el.addEventListener("cumments:submit", () => (submitted = true))
    const fileInput = el.querySelector('input[type="file"]') as HTMLInputElement
    // Simulate cancellation: no file selected
    Object.defineProperty(fileInput, "files", { value: [], writable: true })
    fileInput.dispatchEvent(new Event("change", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    expect(submitted).toBe(false)
    expect((el as unknown as { uploadMedia: unknown }).uploadMedia).toBeDefined()
    // Ensure upload not called
    expect((el.uploadMedia as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
  })

  it("media upload failure is rendered", async () => {
    const el = await createEditor({
      uploadMedia: vi.fn(async () => {
        throw new Error("upload failed")
      }),
    })
    const file = new File(["hello"], "test.png", { type: "image/png" })
    const fileInput = el.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(fileInput, "files", { value: [file], writable: true })
    fileInput.dispatchEvent(new Event("change", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(el.innerHTML).toContain("upload failed")
  })

  it("location button does not auto-request on startup", async () => {
    const geoMock = vi.fn()
    const origGeo = navigator.geolocation
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const el = await createEditor()
    await new Promise((r) => setTimeout(r, 30))
    expect(geoMock).not.toHaveBeenCalled()
    el.remove()
    Object.defineProperty(navigator, "geolocation", {
      value: origGeo,
      writable: true,
      configurable: true,
    })
  })

  it("location success creates expected geo submission intent", async () => {
    const mockPos = {
      coords: { latitude: 30.123, longitude: 120.456 },
    } as unknown as GeolocationPosition
    const geoMock = vi.fn((_succ: PositionCallback) => {
      _succ(mockPos)
    })
    const origGeo = navigator.geolocation
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: geoMock },
      writable: true,
      configurable: true,
    })
    const shareMock = vi.fn(async () => ({ submission_id: 1 }))
    const el = await createEditor({
      shareLocation: shareMock as unknown as CummentsEditor["shareLocation"],
    })
    el.setReplyToId("$parent")
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    const _captured: unknown = null
    // For shareLocation path, it will call shareMock, not emit submit
    // So we test shareMock is called with geoUri and replyTo/threadRoot
    const locBtn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    expect(locBtn).toBeTruthy()
    locBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(geoMock).toHaveBeenCalled()
    expect(shareMock).toHaveBeenCalled()
    const geoArg = (shareMock.mock.calls[0] as unknown as [string, unknown])[0] as string
    expect(geoArg).toBe("geo:30.123,120.456")
    const opts = (
      shareMock.mock.calls[0] as unknown as [string, { replyTo: string | null }]
    )[1] as { replyTo: string | null }
    expect(opts.replyTo).toBe("$parent")
    Object.defineProperty(navigator, "geolocation", {
      value: origGeo,
      writable: true,
      configurable: true,
    })
  })

  it("sticker loading state renders correctly", async () => {
    const el = await createEditor({ stickerLoading: true, stickerPacks: [] })
    // Open sticker picker
    const stickerBtn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Sticker"),
    ) as HTMLButtonElement
    stickerBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(el.innerHTML).toContain("Loading stickers")
    // Now with packs
    const packs = [
      {
        pack_id: "p1",
        display_name: "P1",
        images: [{ shortcode: ":a:", url: "mxc://a", proxy_url: "https://proxy/a" }],
      },
    ] as unknown as import("../../api/stickers").StickerPack[]
    el.stickerPacks = packs
    el.stickerLoading = false
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(el.innerHTML).toContain("P1")
  })

  it("sticker selection produces media/sticker payload", async () => {
    const el = await createEditor({
      stickerPacks: [
        {
          pack_id: "p1",
          display_name: "P1",
          images: [{ shortcode: ":a:", url: "mxc://sticker/a", proxy_url: "https://proxy/a" }],
        },
      ] as unknown as import("../../api/stickers").StickerPack[],
      stickerLoading: false,
    })
    // Open picker
    const stickerBtn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Sticker"),
    ) as HTMLButtonElement
    stickerBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    let captured: unknown = null
    el.addEventListener("cumments:submit", (e: Event) => {
      captured = (e as CustomEvent).detail
    })
    const stickerPickBtn = el.querySelector(
      '[data-sticker-url="mxc://sticker/a"]',
    ) as HTMLButtonElement
    expect(stickerPickBtn).toBeTruthy()
    stickerPickBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    expect(captured).toBeTruthy()
    const detail = captured as { content: string; media: { url: string; kind: string } }
    expect(detail.content).toBe("mxc://sticker/a")
    expect(detail.media?.url).toBe("mxc://sticker/a")
    expect(detail.media?.kind).toBe("sticker")
  })

  it("editor contains no secret values in DOM attributes", async () => {
    const el = await createEditor({ displayNameHint: "Alice" })
    const draftInput = el.querySelector('input[aria-label="Comment"]') as HTMLInputElement
    draftInput.value = "secret content with privateKey=abc"
    draftInput.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    // Check that no data-* attributes contain secrets
    const html = el.innerHTML
    const outer = document.body.innerHTML
    // Ensure no privateKey/mnemonic/backup in attributes
    expect(html).not.toContain("privateKey")
    expect(html).not.toContain("mnemonic")
    expect(outer).not.toContain("privateKey")
    // Check data-* attributes
    const dataAttrs = el.querySelectorAll("[data-privateKey], [data-mnemonic], [data-backup]")
    expect(dataAttrs.length).toBe(0)
    // Also ensure CustomEvent detail not leaked to DOM
    const attrs = Array.from(el.attributes)
      .map((a) => `${a.name}=${a.value}`)
      .join(" ")
    expect(attrs).not.toContain("privateKey")
  })
})
