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
    const input = el.querySelector('input[aria-label="Comment"]') as HTMLInputElement
    input.value = "hello"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    let detail: CummentsSubmitDetail | null = null
    el.addEventListener("cumments:submit", (e: Event) => {
      detail = (e as CustomEvent).detail
    })
    const btn = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 10))
    expect(detail).not.toBeNull()
    expect(detail!.content).toBe("hello")
    expect(detail!.poll).toBeUndefined()
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
    let submitted = false
    el.addEventListener("cumments:submit", () => (submitted = true))
    const postBtn = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    postBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(submitted).toBe(false)
    expect(el.innerHTML).toContain("Question is required")
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
    let submitted = false
    el.addEventListener("cumments:submit", () => (submitted = true))
    const postBtn = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    postBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(submitted).toBe(false)
    expect(el.innerHTML).toContain("Option cannot be empty")
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
    const postBtn = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    postBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(detail).not.toBeNull()
    expect(detail!.poll).toBeDefined()
    expect(detail!.poll?.question).toBe("Best language?")
    expect(detail!.poll?.options).toEqual(["Rust", "TypeScript"])
    expect(detail!.poll?.maxSelections).toBe(1)
    expect(detail!.displayName).toBe("Alice")
    expect(detail!.content).toBe("Best language?")
    expect(detail!.media).toBeUndefined()
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
    const postBtn = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
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
    let submitted2 = false
    el.addEventListener("cumments:submit", () => (submitted2 = true))
    const postBtn2 = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    postBtn2.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(submitted2).toBe(false)
    expect(el.innerHTML).toContain("Question is too long")
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
    const input = el.querySelector('input[aria-label="Comment"]') as HTMLInputElement
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
    const postBtn = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    postBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(detail!.poll).toBeDefined()
    expect(detail!.content).toBe("Q?")
    expect(detail!.poll?.options).toEqual(["A", "B"])
  })
})
