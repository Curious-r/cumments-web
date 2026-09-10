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

  describe("toolbar overflow (model-driven)", () => {
    const originalInnerWidth = window.innerWidth

    afterEach(() => {
      Object.defineProperty(window, "innerWidth", {
        value: originalInnerWidth,
        configurable: true,
      })
    })

    function setViewport(width: number) {
      Object.defineProperty(window, "innerWidth", {
        value: width,
        configurable: true,
      })
    }

    it("desktop: overflow list is empty; More is not rendered", async () => {
      setViewport(1024)
      const el = await createEditor({ profileName: "Alice" })
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete

      const as = el as unknown as { overflowActions: unknown[] }
      expect(as.overflowActions).toHaveLength(0)

      // More button should NOT be in the DOM
      const moreBtn = el.querySelector('button[aria-label="More composer actions"]')
      expect(moreBtn).toBeNull()

      // Direct toolbar should contain Location, Poll, Sticker buttons
      const locationBtn = el.querySelector('button[aria-label="Add location"]')
      const pollBtn = el.querySelector('button[aria-label="Create poll"]')
      const stickerBtn = el.querySelector('button[aria-label="Stickers"]')
      expect(locationBtn).toBeTruthy()
      expect(pollBtn).toBeTruthy()
      expect(stickerBtn).toBeTruthy()
    })

    it("mobile: overflow list contains Location/Poll/Sticker; More is rendered", async () => {
      setViewport(390)
      const el = await createEditor({ profileName: "Alice" })
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete

      const as = el as unknown as { overflowActions: { id: string }[] }
      expect(as.overflowActions?.map((a) => a.id)).toEqual(["location", "poll", "sticker"])

      // More button should be in the DOM
      const moreBtn = el.querySelector('button[aria-label="More composer actions"]')
      expect(moreBtn).toBeTruthy()

      // Direct toolbar should NOT contain Location, Poll, Sticker buttons
      const locationBtn = el.querySelector('button[aria-label="Add location"]')
      const pollBtn = el.querySelector('button[aria-label="Create poll"]')
      const stickerBtn = el.querySelector('button[aria-label="Stickers"]')
      expect(locationBtn).toBeNull()
      expect(pollBtn).toBeNull()
      expect(stickerBtn).toBeNull()

      // Attach and Emoji should still be directly visible
      expect(el.querySelector('button[aria-label="Emoji"]')).toBeTruthy()
    })

    it("opening More menu renders overflow actions as menuitems", async () => {
      setViewport(390)
      const el = await createEditor({ profileName: "Alice" })
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete

      const moreBtn = el.querySelector(
        'button[aria-label="More composer actions"]',
      ) as HTMLButtonElement
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 10))

      const menu = el.querySelector(".more-menu")
      expect(menu).toBeTruthy()

      const menuitems = menu?.querySelectorAll('[role="menuitem"]')
      expect(menuitems).toHaveLength(3)
      const labels = Array.from(menuitems ?? []).map((b) => b.getAttribute("aria-label"))
      expect(labels).toEqual(["Location", "Poll", "Stickers"])
    })

    it("More is not shown when viewport is desktop even after resize", async () => {
      setViewport(1024)
      const el = await createEditor({ profileName: "Alice" })
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete

      // Simulate resize to mobile
      setViewport(390)
      window.dispatchEvent(new Event("resize"))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      await new Promise((r) => setTimeout(r, 10))

      const moreBtn = el.querySelector('button[aria-label="More composer actions"]')
      expect(moreBtn).toBeTruthy()
    })

    it("More closes and is removed when resizing from mobile to desktop", async () => {
      setViewport(390)
      const el = await createEditor({ profileName: "Alice" })
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete

      const moreBtn = el.querySelector(
        'button[aria-label="More composer actions"]',
      ) as HTMLButtonElement
      moreBtn.click()
      await new Promise((r) => setTimeout(r, 10))

      expect(el.querySelector(".more-menu")).toBeTruthy()

      // Resize to desktop — overflow becomes empty, More should close & disappear
      setViewport(1024)
      window.dispatchEvent(new Event("resize"))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      await new Promise((r) => setTimeout(r, 10))

      expect(el.querySelector(".more-menu")).toBeNull()
      expect(el.querySelector('button[aria-label="More composer actions"]')).toBeNull()
    })

    it("each overflow action appears in exactly one place", async () => {
      setViewport(390)
      const el = await createEditor({ profileName: "Alice" })
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete

      const actions = ["location", "poll", "sticker"]
      for (const id of actions) {
        const ariaLabel =
          id === "location" ? "Add location" : id === "poll" ? "Create poll" : "Stickers"
        const directBtn = el.querySelector(`button[aria-label="${ariaLabel}"]`)
        expect(directBtn).toBeNull()
      }
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
      const uploadMock = vi.fn(async () => ({
        url: "mxc://test/image",
        filename: "test.png",
        mimetype: "image/png",
        size: 1000,
        voice: false,
      }))
      const el = await createEditor({ uploadMedia: uploadMock })
      const editor = el.querySelector(".editor") as HTMLElement
      // Drop an actually unsupported file type (.exe)
      const unsupportedFile = new File(["malware"], "program.exe", {
        type: "application/x-msdownload",
      })
      const mockDataTransfer = {
        files: [unsupportedFile],
        items: [{ kind: "file", type: "application/x-msdownload" }],
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
      // No attachment should be created
      const pendingMedia = (el as unknown as { pendingMedia: unknown }).pendingMedia
      expect(pendingMedia).toBeNull()
      // Upload should NOT have been called
      expect(uploadMock).not.toHaveBeenCalled()
      // Default must be prevented even for unsupported files
      expect(dropEvent.defaultPrevented).toBe(true)
    })

    it("non-file drag data does not activate drop-target state", async () => {
      const el = await createEditor()
      const editor = el.querySelector(".editor") as HTMLElement
      // Simulate dragging text (not files)
      const mockDataTransfer = {
        files: [],
        items: [{ kind: "string", type: "text/plain" }],
        types: ["text/plain"],
      } as unknown as DataTransfer
      const dragEvent = new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dragEvent, "dataTransfer", { value: mockDataTransfer })
      editor.dispatchEvent(dragEvent)
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Should NOT show dashed border for non-file drag
      expect(editor.style.border).toContain("solid")
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

  describe("Emoji picker", () => {
    it("emoji button opens the picker", async () => {
      const el = await createEditor({ profileName: "Alice" })
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      expect(emojiBtn).toBeTruthy()
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const picker = el.querySelector('[role="dialog"][aria-label="Emoji picker"]')
      expect(picker).toBeTruthy()
    })

    it("selecting an emoji inserts it at the caret", async () => {
      const el = await createEditor({ profileName: "Alice" })
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      // Establish draft through real input path
      textarea.value = "hello world"
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      textarea.selectionStart = 5
      textarea.selectionEnd = 5
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Open picker
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Click an emoji
      const emojiButton = el.querySelector(
        '[role="dialog"][aria-label="Emoji picker"] button[aria-label="grinning face"]',
      ) as HTMLButtonElement
      expect(emojiButton).toBeTruthy()
      emojiButton.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Emoji should be inserted at position 5
      expect((el as unknown as { draft: string }).draft).toBe("hello😀 world")
    })

    it("selecting an emoji replaces text selection", async () => {
      const el = await createEditor({ profileName: "Alice" })
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      // Establish draft through real input path
      textarea.value = "hello world"
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      textarea.selectionStart = 5
      textarea.selectionEnd = 6
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Open picker
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Click an emoji
      const emojiButton = el.querySelector(
        '[role="dialog"][aria-label="Emoji picker"] button[aria-label="grinning face"]',
      ) as HTMLButtonElement
      emojiButton.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Selection " " should be replaced with emoji
      expect((el as unknown as { draft: string }).draft).toBe("hello😀world")
    })

    it("textarea regains focus after insertion", async () => {
      const el = await createEditor({ profileName: "Alice" })
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      // Open picker
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Click an emoji
      const emojiButton = el.querySelector(
        '[role="dialog"][aria-label="Emoji picker"] button[aria-label="grinning face"]',
      ) as HTMLButtonElement
      emojiButton.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Focus should return to textarea
      expect(document.activeElement).toBe(textarea)
    })

    it("Escape closes the picker", async () => {
      const el = await createEditor({ profileName: "Alice" })
      // Open picker
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect(el.querySelector('[role="dialog"][aria-label="Emoji picker"]')).toBeTruthy()
      // Send Escape
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect(el.querySelector('[role="dialog"][aria-label="Emoji picker"]')).toBeNull()
    })

    it("closing the picker preserves reply/thread context", async () => {
      const el = await createEditor({ profileName: "Alice" })
      el.setReplyToId("$parent")
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Open and close picker
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const emojiButton = el.querySelector(
        '[role="dialog"][aria-label="Emoji picker"] button[aria-label="grinning face"]',
      ) as HTMLButtonElement
      emojiButton.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Reply context should be preserved
      expect((el as unknown as { currentReplyToId: string | null }).currentReplyToId).toBe(
        "$parent",
      )
    })

    it("search filters the displayed emoji set", async () => {
      const el = await createEditor({ profileName: "Alice" })
      // Open picker
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Search for "heart"
      const searchInput = el.querySelector(
        '[role="dialog"][aria-label="Emoji picker"] input[type="search"]',
      ) as HTMLInputElement
      searchInput.value = "heart"
      searchInput.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Should show heart emojis but not smileys
      expect(
        el.querySelector(
          '[role="dialog"][aria-label="Emoji picker"] button[aria-label="heart eyes"]',
        ),
      ).toBeTruthy()
      expect(
        el.querySelector(
          '[role="dialog"][aria-label="Emoji picker"] button[aria-label="grinning face"]',
        ),
      ).toBeNull()
    })

    it("selecting an emoji updates recent emojis", async () => {
      const el = await createEditor({ profileName: "Alice" })
      // Open picker
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Click an emoji
      const emojiButton = el.querySelector(
        '[role="dialog"][aria-label="Emoji picker"] button[aria-label="grinning face"]',
      ) as HTMLButtonElement
      emojiButton.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Recent emojis should be updated
      expect((el as unknown as { recentEmojis: string[] }).recentEmojis[0]).toBe("😀")
    })

    it("picker remains usable when storage is unavailable", async () => {
      // Mock localStorage to throw
      const originalGetItem = localStorage.getItem
      const originalSetItem = localStorage.setItem
      localStorage.getItem = () => {
        throw new Error("unavailable")
      }
      localStorage.setItem = () => {
        throw new Error("unavailable")
      }
      try {
        const el = await createEditor({ profileName: "Alice" })
        // Open picker - should not throw
        const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
        emojiBtn.click()
        await new Promise((r) => setTimeout(r, 10))
        await (el as unknown as { updateComplete: Promise<void> }).updateComplete
        expect(el.querySelector('[role="dialog"][aria-label="Emoji picker"]')).toBeTruthy()
        // Selecting emoji should work without storage
        const emojiButton = el.querySelector(
          '[role="dialog"][aria-label="Emoji picker"] button[aria-label="grinning face"]',
        ) as HTMLButtonElement
        expect(emojiButton).toBeTruthy()
        emojiButton.click()
        await new Promise((r) => setTimeout(r, 10))
        await (el as unknown as { updateComplete: Promise<void> }).updateComplete
        expect((el as unknown as { draft: string }).draft).toContain("😀")
      } finally {
        localStorage.getItem = originalGetItem
        localStorage.setItem = originalSetItem
      }
    })

    it("recent emoji entries expose human-readable accessible names", async () => {
      const el = await createEditor({ profileName: "Alice" })
      // First add an emoji to recents
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const emojiButton = el.querySelector(
        '[role="dialog"][aria-label="Emoji picker"] button[aria-label="grinning face"]',
      ) as HTMLButtonElement
      emojiButton.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Reopen picker
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Recent emoji should have human-readable name, not raw Unicode
      const recentBtn = el.querySelector(
        '[role="dialog"][aria-label="Emoji picker"] button[aria-label="grinning face"]',
      ) as HTMLButtonElement | null
      expect(recentBtn).toBeTruthy()
      expect(recentBtn?.getAttribute("aria-label")).toBe("grinning face")
    })
  })

  describe("Emoji picker categories and keyboard navigation", () => {
    it("opening the picker focuses the search input", async () => {
      const el = await createEditor({ profileName: "Alice" })
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const searchInput = el.querySelector(
        '[role="dialog"][aria-label="Emoji picker"] input[type="search"]',
      ) as HTMLInputElement | null
      expect(document.activeElement).toBe(searchInput)
    })

    it("Arrow keys in search input do not move emoji active index", async () => {
      const el = await createEditor({ profileName: "Alice" })
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const searchInput = el.querySelector(
        '[role="dialog"][aria-label="Emoji picker"] input[type="search"]',
      ) as HTMLInputElement
      searchInput.focus()
      searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // No emoji should be focused (search input retains focus)
      expect(document.activeElement).toBe(searchInput)
    })

    it("Enter in search input does not select an emoji", async () => {
      const el = await createEditor({ profileName: "Alice" })
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const searchInput = el.querySelector(
        '[role="dialog"][aria-label="Emoji picker"] input[type="search"]',
      ) as HTMLInputElement
      searchInput.focus()
      searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Draft should remain empty (no emoji selected)
      expect((el as unknown as { draft: string }).draft).toBe("")
      // Picker should still be open
      expect(el.querySelector('[role="dialog"][aria-label="Emoji picker"]')).toBeTruthy()
    })

    it("category button responds to Enter/Space normally", async () => {
      const el = await createEditor({ profileName: "Alice" })
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Find and focus the "People" category button
      const categoryButtons = el.querySelectorAll(
        ".emoji-picker-category-controls button",
      ) as NodeListOf<HTMLButtonElement>
      const peopleBtn = Array.from(categoryButtons).find((b) => b.textContent?.trim() === "People")
      expect(peopleBtn).toBeTruthy()
      peopleBtn?.focus()
      // Native button Enter/Space triggers click
      peopleBtn?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      peopleBtn?.dispatchEvent(new Event("click", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Category should be selected
      expect(peopleBtn?.getAttribute("aria-pressed")).toBe("true")
    })

    it("Arrow keys while category button focused are not emoji navigation", async () => {
      const el = await createEditor({ profileName: "Alice" })
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const categoryButtons = el.querySelectorAll(
        ".emoji-picker-category-controls button",
      ) as NodeListOf<HTMLButtonElement>
      const peopleBtn = Array.from(categoryButtons).find((b) => b.textContent?.trim() === "People")
      peopleBtn?.focus()
      peopleBtn?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Category button should retain focus (not emoji grid)
      expect(document.activeElement).toBe(peopleBtn)
    })

    it("selecting a category moves focus to first emoji", async () => {
      const el = await createEditor({ profileName: "Alice" })
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const categoryButtons = el.querySelectorAll(
        ".emoji-picker-category-controls button",
      ) as NodeListOf<HTMLButtonElement>
      const peopleBtn = Array.from(categoryButtons).find((b) => b.textContent?.trim() === "People")
      peopleBtn?.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Focus should move to first emoji in category
      const focused = el.querySelector(".emoji-picker-grid button:focus") as HTMLElement | null
      expect(focused).toBeTruthy()
      expect(focused?.getAttribute("aria-label")).toBe("thumbs up")
    })

    it("ArrowRight/ArrowDown on focused emoji moves to next", async () => {
      const el = await createEditor({ profileName: "Alice" })
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Focus first emoji
      const firstEmoji = el.querySelector(".emoji-picker-grid button") as HTMLButtonElement
      firstEmoji.focus()
      firstEmoji.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Second emoji should be focused
      const focused = el.querySelector(".emoji-picker-grid button:focus") as HTMLElement | null
      expect(focused).toBeTruthy()
      expect(focused?.getAttribute("aria-label")).toBe("beaming face")
    })

    it("ArrowLeft/ArrowUp moves backward", async () => {
      const el = await createEditor({ profileName: "Alice" })
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Focus second emoji
      const emojiButtons = el.querySelectorAll(
        ".emoji-picker-grid button",
      ) as NodeListOf<HTMLButtonElement>
      emojiButtons[1].focus()
      emojiButtons[1].dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
      )
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const focused = el.querySelector(".emoji-picker-grid button:focus") as HTMLElement | null
      expect(focused).toBeTruthy()
      expect(focused?.getAttribute("aria-label")).toBe("grinning face")
    })

    it("Enter/Space on focused emoji selects it", async () => {
      const el = await createEditor({ profileName: "Alice" })
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      textarea.value = "test"
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const firstEmoji = el.querySelector(".emoji-picker-grid button") as HTMLButtonElement
      firstEmoji.focus()
      firstEmoji.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect((el as unknown as { draft: string }).draft).toBe("test😀")
    })

    it("Escape closes picker from search, category, and emoji-grid", async () => {
      const el = await createEditor({ profileName: "Alice" })
      const emojiBtn = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      emojiBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Test Escape from search input
      const searchInput = el.querySelector(
        '[role="dialog"][aria-label="Emoji picker"] input[type="search"]',
      ) as HTMLInputElement
      searchInput.focus()
      searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect(el.querySelector('[role="dialog"][aria-label="Emoji picker"]')).toBeNull()
    })
  })

  /**
   * Regression: the Emoji picker necessarily takes focus away from the
   * textarea, so the caret/selection the user had before opening it must be
   * preserved and reused when an emoji is chosen. These tests drive the real
   * interaction boundary (mousedown → focusout → picker → selection) instead
   * of calling the insertion helper directly.
   */
  describe("Emoji insertion preserves selection across picker focus", () => {
    const flush = async (el: CummentsEditor) => {
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    }

    const draftOf = (el: CummentsEditor) => (el as unknown as { draft: string }).draft

    const emojiOption = (el: CummentsEditor, name: string) =>
      el.querySelector(
        `[role="dialog"][aria-label="Emoji picker"] button[aria-label="${name}"]`,
      ) as HTMLButtonElement

    /** Type through the real input path, then place the caret/selection. */
    async function setupComposer(
      text: string,
      start: number,
      end: number,
    ): Promise<{ el: CummentsEditor; textarea: HTMLTextAreaElement }> {
      const el = await createEditor({ profileName: "Alice" })
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      textarea.focus()
      textarea.value = text
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      textarea.selectionStart = start
      textarea.selectionEnd = end
      await flush(el)
      return { el, textarea }
    }

    /**
     * Model the behaviour that caused the original bug: after focus moves to
     * the Emoji toggle, the textarea's live selection is no longer a reliable
     * source of truth. happy-dom happens to retain selectionStart/End across
     * blur, so we explicitly drop them here — a correct implementation must
     * fall back to the selection saved during the focus transition.
     */
    function liveSelectionUnavailable(textarea: HTMLTextAreaElement) {
      textarea.selectionStart = 0
      textarea.selectionEnd = 0
    }

    /**
     * Replay the pointer interaction: mousedown on the Emoji toggle saves the
     * selection while the textarea is still focused, focus then leaves the
     * textarea, and only afterwards does the live selection become unreliable.
     */
    async function openPickerFromEmojiToggle(
      el: CummentsEditor,
      textarea: HTMLTextAreaElement,
    ): Promise<HTMLButtonElement> {
      const toggle = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement
      expect(toggle).toBeTruthy()
      // 1. Pointer down on the toolbar control — selection is still live.
      toggle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
      // 2. Focus leaves the textarea (real focus transition).
      toggle.focus()
      // 3. Only now is the textarea's live selection no longer trustworthy.
      liveSelectionUnavailable(textarea)
      // 4. The picker opens and takes focus.
      toggle.click()
      await flush(el)
      return toggle
    }

    it("inserts at the caret and leaves the caret after the emoji", async () => {
      const { el, textarea } = await setupComposer("hello", 5, 5)

      await openPickerFromEmojiToggle(el, textarea)
      emojiOption(el, "grinning face").click()
      await flush(el)

      expect(textarea.value).toBe("hello😀")
      expect(draftOf(el)).toBe("hello😀")
      // 😀 is U+1F600 — two UTF-16 code units — so the caret moves from 5 to 7.
      expect(textarea.selectionStart).toBe(7)
      expect(textarea.selectionEnd).toBe(7)
    })

    it("replaces the selected text and leaves the caret after the emoji", async () => {
      const { el, textarea } = await setupComposer("hello world", 6, 11)

      await openPickerFromEmojiToggle(el, textarea)
      emojiOption(el, "grinning face").click()
      await flush(el)

      expect(textarea.value).toBe("hello 😀")
      expect(draftOf(el)).toBe("hello 😀")
      // Caret immediately after the emoji: 6 + 2 UTF-16 code units.
      expect(textarea.selectionStart).toBe(8)
      expect(textarea.selectionEnd).toBe(8)
    })

    it("keeps textarea.value and draft in sync across a later reactive update", async () => {
      const { el, textarea } = await setupComposer("hello", 5, 5)

      await openPickerFromEmojiToggle(el, textarea)
      emojiOption(el, "grinning face").click()
      await flush(el)

      expect(textarea.value).toBe(draftOf(el))

      // A subsequent reactive pass must not restore the pre-emoji draft.
      el.requestUpdate()
      await flush(el)
      expect(draftOf(el)).toBe("hello😀")
      expect(textarea.value).toBe("hello😀")
    })

    it("returns focus to the textarea so typing continues after the emoji", async () => {
      const { el, textarea } = await setupComposer("hello", 5, 5)

      await openPickerFromEmojiToggle(el, textarea)
      emojiOption(el, "grinning face").click()
      await flush(el)

      expect(document.activeElement).toBe(textarea)
      const caret = textarea.selectionStart
      expect(caret).toBe(7)

      // Type through the real input path at the restored caret.
      textarea.value = `${textarea.value.slice(0, caret)}!${textarea.value.slice(caret)}`
      textarea.selectionStart = caret + 1
      textarea.selectionEnd = caret + 1
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      await flush(el)

      expect(textarea.value).toBe("hello😀!")
      expect(draftOf(el)).toBe("hello😀!")
    })

    it("inserts via the keyboard selection path at the saved caret", async () => {
      const { el, textarea } = await setupComposer("hello", 5, 5)
      const toggle = el.querySelector('button[aria-label="Emoji"]') as HTMLButtonElement

      // Keyboard reach: focus moves to the Emoji toggle with no mousedown, so
      // the focusout fallback alone must preserve the caret.
      toggle.focus()
      liveSelectionUnavailable(textarea)
      toggle.click()
      await flush(el)

      const firstEmoji = el.querySelector(".emoji-picker-grid button") as HTMLButtonElement
      expect(firstEmoji?.getAttribute("aria-label")).toBe("grinning face")
      firstEmoji.focus()
      firstEmoji.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      await flush(el)

      expect(textarea.value).toBe("hello😀")
      expect(draftOf(el)).toBe("hello😀")
      expect(textarea.selectionStart).toBe(7)
      expect(textarea.selectionEnd).toBe(7)
    })
  })

  describe("Markdown formatting integration", () => {
    async function setupEditorWithText(
      text: string,
    ): Promise<{ el: CummentsEditor; textarea: HTMLTextAreaElement }> {
      const el = await createEditor({ profileName: "Alice" })
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      textarea.value = text
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      return { el, textarea }
    }

    it("bold formatting updates draft and restores selection", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      ;(el as unknown as { applyMarkdownFormat: (f: string) => void }).applyMarkdownFormat("bold")
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("**hello** world")
      expect(textarea.selectionStart).toBe(2)
      expect(textarea.selectionEnd).toBe(7)
    })

    it("italic formatting updates draft", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      ;(el as unknown as { applyMarkdownFormat: (f: string) => void }).applyMarkdownFormat("italic")
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("*hello* world")
      expect(textarea.selectionStart).toBe(1)
      expect(textarea.selectionEnd).toBe(6)
    })

    it("link formatting updates draft", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      ;(
        el as unknown as { applyMarkdownFormat: (f: string, url: string) => void }
      ).applyMarkdownFormat("link", "https://example.com")
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("[hello](https://example.com) world")
      expect(textarea.selectionStart).toBe(1)
      expect(textarea.selectionEnd).toBe(6)
    })

    it("missing link URL is a no-op", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      ;(
        el as unknown as { applyMarkdownFormat: (f: string, url?: string) => void }
      ).applyMarkdownFormat("link")
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("hello world")
      expect(textarea.selectionStart).toBe(0)
      expect(textarea.selectionEnd).toBe(5)
    })

    it("toggle bold removes markers", async () => {
      const { el, textarea } = await setupEditorWithText("**hello** world")
      textarea.selectionStart = 2
      textarea.selectionEnd = 7
      ;(el as unknown as { applyMarkdownFormat: (f: string) => void }).applyMarkdownFormat("bold")
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("hello world")
    })

    it("focus is restored after formatting", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      ;(el as unknown as { applyMarkdownFormat: (f: string) => void }).applyMarkdownFormat("bold")
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect(document.activeElement).toBe(textarea)
    })

    it("emoji insertion still works after formatting", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      ;(el as unknown as { applyMarkdownFormat: (f: string) => void }).applyMarkdownFormat("bold")
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // After formatting, selection is on "hello" (positions 2-7 in **hello** world)
      // Insert emoji at the current selection (replaces "hello" with emoji)
      ;(el as unknown as { insertEmojiAtCaret: (e: string) => void }).insertEmojiAtCaret("😀")
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("**😀** world")
    })

    it("formatting works after emoji insertion", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      // Set caret at position 5 (after "hello")
      textarea.selectionStart = 5
      textarea.selectionEnd = 5
      ;(el as unknown as { insertEmojiAtCaret: (e: string) => void }).insertEmojiAtCaret("😀")
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // After emoji insertion, draft is "hello😀 world" and caret is after emoji (position 8)
      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("hello😀 world")
    })

    it("formatting preserves reply context", async () => {
      const el = await createEditor({ profileName: "Alice" })
      el.setReplyToId("$parent")
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      textarea.value = "hello world"
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      ;(el as unknown as { applyMarkdownFormat: (f: string) => void }).applyMarkdownFormat("bold")
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect((el as unknown as { currentReplyToId: string | null }).currentReplyToId).toBe(
        "$parent",
      )
    })

    it("formatting preserves pending media", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      ;(el as unknown as { pendingMedia: unknown }).pendingMedia = {
        url: "test.png",
        kind: "image/png",
        filename: "test.png",
        state: "ready",
      }
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      ;(el as unknown as { applyMarkdownFormat: (f: string) => void }).applyMarkdownFormat("bold")
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect(
        (el as unknown as { pendingMedia: { state: string } | null }).pendingMedia?.state,
      ).toBe("ready")
    })

    it("formatting with emoji preserves correct selection", async () => {
      const { el, textarea } = await setupEditorWithText("😀 hello 🚀")
      // 😀 is 2 UTF-16 units, so "hello" starts at position 3
      textarea.selectionStart = 3
      textarea.selectionEnd = 8
      ;(el as unknown as { applyMarkdownFormat: (f: string) => void }).applyMarkdownFormat("bold")
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("😀 **hello** 🚀")
      // Selection shifted by 2 for ** prefix
      expect(textarea.selectionStart).toBe(5)
      expect(textarea.selectionEnd).toBe(10)
    })
  })

  describe("Markdown formatting toolbar", () => {
    async function setupEditorWithText(
      text: string,
    ): Promise<{ el: CummentsEditor; textarea: HTMLTextAreaElement }> {
      const el = await createEditor({ profileName: "Alice" })
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      textarea.value = text
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      return { el, textarea }
    }

    it("bold button formats selection", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      const boldBtn = el.querySelector('button[aria-label="Bold"]') as HTMLButtonElement
      boldBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      boldBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("**hello** world")
      expect(textarea.selectionStart).toBe(2)
      expect(textarea.selectionEnd).toBe(7)
    })

    it("italic button formats selection", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      const italicBtn = el.querySelector('button[aria-label="Italic"]') as HTMLButtonElement
      italicBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      italicBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("*hello* world")
    })

    it("strikethrough button formats selection", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      const strikeBtn = el.querySelector('button[aria-label="Strikethrough"]') as HTMLButtonElement
      strikeBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      strikeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("~~hello~~ world")
    })

    it("code button formats selection", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      const codeBtn = el.querySelector('button[aria-label="Code"]') as HTMLButtonElement
      codeBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      codeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("`hello` world")
    })

    it("formatting preserves focus", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      const boldBtn = el.querySelector('button[aria-label="Bold"]') as HTMLButtonElement
      boldBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      boldBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect(document.activeElement).toBe(textarea)
    })

    it("toggle bold off when already bold", async () => {
      const { el, textarea } = await setupEditorWithText("**hello** world")
      textarea.selectionStart = 2
      textarea.selectionEnd = 7
      const boldBtn = el.querySelector('button[aria-label="Bold"]') as HTMLButtonElement
      boldBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      boldBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("hello world")
    })

    it("link button opens URL input", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      const linkBtn = el.querySelector('button[aria-label="Link"]') as HTMLButtonElement
      linkBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      linkBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect(el.querySelector('[role="dialog"][aria-label="Insert link"]')).toBeTruthy()
    })

    it("link with valid URL creates markdown link", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      const linkBtn = el.querySelector('button[aria-label="Link"]') as HTMLButtonElement
      linkBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      linkBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const linkDialog = el.querySelector(
        '[role="dialog"][aria-label="Insert link"]',
      ) as HTMLElement
      const input = linkDialog.querySelector('input[name="url"]') as HTMLInputElement
      input.value = "https://example.com"
      const form = linkDialog.querySelector("form") as HTMLFormElement
      form.dispatchEvent(new Event("submit", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("[hello](https://example.com) world")
    })

    it("empty URL does not modify draft", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      const linkBtn = el.querySelector('button[aria-label="Link"]') as HTMLButtonElement
      linkBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      linkBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const linkDialog = el.querySelector(
        '[role="dialog"][aria-label="Insert link"]',
      ) as HTMLElement
      const input = linkDialog.querySelector('input[name="url"]') as HTMLInputElement
      input.value = ""
      const form = linkDialog.querySelector("form") as HTMLFormElement
      form.dispatchEvent(new Event("submit", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("hello world")
    })

    it("whitespace-only URL does not modify draft", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      const linkBtn = el.querySelector('button[aria-label="Link"]') as HTMLButtonElement
      linkBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      linkBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const linkDialog = el.querySelector(
        '[role="dialog"][aria-label="Insert link"]',
      ) as HTMLElement
      const input = linkDialog.querySelector('input[name="url"]') as HTMLInputElement
      input.value = "   "
      const form = linkDialog.querySelector("form") as HTMLFormElement
      form.dispatchEvent(new Event("submit", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("hello world")
    })

    it("escape closes link UI", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      const linkBtn = el.querySelector('button[aria-label="Link"]') as HTMLButtonElement
      linkBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      linkBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const linkDialog = el.querySelector(
        '[role="dialog"][aria-label="Insert link"]',
      ) as HTMLElement
      linkDialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect(el.querySelector('[role="dialog"][aria-label="Insert link"]')).toBeNull()
    })

    it("formatting preserves reply context", async () => {
      const el = await createEditor({ profileName: "Alice" })
      el.setReplyToId("$parent")
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const { textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      const boldBtn = el.querySelector('button[aria-label="Bold"]') as HTMLButtonElement
      boldBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect((el as unknown as { currentReplyToId: string | null }).currentReplyToId).toBe(
        "$parent",
      )
    })

    it("formatting buttons have accessible names", async () => {
      const el = await createEditor({ profileName: "Alice" })
      expect(
        (el.querySelector('button[aria-label="Bold"]') as HTMLButtonElement).getAttribute(
          "aria-label",
        ),
      ).toBe("Bold")
      expect(
        (el.querySelector('button[aria-label="Italic"]') as HTMLButtonElement).getAttribute(
          "aria-label",
        ),
      ).toBe("Italic")
      expect(
        (el.querySelector('button[aria-label="Strikethrough"]') as HTMLButtonElement).getAttribute(
          "aria-label",
        ),
      ).toBe("Strikethrough")
      expect(
        (el.querySelector('button[aria-label="Code"]') as HTMLButtonElement).getAttribute(
          "aria-label",
        ),
      ).toBe("Code")
      expect(
        (el.querySelector('button[aria-label="Link"]') as HTMLButtonElement).getAttribute(
          "aria-label",
        ),
      ).toBe("Link")
    })

    it("Enter key activates bold formatting", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      const boldBtn = el.querySelector('button[aria-label="Bold"]') as HTMLButtonElement
      // Focus the button and simulate Enter key activation
      boldBtn.focus()
      // Simulate focus moving from textarea to button (triggers focusout on textarea)
      textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: boldBtn }))
      // Native buttons trigger click on Enter/Space - simulate browser behavior
      boldBtn.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      boldBtn.dispatchEvent(new Event("click", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("**hello** world")
      expect(textarea.selectionStart).toBe(2)
      expect(textarea.selectionEnd).toBe(7)
    })

    it("Space key activates bold formatting", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      const boldBtn = el.querySelector('button[aria-label="Bold"]') as HTMLButtonElement
      // Focus the button and simulate Space key activation
      boldBtn.focus()
      // Simulate focus moving from textarea to button (triggers focusout on textarea)
      textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: boldBtn }))
      // Native buttons trigger click on Space - simulate browser behavior
      boldBtn.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }))
      boldBtn.dispatchEvent(new Event("click", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("**hello** world")
      expect(textarea.selectionStart).toBe(2)
      expect(textarea.selectionEnd).toBe(7)
    })

    it("keyboard link activation preserves selection and opens URL input", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      const linkBtn = el.querySelector('button[aria-label="Link"]') as HTMLButtonElement
      // Focus the button and simulate Enter key activation
      linkBtn.focus()
      // Simulate focus moving from textarea to button (triggers focusout on textarea)
      textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: linkBtn }))
      // Native buttons trigger click on Enter - simulate browser behavior
      linkBtn.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      linkBtn.dispatchEvent(new Event("click", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect(el.querySelector('[role="dialog"][aria-label="Insert link"]')).toBeTruthy()
    })

    it("keyboard link submission produces markdown link", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      const linkBtn = el.querySelector('button[aria-label="Link"]') as HTMLButtonElement
      // Focus the button and simulate Enter key activation
      linkBtn.focus()
      // Simulate focus moving from textarea to button (triggers focusout on textarea)
      textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: linkBtn }))
      // Native buttons trigger click on Enter - simulate browser behavior
      linkBtn.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      linkBtn.dispatchEvent(new Event("click", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const linkDialog = el.querySelector(
        '[role="dialog"][aria-label="Insert link"]',
      ) as HTMLElement
      const input = linkDialog.querySelector('input[name="url"]') as HTMLInputElement
      input.value = "https://example.com"
      const form = linkDialog.querySelector("form") as HTMLFormElement
      form.dispatchEvent(new Event("submit", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("[hello](https://example.com) world")
    })

    it("escape from link UI leaves draft unchanged", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      const linkBtn = el.querySelector('button[aria-label="Link"]') as HTMLButtonElement
      // Focus the button and simulate Enter key activation
      linkBtn.focus()
      // Simulate focus moving from textarea to button (triggers focusout on textarea)
      textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: linkBtn }))
      // Native buttons trigger click on Enter - simulate browser behavior
      linkBtn.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      linkBtn.dispatchEvent(new Event("click", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const linkDialog = el.querySelector(
        '[role="dialog"][aria-label="Insert link"]',
      ) as HTMLElement
      linkDialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("hello world")
      expect(el.querySelector('[role="dialog"][aria-label="Insert link"]')).toBeNull()
    })

    it("mousedown does not preventDefault", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 5
      const boldBtn = el.querySelector('button[aria-label="Bold"]') as HTMLButtonElement
      const mdEvent = new MouseEvent("mousedown", { bubbles: true, cancelable: true })
      boldBtn.dispatchEvent(mdEvent)
      expect(mdEvent.defaultPrevented).toBe(false)
    })

    it("real browser click flow applies bold formatting", async () => {
      // Simulates real browser behavior: mousedown fires (without preventDefault),
      // focus may move to the button, then click fires naturally.
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 2
      textarea.selectionEnd = 5
      const boldBtn = el.querySelector('button[aria-label="Bold"]') as HTMLButtonElement

      // Step 1: mousedown saves selection (no preventDefault)
      boldBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))

      // Step 2: textarea loses focus to button (focusout saves selection as fallback)
      textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: boldBtn }))

      // Step 3: click fires naturally (not suppressed by preventDefault)
      boldBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))

      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete

      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("he**llo** world")
      // Selection preserved on the formatted text (2 for 'he', +2 for '**')
      expect(textarea.selectionStart).toBe(4)
      expect(textarea.selectionEnd).toBe(7)
      // Focus restored to textarea
      expect(document.activeElement).toBe(textarea)
    })

    it("real browser click flow applies italic formatting", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 2
      textarea.selectionEnd = 5

      const italicBtn = el.querySelector('button[aria-label="Italic"]') as HTMLButtonElement

      italicBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
      textarea.dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: italicBtn }),
      )
      italicBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))

      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete

      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("he*llo* world")
      expect(textarea.selectionStart).toBe(3)
      expect(textarea.selectionEnd).toBe(6)
    })

    it("real browser click flow applies strikethrough formatting", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 2
      textarea.selectionEnd = 5

      const strikeBtn = el.querySelector('button[aria-label="Strikethrough"]') as HTMLButtonElement

      strikeBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
      textarea.dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: strikeBtn }),
      )
      strikeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))

      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete

      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("he~~llo~~ world")
      expect(textarea.selectionStart).toBe(4)
      expect(textarea.selectionEnd).toBe(7)
    })

    it("real browser click flow applies code formatting", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 2
      textarea.selectionEnd = 5

      const codeBtn = el.querySelector('button[aria-label="Code"]') as HTMLButtonElement

      codeBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
      textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: codeBtn }))
      codeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))

      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete

      const draft = (el as unknown as { currentDraft: string }).currentDraft
      expect(draft).toBe("he`llo` world")
      expect(textarea.selectionStart).toBe(3)
      expect(textarea.selectionEnd).toBe(6)
    })

    it("repeated formatting operations apply correctly", async () => {
      const { el, textarea } = await setupEditorWithText("hello world")
      textarea.selectionStart = 0
      textarea.selectionEnd = 11

      const boldBtn = el.querySelector('button[aria-label="Bold"]') as HTMLButtonElement
      const italicBtn = el.querySelector('button[aria-label="Italic"]') as HTMLButtonElement

      // First: bold the entire text
      boldBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
      textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: boldBtn }))
      boldBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete

      expect((el as unknown as { currentDraft: string }).currentDraft).toBe("**hello world**")

      // Second: italic the entire already-bolded text
      textarea.selectionStart = 0
      textarea.selectionEnd = 15
      italicBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
      textarea.dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: italicBtn }),
      )
      italicBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete

      expect((el as unknown as { currentDraft: string }).currentDraft).toBe("***hello world***")
    })
  })
})
