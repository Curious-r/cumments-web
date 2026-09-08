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

  it("shows profile context as read-only Commenting as", async () => {
    const el = await createEditor({ profileName: "Alice", profileAvatar: null })
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(el.querySelector('input[aria-label="Display name"]')).toBeNull()
    const btn = el.querySelector('button[aria-label="Edit profile"]') as HTMLButtonElement
    expect(btn).toBeTruthy()
    expect(btn.textContent).toContain("Alice")
    expect(el.innerHTML).toContain("Commenting as")
  })

  it("updating profileName updates composer context", async () => {
    const el = await createEditor({ profileName: "Alice" })
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    let btn = el.querySelector('button[aria-label="Edit profile"]') as HTMLButtonElement
    expect(btn.textContent).toContain("Alice")
    el.profileName = "Bob"
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    await new Promise((r) => setTimeout(r, 10))
    btn = el.querySelector('button[aria-label="Edit profile"]') as HTMLButtonElement
    expect(btn.textContent).toContain("Bob")
  })

  it("submit emits content and displayName; relations live in ComposerContext, not the detail", async () => {
    const el = await createEditor({ profileName: "Alice" })
    const draftInput = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
    draftInput.value = "hello world"
    draftInput.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    const draftChanges: Array<string | null> = []
    el.onReplyDraftChange = (id) => draftChanges.push(id)
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
    const detail = captured as { content: string; displayName: string; replyToId?: string }
    expect(detail.content).toBe("hello world")
    expect(detail.displayName).toBe("Alice") // from hint initially
    // The submit detail carries no relation fields
    expect(detail.replyToId).toBeUndefined()
    // The reply draft lifecycle was reported: set then cleared after submit
    expect(draftChanges).toEqual(["$parent", null])
  })

  it("submit event is composed and bubbling", async () => {
    const el = await createEditor()
    const draftInput = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
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

  it("Escape preserves reply context when no transient/structured UI is active", async () => {
    const el = await createEditor()
    el.setReplyToId("$123")
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    await new Promise((r) => setTimeout(r, 10))
    expect(el.innerHTML).toContain("Replying to")
    // Send Escape - should NOT clear reply context
    const draftInput = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
    draftInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    // Reply context must be preserved
    expect(el.innerHTML).toContain("Replying to")
    expect((el as unknown as { currentReplyToId: string | null }).currentReplyToId).toBe("$123")
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
    // Failed state shows the filename with a warning indicator
    expect(el.innerHTML).toContain("test.png")
    expect(el.innerHTML).toContain("Remove failed attachment")
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
    const el = await createEditor()
    el.setReplyToId("$parent")
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    let captured: unknown = null
    el.addEventListener("cumments:submit", (e) => {
      captured = (e as CustomEvent).detail
    })
    const locBtn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Location"),
    ) as HTMLButtonElement
    expect(locBtn).toBeTruthy()
    locBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(geoMock).toHaveBeenCalled()
    expect(captured).toBeNull()
    // Pending location should be set
    expect((el as unknown as { pendingLocation: string | null }).pendingLocation).toBe(
      "geo:30.123,120.456",
    )
    // Draft and reply should be preserved
    expect((el as unknown as { currentReplyToId: string | null }).currentReplyToId).toBe("$parent")
    // Now explicit Submit should dispatch with geoUri
    const draftInput = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
    draftInput.value = "hello"
    draftInput.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    const postBtn = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    postBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    expect(captured).toBeTruthy()
    const detail = captured as { geoUri?: string; content: string }
    expect(detail.geoUri).toBe("geo:30.123,120.456")
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
    // Set draft to hello
    const draftInput = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
    draftInput.value = "hello"
    draftInput.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
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
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    // Selecting sticker must NOT submit
    expect(captured).toBeNull()
    // Draft should be preserved
    expect((el as unknown as { currentDraft: string }).currentDraft).toBe("hello")
    // Picker should be closed
    expect(el.querySelector('[role="dialog"][aria-label="Stickers"]')).toBeNull()
    // Pending sticker should be available
    expect((el as unknown as { pendingSticker: unknown }).pendingSticker).toBeTruthy()
    // Explicit Submit should dispatch with sticker
    const postBtn = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    postBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    expect(captured).toBeTruthy()
    const detail = captured as { content: string; media: { url: string; kind: string } }
    // Content should be hello or sticker, and media should be sticker
    expect(detail.media?.url).toBe("mxc://sticker/a")
    expect(detail.media?.kind).toBe("sticker")
  })

  it("editor contains no secret values in DOM attributes", async () => {
    const el = await createEditor({ profileName: "Alice" })
    const draftInput = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
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

describe("Composer foundation — Phase 1", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })
  afterEach(() => {
    document.body.innerHTML = ""
  })

  async function createEditor(props: Partial<CummentsEditor> = {}): Promise<CummentsEditor> {
    const el = document.createElement("cumments-editor") as CummentsEditor
    Object.assign(el, props)
    document.body.appendChild(el)
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    await new Promise((r) => setTimeout(r, 10))
    return el
  }

  it("renders a textarea instead of single-line input", async () => {
    const el = await createEditor()
    const textarea = el.querySelector('textarea[aria-label="Comment"]')
    const input = el.querySelector('input[aria-label="Comment"]')
    expect(textarea).toBeTruthy()
    expect(input).toBeNull()
  })

  describe("keyboard behavior", () => {
    it("bare Enter does not submit and does not call preventDefault", async () => {
      const el = await createEditor({ profileName: "Alice" })
      let submitted = false
      el.addEventListener("cumments:submit", () => (submitted = true))
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      const preventDefaultSpy = vi.spyOn(event, "preventDefault")
      textarea.dispatchEvent(event)
      await new Promise((r) => setTimeout(r, 10))
      expect(submitted).toBe(false)
      expect(preventDefaultSpy).not.toHaveBeenCalled()
    })

    it("Ctrl+Enter submits exactly once and calls preventDefault", async () => {
      const el = await createEditor({ profileName: "Alice" })
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      textarea.value = "hello"
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      let submitCount = 0
      el.addEventListener("cumments:submit", () => submitCount++)
      const event = new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true })
      const preventDefaultSpy = vi.spyOn(event, "preventDefault")
      textarea.dispatchEvent(event)
      await new Promise((r) => setTimeout(r, 10))
      expect(submitCount).toBe(1)
      expect(preventDefaultSpy).toHaveBeenCalledOnce()
    })

    it("Cmd+Enter submits exactly once and calls preventDefault", async () => {
      const el = await createEditor({ profileName: "Alice" })
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      textarea.value = "hello"
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      let submitCount = 0
      el.addEventListener("cumments:submit", () => submitCount++)
      const event = new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true })
      const preventDefaultSpy = vi.spyOn(event, "preventDefault")
      textarea.dispatchEvent(event)
      await new Promise((r) => setTimeout(r, 10))
      expect(submitCount).toBe(1)
      expect(preventDefaultSpy).toHaveBeenCalledOnce()
    })
  })

  describe("auto-grow", () => {
    const originalInnerWidth = window.innerWidth

    afterEach(() => {
      Object.defineProperty(window, "innerWidth", {
        value: originalInnerWidth,
        configurable: true,
      })
    })

    it("grows to content height when below max", async () => {
      const el = await createEditor()
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      // Mock scrollHeight to simulate content below max
      Object.defineProperty(textarea, "scrollHeight", {
        value: 50,
        configurable: true,
      })
      // Trigger the real auto-grow path
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      expect(textarea.style.height).toBe("50px")
      expect(textarea.style.overflowY).toBe("hidden")
    })

    it("caps at desktop max height", async () => {
      const el = await createEditor()
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      // Mock scrollHeight to simulate content above desktop max (200px)
      Object.defineProperty(textarea, "scrollHeight", {
        value: 300,
        configurable: true,
      })
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      expect(textarea.style.height).toBe("200px")
      expect(textarea.style.overflowY).toBe("auto")
    })

    it("uses mobile max height in narrow viewport", async () => {
      // Simulate narrow viewport
      Object.defineProperty(window, "innerWidth", {
        value: 400,
        configurable: true,
      })
      const el = await createEditor()
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      // Mock scrollHeight to simulate content above mobile max (120px)
      Object.defineProperty(textarea, "scrollHeight", {
        value: 200,
        configurable: true,
      })
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      expect(textarea.style.height).toBe("120px")
      expect(textarea.style.overflowY).toBe("auto")
    })
  })

  describe("Post button", () => {
    it("is disabled when empty and enabled with content", async () => {
      const el = await createEditor({ profileName: "Alice" })
      const postBtn = el.querySelector('[aria-label="Post comment"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(true)
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      textarea.value = "hello"
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      expect(postBtn.disabled).toBe(false)
    })

    it("uses native disabled attribute", async () => {
      const el = await createEditor({ profileName: "Alice" })
      const postBtn = el.querySelector('[aria-label="Post comment"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(true)
      expect(postBtn.getAttribute("disabled")).not.toBeNull()
    })
  })

  describe("accessibility", () => {
    it("textarea has accessible name", async () => {
      const el = await createEditor()
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      expect(textarea.getAttribute("aria-label")).toBe("Comment")
    })

    it("Post has accessible name", async () => {
      const el = await createEditor()
      const postBtn = el.querySelector('[aria-label="Post comment"]') as HTMLButtonElement
      expect(postBtn.getAttribute("aria-label")).toBe("Post comment")
    })

    it("toolbar controls have accessible names", async () => {
      const el = await createEditor()
      const attach = el.querySelector("label") as HTMLLabelElement
      expect(attach?.textContent).toContain("Attach")
      const location = Array.from(el.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Location"),
      ) as HTMLButtonElement | undefined
      expect(location).toBeTruthy()
      expect(location?.textContent).toContain("Location")
      const poll = Array.from(el.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Poll"),
      ) as HTMLButtonElement | undefined
      expect(poll).toBeTruthy()
      expect(poll?.textContent).toContain("Poll")
    })

    it("disabled Post remains a real disabled control", async () => {
      const el = await createEditor({ profileName: "Alice" })
      const postBtn = el.querySelector('[aria-label="Post comment"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(true)
      expect(postBtn.getAttribute("disabled")).not.toBeNull()
    })

    it("empty composer shows Post disabled with reduced opacity", async () => {
      const el = await createEditor({ profileName: "Alice" })
      const postBtn = el.querySelector('[aria-label="Post comment"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(true)
      expect(postBtn.style.opacity).toBe("0.5")
    })

    it("uploading attachment shows Post disabled with reduced opacity", async () => {
      let resolveUpload: (value: {
        url: string
        filename: string
        mimetype: string
        size: number
        voice: boolean
      }) => void = () => {}
      const uploadPromise = new Promise<{
        url: string
        filename: string
        mimetype: string
        size: number
        voice: boolean
      }>((resolve) => {
        resolveUpload = resolve
      })
      const el = await createEditor({
        uploadMedia: vi.fn(async () => uploadPromise),
      })
      const file = new File(["hello"], "uploading.png", { type: "image/png" })
      const fileInput = el.querySelector('input[type="file"]') as HTMLInputElement
      Object.defineProperty(fileInput, "files", { value: [file], writable: true })
      fileInput.dispatchEvent(new Event("change", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const postBtn = el.querySelector('[aria-label="Post comment"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(true)
      expect(postBtn.style.opacity).toBe("0.5")
      // Resolve upload to clean up
      resolveUpload({
        url: "mxc://test/image",
        filename: "uploading.png",
        mimetype: "image/png",
        size: 1000,
        voice: false,
      })
      await new Promise((r) => setTimeout(r, 30))
    })

    it("failed attachment shows Post disabled with reduced opacity", async () => {
      const el = await createEditor({
        uploadMedia: vi.fn(async () => {
          throw new Error("upload failed")
        }),
      })
      const file = new File(["hello"], "fail.png", { type: "image/png" })
      const fileInput = el.querySelector('input[type="file"]') as HTMLInputElement
      Object.defineProperty(fileInput, "files", { value: [file], writable: true })
      fileInput.dispatchEvent(new Event("change", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const postBtn = el.querySelector('[aria-label="Post comment"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(true)
      expect(postBtn.style.opacity).toBe("0.5")
    })

    it("ready attachment shows Post enabled with normal opacity", async () => {
      const el = await createEditor({
        uploadMedia: vi.fn(async () => ({
          url: "mxc://test/image",
          filename: "ready.png",
          mimetype: "image/png",
          size: 1000,
          voice: false,
        })),
      })
      const file = new File(["hello"], "ready.png", { type: "image/png" })
      const fileInput = el.querySelector('input[type="file"]') as HTMLInputElement
      Object.defineProperty(fileInput, "files", { value: [file], writable: true })
      fileInput.dispatchEvent(new Event("change", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const postBtn = el.querySelector('[aria-label="Post comment"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(false)
      expect(postBtn.style.opacity).toBe("1")
    })
  })

  describe("CSS regression guard", () => {
    it("parent cumments-comments stylesheet does not contain generic .editor button selector", async () => {
      // Import the parent component to access its static styles
      const cummentsComments = await import("../cumments-comments")

      // Get the parent component's styles
      // The component uses Lit's css tagged template which generates a CSSResult
      const styles = (cummentsComments.CummentsComments as unknown as { styles?: unknown }).styles

      // Convert styles to string for inspection
      let stylesStr = ""
      if (Array.isArray(styles)) {
        for (const s of styles) {
          stylesStr += s?.toString?.() ?? ""
        }
      } else if (styles) {
        stylesStr = styles?.toString?.() ?? ""
      }

      // The parent stylesheet must NOT contain a generic .editor button selector
      // that could style editor internals
      expect(stylesStr).not.toMatch(/\.editor\s+button/)
      expect(stylesStr).not.toMatch(/\.editor\s+input/)
    })
  })

  describe("Pending attachment lifecycle", () => {
    it("selecting a file creates visible pending attachment content", async () => {
      const el = await createEditor({
        uploadMedia: vi.fn(async () => ({
          url: "mxc://test/image",
          filename: "photo.png",
          mimetype: "image/png",
          size: 1000,
          voice: false,
        })),
      })
      const file = new File(["hello"], "photo.png", { type: "image/png" })
      const fileInput = el.querySelector('input[type="file"]') as HTMLInputElement
      Object.defineProperty(fileInput, "files", { value: [file], writable: true })
      fileInput.dispatchEvent(new Event("change", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Pending attachment should be visible immediately with filename
      expect(el.innerHTML).toContain("photo.png")
      expect(el.innerHTML).toContain("Remove attachment")
    })

    it("uploading state is represented", async () => {
      // Create a promise that we can resolve manually to control timing
      let resolveUpload: (value: {
        url: string
        filename: string
        mimetype: string
        size: number
        voice: boolean
      }) => void = () => {}
      const uploadPromise = new Promise<{
        url: string
        filename: string
        mimetype: string
        size: number
        voice: boolean
      }>((resolve) => {
        resolveUpload = resolve
      })
      const el = await createEditor({
        uploadMedia: vi.fn(async () => uploadPromise),
      })
      const file = new File(["hello"], "uploading.png", { type: "image/png" })
      const fileInput = el.querySelector('input[type="file"]') as HTMLInputElement
      Object.defineProperty(fileInput, "files", { value: [file], writable: true })
      fileInput.dispatchEvent(new Event("change", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Should show uploading state
      expect(el.innerHTML).toContain("Uploading…")
      expect(el.innerHTML).toContain("uploading.png")
      // Resolve the upload
      resolveUpload({
        url: "mxc://test/image",
        filename: "uploading.png",
        mimetype: "image/png",
        size: 1000,
        voice: false,
      })
      await new Promise((r) => setTimeout(r, 30))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    })

    it("successful upload transitions to ready state", async () => {
      const el = await createEditor({
        uploadMedia: vi.fn(async () => ({
          url: "mxc://test/image",
          filename: "success.png",
          mimetype: "image/png",
          size: 1000,
          voice: false,
        })),
      })
      const file = new File(["hello"], "success.png", { type: "image/png" })
      const fileInput = el.querySelector('input[type="file"]') as HTMLInputElement
      Object.defineProperty(fileInput, "files", { value: [file], writable: true })
      fileInput.dispatchEvent(new Event("change", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Should show ready state with filename and remove button
      expect(el.innerHTML).toContain("success.png")
      expect(el.innerHTML).toContain("Remove attachment")
      // Should NOT show uploading text
      expect(el.innerHTML).not.toContain("Uploading…")
    })

    it("failed upload is represented", async () => {
      const el = await createEditor({
        uploadMedia: vi.fn(async () => {
          throw new Error("network error")
        }),
      })
      const file = new File(["hello"], "fail.png", { type: "image/png" })
      const fileInput = el.querySelector('input[type="file"]') as HTMLInputElement
      Object.defineProperty(fileInput, "files", { value: [file], writable: true })
      fileInput.dispatchEvent(new Event("change", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Should show failed state
      expect(el.innerHTML).toContain("fail.png")
      expect(el.innerHTML).toContain("Remove failed attachment")
    })

    it("remove clears the pending attachment", async () => {
      const el = await createEditor({
        uploadMedia: vi.fn(async () => ({
          url: "mxc://test/image",
          filename: "remove-me.png",
          mimetype: "image/png",
          size: 1000,
          voice: false,
        })),
      })
      const file = new File(["hello"], "remove-me.png", { type: "image/png" })
      const fileInput = el.querySelector('input[type="file"]') as HTMLInputElement
      Object.defineProperty(fileInput, "files", { value: [file], writable: true })
      fileInput.dispatchEvent(new Event("change", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect(el.innerHTML).toContain("remove-me.png")
      // Click remove button
      const removeBtn = el.querySelector(
        'button[aria-label="Remove attachment"]',
      ) as HTMLButtonElement
      expect(removeBtn).toBeTruthy()
      removeBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect(el.innerHTML).not.toContain("remove-me.png")
    })

    it("Post is unavailable while upload is pending", async () => {
      let resolveUpload: (value: {
        url: string
        filename: string
        mimetype: string
        size: number
        voice: boolean
      }) => void = () => {}
      const uploadPromise = new Promise<{
        url: string
        filename: string
        mimetype: string
        size: number
        voice: boolean
      }>((resolve) => {
        resolveUpload = resolve
      })
      const el = await createEditor({
        uploadMedia: vi.fn(async () => uploadPromise),
      })
      const file = new File(["hello"], "pending.png", { type: "image/png" })
      const fileInput = el.querySelector('input[type="file"]') as HTMLInputElement
      Object.defineProperty(fileInput, "files", { value: [file], writable: true })
      fileInput.dispatchEvent(new Event("change", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Post should be disabled while uploading
      const postBtn = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(true)
      // Resolve the upload
      resolveUpload({
        url: "mxc://test/image",
        filename: "pending.png",
        mimetype: "image/png",
        size: 1000,
        voice: false,
      })
      await new Promise((r) => setTimeout(r, 30))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    })

    it("Post becomes available again after the attachment is ready", async () => {
      const el = await createEditor({
        uploadMedia: vi.fn(async () => ({
          url: "mxc://test/image",
          filename: "ready.png",
          mimetype: "image/png",
          size: 1000,
          voice: false,
        })),
      })
      const file = new File(["hello"], "ready.png", { type: "image/png" })
      const fileInput = el.querySelector('input[type="file"]') as HTMLInputElement
      Object.defineProperty(fileInput, "files", { value: [file], writable: true })
      fileInput.dispatchEvent(new Event("change", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Post should be enabled with ready attachment
      const postBtn = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(false)
    })

    it("a ready attachment remains present when the text draft changes", async () => {
      const el = await createEditor({
        uploadMedia: vi.fn(async () => ({
          url: "mxc://test/image",
          filename: "persistent.png",
          mimetype: "image/png",
          size: 1000,
          voice: false,
        })),
      })
      const file = new File(["hello"], "persistent.png", { type: "image/png" })
      const fileInput = el.querySelector('input[type="file"]') as HTMLInputElement
      Object.defineProperty(fileInput, "files", { value: [file], writable: true })
      fileInput.dispatchEvent(new Event("change", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect(el.innerHTML).toContain("persistent.png")
      // Change the text draft
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      textarea.value = "some text"
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Attachment should still be present
      expect(el.innerHTML).toContain("persistent.png")
    })

    it("removed upload does not reappear after resolution", async () => {
      // Create a promise that we can resolve manually to control timing
      let resolveUpload: (value: {
        url: string
        filename: string
        mimetype: string
        size: number
        voice: boolean
      }) => void = () => {}
      const uploadPromise = new Promise<{
        url: string
        filename: string
        mimetype: string
        size: number
        voice: boolean
      }>((resolve) => {
        resolveUpload = resolve
      })
      const el = await createEditor({
        uploadMedia: vi.fn(async () => uploadPromise),
      })
      const file = new File(["hello"], "stale.png", { type: "image/png" })
      const fileInput = el.querySelector('input[type="file"]') as HTMLInputElement
      Object.defineProperty(fileInput, "files", { value: [file], writable: true })
      fileInput.dispatchEvent(new Event("change", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Attachment should be visible as uploading
      expect(el.innerHTML).toContain("stale.png")
      expect(el.innerHTML).toContain("Uploading…")
      // Remove the attachment before upload completes
      const removeBtn = el.querySelector(
        'button[aria-label="Remove attachment"]',
      ) as HTMLButtonElement
      removeBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect(el.innerHTML).not.toContain("stale.png")
      // Now resolve the upload - it should NOT reappear
      resolveUpload({
        url: "mxc://test/image",
        filename: "stale.png",
        mimetype: "image/png",
        size: 1000,
        voice: false,
      })
      await new Promise((r) => setTimeout(r, 30))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Attachment must remain absent
      expect(el.innerHTML).not.toContain("stale.png")
    })

    it("failed attachment blocks Post until removed", async () => {
      const el = await createEditor({
        uploadMedia: vi.fn(async () => {
          throw new Error("upload failed")
        }),
      })
      const file = new File(["hello"], "blocked.png", { type: "image/png" })
      const fileInput = el.querySelector('input[type="file"]') as HTMLInputElement
      Object.defineProperty(fileInput, "files", { value: [file], writable: true })
      fileInput.dispatchEvent(new Event("change", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Failed attachment should block Post
      let postBtn = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(true)
      expect(el.innerHTML).toContain("blocked.png")
      // Remove the failed attachment
      const removeBtn = el.querySelector(
        'button[aria-label="Remove failed attachment"]',
      ) as HTMLButtonElement
      expect(removeBtn).toBeTruthy()
      removeBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Post should now be enabled (no content, but attachment no longer blocks)
      postBtn = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(true) // still disabled because no text/content
      expect(el.innerHTML).not.toContain("blocked.png")
    })
  })

  describe("Paste and drag-drop attachments", () => {
    it("pasting a file creates pending attachment", async () => {
      const el = await createEditor({
        uploadMedia: vi.fn(async () => ({
          url: "mxc://test/pasted",
          filename: "pasted.png",
          mimetype: "image/png",
          size: 1000,
          voice: false,
        })),
      })
      const file = new File(["hello"], "pasted.png", { type: "image/png" })
      const editor = el.querySelector(".editor") as HTMLElement
      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: new DataTransfer(),
      })
      ;(pasteEvent.clipboardData as DataTransfer).items.add(file)
      editor.dispatchEvent(pasteEvent)
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect(el.innerHTML).toContain("pasted.png")
      expect(el.innerHTML).toContain("Remove attachment")
    })

    it("plain text paste does not create attachment", async () => {
      const el = await createEditor({
        uploadMedia: vi.fn(async () => ({
          url: "mxc://test/image",
          filename: "test.png",
          mimetype: "image/png",
          size: 1000,
          voice: false,
        })),
      })
      const editor = el.querySelector(".editor") as HTMLElement
      const dt = new DataTransfer()
      dt.setData("text/plain", "hello world")
      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      })
      editor.dispatchEvent(pasteEvent)
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // No attachment should be created from plain text
      const pendingMedia = (el as unknown as { pendingMedia: unknown }).pendingMedia
      expect(pendingMedia).toBeNull()
    })

    it("drag-over activates drop-target visual state", async () => {
      const el = await createEditor()
      const editor = el.querySelector(".editor") as HTMLElement
      // Create a mock dataTransfer with files
      const mockDataTransfer = {
        files: [new File(["test"], "test.txt", { type: "text/plain" })],
        items: [{ kind: "file", type: "text/plain" }],
        types: ["Files"],
      } as unknown as DataTransfer
      const dragEvent = new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
      })
      // Override dataTransfer since happy-dom may not set it from init
      Object.defineProperty(dragEvent, "dataTransfer", { value: mockDataTransfer })
      editor.dispatchEvent(dragEvent)
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Drag-over should show dashed border
      expect(editor.style.border).toContain("dashed")
    })

    it("drag-leave clears drop-target visual state", async () => {
      const el = await createEditor()
      const editor = el.querySelector(".editor") as HTMLElement
      // First activate drag-over
      const mockDataTransfer = {
        files: [new File(["test"], "test.txt", { type: "text/plain" })],
        items: [{ kind: "file", type: "text/plain" }],
        types: ["Files"],
      } as unknown as DataTransfer
      const dragOverEvent = new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dragOverEvent, "dataTransfer", { value: mockDataTransfer })
      editor.dispatchEvent(dragOverEvent)
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect(editor.style.border).toContain("dashed")
      // Now trigger drag-leave
      const dragLeaveEvent = new DragEvent("dragleave", { bubbles: true })
      editor.dispatchEvent(dragLeaveEvent)
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect(editor.style.border).toContain("solid")
    })

    it("dropping a supported file creates pending attachment", async () => {
      const el = await createEditor({
        uploadMedia: vi.fn(async () => ({
          url: "mxc://test/dropped",
          filename: "dropped.png",
          mimetype: "image/png",
          size: 1000,
          voice: false,
        })),
      })
      const editor = el.querySelector(".editor") as HTMLElement
      const file = new File(["hello"], "dropped.png", { type: "image/png" })
      const mockDataTransfer = {
        files: [file],
        items: [{ kind: "file", type: "image/png" }],
        types: ["Files"],
      } as unknown as DataTransfer
      const dropEvent = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dropEvent, "dataTransfer", { value: mockDataTransfer })
      editor.dispatchEvent(dropEvent)
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect(el.innerHTML).toContain("dropped.png")
      expect(el.innerHTML).toContain("Remove attachment")
    })

    it("dropping an unsupported file does not create attachment", async () => {
      const el = await createEditor({
        uploadMedia: vi.fn(async () => ({
          url: "mxc://test/image",
          filename: "test.png",
          mimetype: "image/png",
          size: 1000,
          voice: false,
        })),
      })
      const editor = el.querySelector(".editor") as HTMLElement
      // Create a drop event with no files (e.g., text drop)
      const mockDataTransfer = {
        files: [],
        items: [],
        types: ["text/plain"],
      } as unknown as DataTransfer
      const dropEvent = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dropEvent, "dataTransfer", { value: mockDataTransfer })
      editor.dispatchEvent(dropEvent)
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const pendingMedia = (el as unknown as { pendingMedia: unknown }).pendingMedia
      expect(pendingMedia).toBeNull()
    })

    it("drop prevents default browser behavior", async () => {
      const el = await createEditor({
        uploadMedia: vi.fn(async () => ({
          url: "mxc://test/image",
          filename: "test.png",
          mimetype: "image/png",
          size: 1000,
          voice: false,
        })),
      })
      const editor = el.querySelector(".editor") as HTMLElement
      const file = new File(["hello"], "test.png", { type: "image/png" })
      const mockDataTransfer = {
        files: [file],
        items: [{ kind: "file", type: "image/png" }],
        types: ["Files"],
      } as unknown as DataTransfer
      const dropEvent = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dropEvent, "dataTransfer", { value: mockDataTransfer })
      editor.dispatchEvent(dropEvent)
      // The drop handler should have called preventDefault
      expect(dropEvent.defaultPrevented).toBe(true)
    })
  })
})
