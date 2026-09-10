import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./cumments-editor"
import type { CummentsEditor, CummentsSubmitDetail } from "./cumments-editor"

describe("Poll composer", () => {
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

  it("normal comment mode still works", async () => {
    const el = await createEditor({ profileName: "Alice" })
    const input = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
    input.value = "hello"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    let detail: CummentsSubmitDetail | null = null
    el.addEventListener("cumments:submit", (e: Event) => {
      detail = (e as CustomEvent).detail
    })
    const btn = el.querySelector('button[part="button"]') as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 10))
    expect(detail).not.toBeNull()
    const d = detail as unknown as CummentsSubmitDetail
    expect(d.content).toBe("hello")
    expect(d.poll).toBeUndefined()
  })

  it("switch to Poll mode shows poll editor", async () => {
    const el = await createEditor()
    const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
    expect(pollBtn).toBeTruthy()
    pollBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(el.querySelector('input[aria-label="Poll question"]')).toBeTruthy()
    expect(el.querySelectorAll('input[aria-label^="Option"]').length).toBe(2)
    expect(el.innerHTML).toContain("Poll")
  })

  it("add and remove options", async () => {
    const el = await createEditor()
    const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
    pollBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    const addBtn = el.querySelector('button[aria-label="Add option"]') as HTMLButtonElement
    addBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(el.querySelectorAll('input[aria-label^="Option"]').length).toBe(3)
    // Remove one
    const removeBtn = el.querySelector('button[aria-label="Remove option 1"]') as HTMLButtonElement
    expect(removeBtn).toBeTruthy()
    removeBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(el.querySelectorAll('input[aria-label^="Option"]').length).toBe(2)
    // Cannot go below 2
    const removeBtn2 = el.querySelector('button[aria-label="Remove option 1"]') as HTMLButtonElement
    expect(removeBtn2.disabled).toBe(true)
    // Add up to 20
    for (let i = 2; i < 20; i++) {
      const b = el.querySelector('button[aria-label="Add option"]') as HTMLButtonElement
      b.click()
      await new Promise((r) => setTimeout(r, 5))
    }
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(el.querySelectorAll('input[aria-label^="Option"]').length).toBe(20)
    const addBtn20 = el.querySelector('button[aria-label="Add option"]') as HTMLButtonElement
    expect(addBtn20.disabled).toBe(true)
  })

  it("validation errors appear for empty question", async () => {
    const el = await createEditor()
    const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
    pollBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    // Fill options but leave question empty
    const opt1 = el.querySelector('input[aria-label="Option 1"]') as HTMLInputElement
    const opt2 = el.querySelector('input[aria-label="Option 2"]') as HTMLInputElement
    opt1.value = "A"
    opt1.dispatchEvent(new Event("input", { bubbles: true }))
    opt2.value = "B"
    opt2.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    // Post should be disabled with invalid poll (empty question)
    const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
    expect(postBtn.disabled).toBe(true)
  })

  it("invalid Poll cannot submit with too few options", async () => {
    const el = await createEditor()
    const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
    pollBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    const q = el.querySelector('input[aria-label="Poll question"]') as HTMLInputElement
    q.value = "Best?"
    q.dispatchEvent(new Event("input", { bubbles: true }))
    // Only one option filled, second empty
    const opt1 = el.querySelector('input[aria-label="Option 1"]') as HTMLInputElement
    opt1.value = "A"
    opt1.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    // Post should be disabled with invalid poll (empty option)
    const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
    expect(postBtn.disabled).toBe(true)
  })

  it("valid Poll submits through Poll API with poll detail", async () => {
    const el = await createEditor({ profileName: "Alice" })
    const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
    pollBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    const q = el.querySelector('input[aria-label="Poll question"]') as HTMLInputElement
    q.value = "Best language?"
    q.dispatchEvent(new Event("input", { bubbles: true }))
    const opt1 = el.querySelector('input[aria-label="Option 1"]') as HTMLInputElement
    const opt2 = el.querySelector('input[aria-label="Option 2"]') as HTMLInputElement
    opt1.value = "Rust"
    opt1.dispatchEvent(new Event("input", { bubbles: true }))
    opt2.value = "TypeScript"
    opt2.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    let detail: CummentsSubmitDetail | null = null
    el.addEventListener("cumments:submit", (e: Event) => {
      detail = (e as CustomEvent).detail
    })
    const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
    postBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(detail).not.toBeNull()
    const d = detail as unknown as CummentsSubmitDetail
    expect(d.poll).toBeDefined()
    expect(d.poll?.question).toBe("Best language?")
    expect(d.poll?.options).toEqual(["Rust", "TypeScript"])
    expect(d.poll?.maxSelections).toBe(1)
    expect(d.displayName).toBe("Alice")
    expect(d.content).toBe("Best language?")
    expect(d.media).toBeUndefined()
  })

  it("poll with 500 graphemes accepted, 501 rejected in UI", async () => {
    const el = await createEditor()
    const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
    pollBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    const q = el.querySelector('input[aria-label="Poll question"]') as HTMLInputElement
    const flag500 = "🇩🇪".repeat(500)
    q.value = flag500
    q.dispatchEvent(new Event("input", { bubbles: true }))
    const opt1 = el.querySelector('input[aria-label="Option 1"]') as HTMLInputElement
    const opt2 = el.querySelector('input[aria-label="Option 2"]') as HTMLInputElement
    opt1.value = "A"
    opt1.dispatchEvent(new Event("input", { bubbles: true }))
    opt2.value = "B"
    opt2.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    let submitted = false
    const handler = () => (submitted = true)
    el.addEventListener("cumments:submit", handler)
    const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
    postBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(submitted).toBe(true)
    el.removeEventListener("cumments:submit", handler)
    // Now try 501
    // Reopen poll (previous submit cleared poll, so need to reopen)
    const pollBtn2 = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
    pollBtn2.click()
    await new Promise((r) => setTimeout(r, 20))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    const q2 = el.querySelector('input[aria-label="Poll question"]') as HTMLInputElement
    const flag501 = "🇩🇪".repeat(501)
    q2.value = flag501
    q2.dispatchEvent(new Event("input", { bubbles: true }))
    const o1b = el.querySelector('input[aria-label="Option 1"]') as HTMLInputElement
    const o2b = el.querySelector('input[aria-label="Option 2"]') as HTMLInputElement
    o1b.value = "A"
    o1b.dispatchEvent(new Event("input", { bubbles: true }))
    o2b.value = "B"
    o2b.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    // Post should be disabled with invalid poll (501 graphemes)
    const postBtn2 = el.querySelector('button[part="button"]') as HTMLButtonElement
    expect(postBtn2.disabled).toBe(true)
  })

  it("cancel poll returns to normal editor state", async () => {
    const el = await createEditor()
    const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
    pollBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(el.querySelector('input[aria-label="Poll question"]')).toBeTruthy()
    const cancelBtn = el.querySelector('button[aria-label="Cancel poll"]') as HTMLButtonElement
    expect(cancelBtn).toBeTruthy()
    cancelBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(el.querySelector('input[aria-label="Poll question"]')).toBeNull()
    expect(el.querySelector('button[aria-label="Create poll"]')).toBeTruthy()
    // Normal comment input still works
    const input = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
    expect(input).toBeTruthy()
  })

  it("poll is mutual exclusive with media and location", async () => {
    const el = await createEditor({
      uploadMedia: vi.fn(async () => ({
        url: "mxc://a",
        filename: "a.png",
        mimetype: "image/png",
        size: 100,
        voice: false,
      })),
    })
    // Open poll
    const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
    pollBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(el.querySelector('input[aria-label="Poll question"]')).toBeTruthy()
    expect(el.innerHTML).toContain("Poll cannot be sent")
    // Now simulate media selection should clear poll
    const file = new File(["hello"], "test.png", { type: "image/png" })
    const fileInput = el.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(fileInput, "files", { value: [file], writable: true })
    fileInput.dispatchEvent(new Event("change", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 40))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(el.querySelector('input[aria-label="Poll question"]')).toBeNull()
  })

  it("valid poll does not send via normal comment endpoint", async () => {
    const el = await createEditor()
    const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
    pollBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    const q = el.querySelector('input[aria-label="Poll question"]') as HTMLInputElement
    q.value = "Q?"
    q.dispatchEvent(new Event("input", { bubbles: true }))
    const opt1 = el.querySelector('input[aria-label="Option 1"]') as HTMLInputElement
    const opt2 = el.querySelector('input[aria-label="Option 2"]') as HTMLInputElement
    opt1.value = "A"
    opt1.dispatchEvent(new Event("input", { bubbles: true }))
    opt2.value = "B"
    opt2.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    let detail: CummentsSubmitDetail | null = null
    el.addEventListener("cumments:submit", (e: Event) => {
      detail = (e as CustomEvent).detail
    })
    const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
    postBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(detail).not.toBeNull()
    const d = detail as unknown as CummentsSubmitDetail
    expect(d.poll).toBeDefined()
    expect(d.content).toBe("Q?")
    expect(d.poll?.options).toEqual(["A", "B"])
  })

  describe("Poll composer lifecycle", () => {
    it("entering Poll mode preserves text draft", async () => {
      const el = await createEditor({ profileName: "Alice" })
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      textarea.value = "my draft"
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      // Enter Poll mode
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Text draft should be preserved
      expect((el as unknown as { currentDraft: string }).currentDraft).toBe("my draft")
    })

    it("entering Poll mode preserves reply/thread context", async () => {
      const el = await createEditor()
      el.setReplyToId("$parent")
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Enter Poll mode
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Reply context should be preserved
      expect((el as unknown as { currentReplyToId: string | null }).currentReplyToId).toBe(
        "$parent",
      )
    })

    it("entering Poll mode preserves pending media", async () => {
      const el = await createEditor({
        uploadMedia: vi.fn(async () => ({
          url: "mxc://test",
          filename: "test.png",
          mimetype: "image/png",
          size: 100,
          voice: false,
        })),
      })
      // Add pending media
      const file = new File(["hello"], "test.png", { type: "image/png" })
      const fileInput = el.querySelector('input[type="file"]') as HTMLInputElement
      Object.defineProperty(fileInput, "files", { value: [file], writable: true })
      fileInput.dispatchEvent(new Event("change", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      expect((el as unknown as { pendingMedia: unknown }).pendingMedia).toBeTruthy()
      // Enter Poll mode
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Pending media should be preserved
      expect((el as unknown as { pendingMedia: unknown }).pendingMedia).toBeTruthy()
    })

    it("entering Poll mode preserves pending location", async () => {
      const el = await createEditor()
      // Mock geolocation
      const mockPos = {
        coords: { latitude: 30.123, longitude: 120.456 },
      } as unknown as GeolocationPosition
      Object.defineProperty(navigator, "geolocation", {
        value: { getCurrentPosition: vi.fn((succ: PositionCallback) => succ(mockPos)) },
        writable: true,
        configurable: true,
      })
      // Add pending location
      const locBtn = Array.from(el.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Location"),
      ) as HTMLButtonElement
      locBtn.click()
      await new Promise((r) => setTimeout(r, 30))
      expect((el as unknown as { pendingLocation: string | null }).pendingLocation).toBeTruthy()
      // Enter Poll mode
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Pending location should be preserved
      expect((el as unknown as { pendingLocation: string | null }).pendingLocation).toBeTruthy()
    })

    it("Escape exits Poll mode without submission", async () => {
      const el = await createEditor()
      let submitted = false
      el.addEventListener("cumments:submit", () => (submitted = true))
      // Enter Poll mode
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect(el.querySelector('input[aria-label="Poll question"]')).toBeTruthy()
      // Send Escape
      const pollEditor = el.querySelector('input[aria-label="Poll question"]') as HTMLInputElement
      pollEditor.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Poll mode should be exited
      expect(el.querySelector('input[aria-label="Poll question"]')).toBeNull()
      // No submission should have occurred
      expect(submitted).toBe(false)
    })

    it("Escape from Poll mode preserves reply/thread context", async () => {
      const el = await createEditor()
      el.setReplyToId("$parent")
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Enter Poll mode
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Send Escape
      const pollEditor = el.querySelector('input[aria-label="Poll question"]') as HTMLInputElement
      pollEditor.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Reply context should be preserved
      expect((el as unknown as { currentReplyToId: string | null }).currentReplyToId).toBe(
        "$parent",
      )
    })

    it("incomplete Poll draft keeps Post disabled", async () => {
      const el = await createEditor()
      // Enter Poll mode with empty question
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Post should be disabled with empty question
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(true)
    })

    it("valid Poll draft enables Post", async () => {
      const el = await createEditor()
      // Enter Poll mode
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Fill in valid poll
      const q = el.querySelector('input[aria-label="Poll question"]') as HTMLInputElement
      q.value = "Best language?"
      q.dispatchEvent(new Event("input", { bubbles: true }))
      const opt1 = el.querySelector('input[aria-label="Option 1"]') as HTMLInputElement
      const opt2 = el.querySelector('input[aria-label="Option 2"]') as HTMLInputElement
      opt1.value = "Rust"
      opt1.dispatchEvent(new Event("input", { bubbles: true }))
      opt2.value = "TypeScript"
      opt2.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Post should be enabled
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(false)
    })

    it("changing question/options updates validity through rendered controls", async () => {
      const el = await createEditor()
      // Enter Poll mode
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
      // Initially disabled
      expect(postBtn.disabled).toBe(true)
      // Fill in question only
      const q = el.querySelector('input[aria-label="Poll question"]') as HTMLInputElement
      q.value = "Q?"
      q.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Still disabled (no valid options)
      expect(postBtn.disabled).toBe(true)
      // Fill in options
      const opt1 = el.querySelector('input[aria-label="Option 1"]') as HTMLInputElement
      const opt2 = el.querySelector('input[aria-label="Option 2"]') as HTMLInputElement
      opt1.value = "A"
      opt1.dispatchEvent(new Event("input", { bubbles: true }))
      opt2.value = "B"
      opt2.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Now enabled
      expect(postBtn.disabled).toBe(false)
    })

    it("valid Poll submission uses existing poll submission path", async () => {
      const el = await createEditor({ profileName: "Alice" })
      let capturedDetail: unknown = null
      el.addEventListener("cumments:submit", (e: Event) => {
        capturedDetail = (e as CustomEvent).detail
      })
      // Enter Poll mode
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Fill in valid poll
      const q = el.querySelector('input[aria-label="Poll question"]') as HTMLInputElement
      q.value = "Favorite color?"
      q.dispatchEvent(new Event("input", { bubbles: true }))
      const opt1 = el.querySelector('input[aria-label="Option 1"]') as HTMLInputElement
      const opt2 = el.querySelector('input[aria-label="Option 2"]') as HTMLInputElement
      opt1.value = "Red"
      opt1.dispatchEvent(new Event("input", { bubbles: true }))
      opt2.value = "Blue"
      opt2.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      // Submit
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
      postBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      // Should use poll submission path
      expect(capturedDetail).toBeTruthy()
      expect((capturedDetail as { poll?: unknown }).poll).toBeDefined()
      expect((capturedDetail as { poll?: { question?: string } }).poll?.question).toBe(
        "Favorite color?",
      )
    })

    it("opening/editing Poll does not auto-submit", async () => {
      const el = await createEditor()
      let submitted = false
      el.addEventListener("cumments:submit", () => (submitted = true))
      // Enter Poll mode
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // No auto-submit
      expect(submitted).toBe(false)
      // Edit poll
      const q = el.querySelector('input[aria-label="Poll question"]') as HTMLInputElement
      q.value = "Q?"
      q.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      // Still no auto-submit
      expect(submitted).toBe(false)
    })

    it("invalid Poll cannot be submitted", async () => {
      const el = await createEditor()
      let submitted = false
      el.addEventListener("cumments:submit", () => (submitted = true))
      // Enter Poll mode with empty question
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Try to click Post (should be disabled)
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(true)
      postBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      // Should not submit
      expect(submitted).toBe(false)
    })

    it("existing text-only and media behavior remains intact", async () => {
      const el = await createEditor({ profileName: "Alice" })
      // Test text-only submission still works
      const textarea = el.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement
      textarea.value = "hello world"
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      let capturedDetail: unknown = null
      el.addEventListener("cumments:submit", (e: Event) => {
        capturedDetail = (e as CustomEvent).detail
      })
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
      postBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      expect(capturedDetail).toBeTruthy()
      expect((capturedDetail as { content?: string }).content).toBe("hello world")
      expect((capturedDetail as { poll?: unknown }).poll).toBeUndefined()
    })

    it("valid Poll with no conflicting content enables Post", async () => {
      const el = await createEditor({ profileName: "Alice" })
      // Enter Poll mode
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Fill valid poll
      const q = el.querySelector('input[aria-label="Poll question"]') as HTMLInputElement
      q.value = "Best language?"
      q.dispatchEvent(new Event("input", { bubbles: true }))
      const opt1 = el.querySelector('input[aria-label="Option 1"]') as HTMLInputElement
      const opt2 = el.querySelector('input[aria-label="Option 2"]') as HTMLInputElement
      opt1.value = "Rust"
      opt1.dispatchEvent(new Event("input", { bubbles: true }))
      opt2.value = "TypeScript"
      opt2.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Post should be enabled
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(false)
    })

    it("valid Poll submission emits existing poll event", async () => {
      const el = await createEditor({ profileName: "Alice" })
      // Enter Poll mode
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Fill valid poll
      const q = el.querySelector('input[aria-label="Poll question"]') as HTMLInputElement
      q.value = "Favorite color?"
      q.dispatchEvent(new Event("input", { bubbles: true }))
      const opt1 = el.querySelector('input[aria-label="Option 1"]') as HTMLInputElement
      const opt2 = el.querySelector('input[aria-label="Option 2"]') as HTMLInputElement
      opt1.value = "Red"
      opt1.dispatchEvent(new Event("input", { bubbles: true }))
      opt2.value = "Blue"
      opt2.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      let capturedDetail: unknown = null
      el.addEventListener("cumments:submit", (e: Event) => {
        capturedDetail = (e as CustomEvent).detail
      })
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
      postBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      expect(capturedDetail).toBeTruthy()
      expect((capturedDetail as { poll?: unknown }).poll).toBeDefined()
      expect((capturedDetail as { poll?: { question?: string } }).poll?.question).toBe(
        "Favorite color?",
      )
    })

    it("opening/editing Poll does not auto-submit", async () => {
      const el = await createEditor()
      let submitted = false
      el.addEventListener("cumments:submit", () => (submitted = true))
      // Enter Poll mode
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect(submitted).toBe(false)
      // Edit poll
      const q = el.querySelector('input[aria-label="Poll question"]') as HTMLInputElement
      q.value = "Q?"
      q.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      expect(submitted).toBe(false)
    })
  })

  describe("Poll content exclusivity", () => {
    it("ready media + valid Poll disables Post", async () => {
      const el = await createEditor({
        uploadMedia: vi.fn(async () => ({
          url: "mxc://test",
          filename: "test.png",
          mimetype: "image/png",
          size: 100,
          voice: false,
        })),
      })
      // Create ready media attachment
      const file = new File(["hello"], "test.png", { type: "image/png" })
      const fileInput = el.querySelector('input[type="file"]') as HTMLInputElement
      Object.defineProperty(fileInput, "files", { value: [file], writable: true })
      fileInput.dispatchEvent(new Event("change", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      expect((el as unknown as { pendingMedia: unknown }).pendingMedia).toBeTruthy()
      // Enter Poll mode
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Fill valid poll
      const q = el.querySelector('input[aria-label="Poll question"]') as HTMLInputElement
      q.value = "Best language?"
      q.dispatchEvent(new Event("input", { bubbles: true }))
      const opt1 = el.querySelector('input[aria-label="Option 1"]') as HTMLInputElement
      const opt2 = el.querySelector('input[aria-label="Option 2"]') as HTMLInputElement
      opt1.value = "Rust"
      opt1.dispatchEvent(new Event("input", { bubbles: true }))
      opt2.value = "TypeScript"
      opt2.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Post should be disabled due to media conflict
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(true)
    })

    it("ready media + valid Poll does not emit submit while conflict exists", async () => {
      const el = await createEditor({
        uploadMedia: vi.fn(async () => ({
          url: "mxc://test",
          filename: "test.png",
          mimetype: "image/png",
          size: 100,
          voice: false,
        })),
      })
      // Create ready media attachment
      const file = new File(["hello"], "test.png", { type: "image/png" })
      const fileInput = el.querySelector('input[type="file"]') as HTMLInputElement
      Object.defineProperty(fileInput, "files", { value: [file], writable: true })
      fileInput.dispatchEvent(new Event("change", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      // Enter Poll mode
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Fill valid poll
      const q = el.querySelector('input[aria-label="Poll question"]') as HTMLInputElement
      q.value = "Q?"
      q.dispatchEvent(new Event("input", { bubbles: true }))
      const opt1 = el.querySelector('input[aria-label="Option 1"]') as HTMLInputElement
      const opt2 = el.querySelector('input[aria-label="Option 2"]') as HTMLInputElement
      opt1.value = "A"
      opt1.dispatchEvent(new Event("input", { bubbles: true }))
      opt2.value = "B"
      opt2.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      let submitted = false
      el.addEventListener("cumments:submit", () => (submitted = true))
      // Try to click Post (disabled)
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
      postBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      expect(submitted).toBe(false)
    })

    it("cancelling Poll with media conflict preserves media", async () => {
      const el = await createEditor({
        uploadMedia: vi.fn(async () => ({
          url: "mxc://test",
          filename: "test.png",
          mimetype: "image/png",
          size: 100,
          voice: false,
        })),
      })
      // Create ready media attachment
      const file = new File(["hello"], "test.png", { type: "image/png" })
      const fileInput = el.querySelector('input[type="file"]') as HTMLInputElement
      Object.defineProperty(fileInput, "files", { value: [file], writable: true })
      fileInput.dispatchEvent(new Event("change", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      const mediaBefore = (el as unknown as { pendingMedia: unknown }).pendingMedia
      expect(mediaBefore).toBeTruthy()
      // Enter Poll mode
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Cancel Poll
      const cancelBtn = el.querySelector('button[aria-label="Cancel poll"]') as HTMLButtonElement
      cancelBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Media should still be present
      expect((el as unknown as { pendingMedia: unknown }).pendingMedia).toBeTruthy()
    })

    it("pending sticker + valid Poll disables Post", async () => {
      const el = await createEditor({
        stickerPacks: [
          {
            pack_id: "test-pack",
            display_name: "Test Pack",
            images: [
              {
                shortcode: ":test:",
                url: "https://example.com/sticker.png",
                proxy_url: "https://example.com/sticker.png",
              },
            ],
          },
        ],
      })
      // Create pending sticker
      const stickerBtn = el.querySelector('button[aria-label="Stickers"]') as HTMLButtonElement
      stickerBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const stickerPick = el.querySelector("[data-sticker-url]") as HTMLButtonElement | null
      expect(stickerPick).toBeTruthy()
      stickerPick?.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect((el as unknown as { pendingSticker: unknown }).pendingSticker).toBeTruthy()
      // Enter Poll mode
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Fill valid poll
      const q = el.querySelector('input[aria-label="Poll question"]') as HTMLInputElement
      q.value = "Q?"
      q.dispatchEvent(new Event("input", { bubbles: true }))
      const opt1 = el.querySelector('input[aria-label="Option 1"]') as HTMLInputElement
      const opt2 = el.querySelector('input[aria-label="Option 2"]') as HTMLInputElement
      opt1.value = "A"
      opt1.dispatchEvent(new Event("input", { bubbles: true }))
      opt2.value = "B"
      opt2.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Post should be disabled due to sticker conflict
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(true)
    })

    it("cancelling Poll with sticker conflict preserves sticker", async () => {
      const el = await createEditor()
      // Create pending sticker
      const stickerBtn = el.querySelector('button[aria-label="Stickers"]') as HTMLButtonElement
      stickerBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const stickerPick = el.querySelector("[data-sticker-url]") as HTMLButtonElement | null
      if (stickerPick) {
        stickerPick.click()
        await new Promise((r) => setTimeout(r, 20))
        await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      }
      const stickerBefore = (el as unknown as { pendingSticker: unknown }).pendingSticker
      // Enter Poll mode
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Cancel Poll
      const cancelBtn = el.querySelector('button[aria-label="Cancel poll"]') as HTMLButtonElement
      cancelBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Sticker should still be present
      expect((el as unknown as { pendingSticker: unknown }).pendingSticker).toEqual(stickerBefore)
    })

    it("pending location + valid Poll disables Post", async () => {
      const el = await createEditor()
      // Mock geolocation
      const mockPos = {
        coords: { latitude: 30.123, longitude: 120.456 },
      } as unknown as GeolocationPosition
      Object.defineProperty(navigator, "geolocation", {
        value: { getCurrentPosition: vi.fn((succ: PositionCallback) => succ(mockPos)) },
        writable: true,
        configurable: true,
      })
      // Create pending location
      const locBtn = Array.from(el.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Location"),
      ) as HTMLButtonElement
      locBtn.click()
      await new Promise((r) => setTimeout(r, 30))
      expect((el as unknown as { pendingLocation: string | null }).pendingLocation).toBeTruthy()
      // Enter Poll mode
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Fill valid poll
      const q = el.querySelector('input[aria-label="Poll question"]') as HTMLInputElement
      q.value = "Q?"
      q.dispatchEvent(new Event("input", { bubbles: true }))
      const opt1 = el.querySelector('input[aria-label="Option 1"]') as HTMLInputElement
      const opt2 = el.querySelector('input[aria-label="Option 2"]') as HTMLInputElement
      opt1.value = "A"
      opt1.dispatchEvent(new Event("input", { bubbles: true }))
      opt2.value = "B"
      opt2.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Post should be disabled due to location conflict
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(true)
    })

    it("cancelling Poll with location conflict preserves location", async () => {
      const el = await createEditor()
      // Mock geolocation
      const mockPos = {
        coords: { latitude: 30.123, longitude: 120.456 },
      } as unknown as GeolocationPosition
      Object.defineProperty(navigator, "geolocation", {
        value: { getCurrentPosition: vi.fn((succ: PositionCallback) => succ(mockPos)) },
        writable: true,
        configurable: true,
      })
      // Create pending location
      const locBtn = Array.from(el.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Location"),
      ) as HTMLButtonElement
      locBtn.click()
      await new Promise((r) => setTimeout(r, 30))
      const locationBefore = (el as unknown as { pendingLocation: string | null }).pendingLocation
      expect(locationBefore).toBeTruthy()
      // Enter Poll mode
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Cancel Poll
      const cancelBtn = el.querySelector('button[aria-label="Cancel poll"]') as HTMLButtonElement
      cancelBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Location should still be present
      expect((el as unknown as { pendingLocation: string | null }).pendingLocation).toBe(
        locationBefore,
      )
    })

    it("defensive submission guard rejects poll + pending content", async () => {
      const el = await createEditor({ profileName: "Alice" })
      // Create pending media first
      const uploadMock = vi.fn(async () => ({
        url: "mxc://test",
        filename: "test.png",
        mimetype: "image/png",
        size: 100,
        voice: false,
      }))
      ;(el as unknown as { uploadMedia: unknown }).uploadMedia = uploadMock
      const file = new File(["hello"], "test.png", { type: "image/png" })
      const fileInput = el.querySelector('input[type="file"]') as HTMLInputElement
      Object.defineProperty(fileInput, "files", { value: [file], writable: true })
      fileInput.dispatchEvent(new Event("change", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 30))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      expect((el as unknown as { pendingMedia: unknown }).pendingMedia).toBeTruthy()
      // Now enter Poll mode (media should be preserved per task requirements)
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Fill valid poll
      const q = el.querySelector('input[aria-label="Poll question"]') as HTMLInputElement
      q.value = "Q?"
      q.dispatchEvent(new Event("input", { bubbles: true }))
      const opt1 = el.querySelector('input[aria-label="Option 1"]') as HTMLInputElement
      const opt2 = el.querySelector('input[aria-label="Option 2"]') as HTMLInputElement
      opt1.value = "A"
      opt1.dispatchEvent(new Event("input", { bubbles: true }))
      opt2.value = "B"
      opt2.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Verify conflict exists
      expect((el as unknown as { pendingMedia: unknown }).pendingMedia).toBeTruthy()
      expect((el as unknown as { pollDraft: unknown }).pollDraft).toBeTruthy()
      // Try to submit
      let submitted = false
      el.addEventListener("cumments:submit", () => (submitted = true))
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
      // Post should be disabled
      expect(postBtn.disabled).toBe(true)
      postBtn.click()
      await new Promise((r) => setTimeout(r, 10))
      // Should not submit
      expect(submitted).toBe(false)
    })
  })

  describe("Poll submission UX", () => {
    it("Poll editor contains submission guidance text", async () => {
      const el = await createEditor()
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Poll editor should contain guidance about using Post to submit
      expect(el.innerHTML).toContain("Post")
      expect(el.innerHTML.toLowerCase()).toContain("poll")
    })

    it("Post button shows 'Post poll' label in Poll mode", async () => {
      const el = await createEditor()
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
      // Button should indicate it will post a poll
      expect(postBtn.textContent?.toLowerCase()).toContain("poll")
      expect(postBtn.getAttribute("aria-label")?.toLowerCase()).toContain("poll")
    })

    it("Post button shows normal label outside Poll mode", async () => {
      const el = await createEditor()
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
      // Button should NOT contain "poll" when not in Poll mode
      expect(postBtn.textContent?.toLowerCase()).not.toContain("poll")
    })

    it("Post button is disabled while Poll is invalid", async () => {
      const el = await createEditor()
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
      // Empty question = invalid poll = disabled
      expect(postBtn.disabled).toBe(true)
    })

    it("Post button becomes enabled with valid Poll", async () => {
      const el = await createEditor()
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Fill valid poll
      const q = el.querySelector('input[aria-label="Poll question"]') as HTMLInputElement
      q.value = "Favorite color?"
      q.dispatchEvent(new Event("input", { bubbles: true }))
      const opt1 = el.querySelector('input[aria-label="Option 1"]') as HTMLInputElement
      const opt2 = el.querySelector('input[aria-label="Option 2"]') as HTMLInputElement
      opt1.value = "Red"
      opt1.dispatchEvent(new Event("input", { bubbles: true }))
      opt2.value = "Blue"
      opt2.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
      expect(postBtn.disabled).toBe(false)
    })

    it("Poll editor does not have a second submit button", async () => {
      const el = await createEditor()
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Poll editor should only have Add option and Cancel buttons, not a submit button
      const pollEditor = el.querySelector(".poll-editor") as HTMLElement
      expect(pollEditor).toBeTruthy()
      const buttons = pollEditor.querySelectorAll("button")
      const buttonLabels = Array.from(buttons).map((b) => b.textContent?.toLowerCase())
      // Should have "Add option" and "Cancel" but no "Post" or "Save" or "Done"
      expect(buttonLabels.some((l) => l?.includes("add option"))).toBe(true)
      expect(buttonLabels.some((l) => l?.includes("cancel"))).toBe(true)
      expect(buttonLabels.some((l) => l === "post" || l === "save" || l === "done")).toBe(false)
    })

    it("valid Poll submission dispatches single cumments:submit event", async () => {
      const el = await createEditor({ profileName: "Alice" })
      let submitCount = 0
      let capturedDetail: unknown = null
      el.addEventListener("cumments:submit", (e: Event) => {
        submitCount++
        capturedDetail = (e as CustomEvent).detail
      })
      // Enter Poll mode
      const pollBtn = el.querySelector('button[aria-label="Create poll"]') as HTMLButtonElement
      pollBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Fill valid poll
      const q = el.querySelector('input[aria-label="Poll question"]') as HTMLInputElement
      q.value = "Best language?"
      q.dispatchEvent(new Event("input", { bubbles: true }))
      const opt1 = el.querySelector('input[aria-label="Option 1"]') as HTMLInputElement
      const opt2 = el.querySelector('input[aria-label="Option 2"]') as HTMLInputElement
      opt1.value = "Rust"
      opt1.dispatchEvent(new Event("input", { bubbles: true }))
      opt2.value = "TypeScript"
      opt2.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 10))
      await (el as unknown as { updateComplete: Promise<void> }).updateComplete
      // Submit
      const postBtn = el.querySelector('button[part="button"]') as HTMLButtonElement
      postBtn.click()
      await new Promise((r) => setTimeout(r, 20))
      // Should dispatch exactly one event with poll payload
      expect(submitCount).toBe(1)
      expect(capturedDetail).toBeTruthy()
      expect((capturedDetail as { poll?: unknown }).poll).toBeDefined()
      expect((capturedDetail as { poll?: { question?: string } }).poll?.question).toBe(
        "Best language?",
      )
    })
  })
})
