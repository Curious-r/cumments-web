import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./editor/cumments-editor"
import type { CummentsEditor } from "./editor/cumments-editor"

function createEditor(opts: Partial<CummentsEditor> = {}): Promise<CummentsEditor> {
  const el = document.createElement("cumments-editor") as CummentsEditor
  Object.assign(el, opts)
  document.body.appendChild(el)
  return new Promise((resolve) => setTimeout(() => resolve(el), 30))
}

describe("Media attachment explicit submission", () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("selecting a file does not dispatch submit", async () => {
    const uploadMock = vi.fn(async () => ({ url: "https://example.com/a.png", filename: "a.png", mimetype: "image/png", size: 100, voice: false }))
    const el = await createEditor({ uploadMedia: uploadMock as unknown as CummentsEditor["uploadMedia"] })
    let submitted = false
    el.addEventListener("cumments:submit", () => { submitted = true })
    const file = new File(["hello"], "a.png", { type: "image/png" })
    const input = el.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, "files", { value: [file], writable: true })
    input.dispatchEvent(new Event("change", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(uploadMock).toHaveBeenCalled()
    expect(submitted).toBe(false)
  })

  it("successful upload creates pending media", async () => {
    const uploadMock = vi.fn(async () => ({ url: "https://example.com/b.png", filename: "b.png", mimetype: "image/png", size: 100, voice: false }))
    const el = await createEditor({ uploadMedia: uploadMock as unknown as CummentsEditor["uploadMedia"] })
    const file = new File(["hello"], "b.png", { type: "image/png" })
    const input = el.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, "files", { value: [file], writable: true })
    input.dispatchEvent(new Event("change", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect((el as unknown as { pendingMedia: unknown }).pendingMedia).toBeTruthy()
    const pending = (el as unknown as { pendingMedia: { url: string; filename: string | null } }).pendingMedia
    expect(pending.url).toBe("https://example.com/b.png")
    expect(el.innerHTML).toContain("b.png")
  })

  it("existing draft preserved after media upload", async () => {
    const uploadMock = vi.fn(async () => ({ url: "https://example.com/c.png", filename: "c.png", mimetype: "image/png", size: 100, voice: false }))
    const el = await createEditor({ uploadMedia: uploadMock as unknown as CummentsEditor["uploadMedia"] })
    const draftInput = el.querySelector('input[aria-label="Comment"]') as HTMLInputElement
    draftInput.value = "hello"
    draftInput.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    const file = new File(["hello"], "c.png", { type: "image/png" })
    const input = el.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, "files", { value: [file], writable: true })
    input.dispatchEvent(new Event("change", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    expect((el as unknown as { currentDraft: string }).currentDraft).toBe("hello")
  })

  it("existing reply preserved after media upload", async () => {
    const uploadMock = vi.fn(async () => ({ url: "https://example.com/d.png", filename: "d.png", mimetype: "image/png", size: 100, voice: false }))
    const el = await createEditor({ uploadMedia: uploadMock as unknown as CummentsEditor["uploadMedia"] })
    el.setReplyToId("$parent")
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    const file = new File(["hello"], "d.png", { type: "image/png" })
    const input = el.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, "files", { value: [file], writable: true })
    input.dispatchEvent(new Event("change", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    expect((el as unknown as { currentReplyToId: string | null }).currentReplyToId).toBe("$parent")
  })

  it("Post submits pending media with draft", async () => {
    const uploadMock = vi.fn(async () => ({ url: "https://example.com/e.png", filename: "e.png", mimetype: "image/png", size: 100, voice: false }))
    const el = await createEditor({ uploadMedia: uploadMock as unknown as CummentsEditor["uploadMedia"] })
    const draftInput = el.querySelector('input[aria-label="Comment"]') as HTMLInputElement
    draftInput.value = "hello"
    draftInput.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    const file = new File(["hello"], "e.png", { type: "image/png" })
    const input = el.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, "files", { value: [file], writable: true })
    input.dispatchEvent(new Event("change", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    let captured: unknown = null
    el.addEventListener("cumments:submit", (e) => { captured = (e as CustomEvent).detail })
    const postBtn = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    postBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    expect(captured).toBeTruthy()
    const detail = captured as { content: string; media: { url: string } }
    expect(detail.content).toBe("hello")
    expect(detail.media.url).toBe("https://example.com/e.png")
  })

  it("media-only submission works", async () => {
    const uploadMock = vi.fn(async () => ({ url: "https://example.com/f.png", filename: "f.png", mimetype: "image/png", size: 100, voice: false }))
    const el = await createEditor({ uploadMedia: uploadMock as unknown as CummentsEditor["uploadMedia"] })
    const file = new File(["hello"], "f.png", { type: "image/png" })
    const input = el.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, "files", { value: [file], writable: true })
    input.dispatchEvent(new Event("change", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    let captured: unknown = null
    el.addEventListener("cumments:submit", (e) => { captured = (e as CustomEvent).detail })
    const postBtn = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    // Should be enabled even without draft
    expect(postBtn.disabled).toBe(false)
    postBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    expect(captured).toBeTruthy()
    const detail = captured as { content: string; media: { url: string } }
    expect(detail.media.url).toBe("https://example.com/f.png")
  })

  it("removing pending media does not submit", async () => {
    const uploadMock = vi.fn(async () => ({ url: "https://example.com/g.png", filename: "g.png", mimetype: "image/png", size: 100, voice: false }))
    const el = await createEditor({ uploadMedia: uploadMock as unknown as CummentsEditor["uploadMedia"] })
    const file = new File(["hello"], "g.png", { type: "image/png" })
    const input = el.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, "files", { value: [file], writable: true })
    input.dispatchEvent(new Event("change", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    let submitted = false
    el.addEventListener("cumments:submit", () => { submitted = true })
    const removeBtn = el.querySelector('button[aria-label="Remove attachment"]') as HTMLButtonElement
    expect(removeBtn).toBeTruthy()
    removeBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    expect(submitted).toBe(false)
    expect((el as unknown as { pendingMedia: unknown }).pendingMedia).toBeNull()
  })

  it("removing pending media preserves draft", async () => {
    const uploadMock = vi.fn(async () => ({ url: "https://example.com/h.png", filename: "h.png", mimetype: "image/png", size: 100, voice: false }))
    const el = await createEditor({ uploadMedia: uploadMock as unknown as CummentsEditor["uploadMedia"] })
    const draftInput = el.querySelector('input[aria-label="Comment"]') as HTMLInputElement
    draftInput.value = "hello"
    draftInput.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    const file = new File(["hello"], "h.png", { type: "image/png" })
    const input = el.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, "files", { value: [file], writable: true })
    input.dispatchEvent(new Event("change", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    const removeBtn = el.querySelector('button[aria-label="Remove attachment"]') as HTMLButtonElement
    removeBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    expect((el as unknown as { currentDraft: string }).currentDraft).toBe("hello")
  })

  it("upload failure does not create pending media or submit", async () => {
    const uploadMock = vi.fn(async () => { throw new Error("upload failed") })
    const el = await createEditor({ uploadMedia: uploadMock as unknown as CummentsEditor["uploadMedia"] })
    const draftInput = el.querySelector('input[aria-label="Comment"]') as HTMLInputElement
    draftInput.value = "hello"
    draftInput.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    el.setReplyToId("$parent")
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    let submitted = false
    el.addEventListener("cumments:submit", () => { submitted = true })
    const file = new File(["hello"], "fail.png", { type: "image/png" })
    const input = el.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, "files", { value: [file], writable: true })
    input.dispatchEvent(new Event("change", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    expect((el as unknown as { pendingMedia: unknown }).pendingMedia).toBeNull()
    expect(submitted).toBe(false)
    expect((el as unknown as { currentDraft: string }).currentDraft).toBe("hello")
    expect((el as unknown as { currentReplyToId: string | null }).currentReplyToId).toBe("$parent")
    expect(el.innerHTML).toContain("upload failed")
  })

  it("Post button reflects pending media", async () => {
    const uploadMock = vi.fn(async () => ({ url: "https://example.com/i.png", filename: "i.png", mimetype: "image/png", size: 100, voice: false }))
    const el = await createEditor({ uploadMedia: uploadMock as unknown as CummentsEditor["uploadMedia"] })
    const postBtn = el.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    expect(postBtn.disabled).toBe(true)
    const file = new File(["hello"], "i.png", { type: "image/png" })
    const input = el.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, "files", { value: [file], writable: true })
    input.dispatchEvent(new Event("change", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete
    expect(postBtn.disabled).toBe(false)
    // While uploading, should be disabled
    const slowMock = vi.fn(() => new Promise(() => {}))
    const el2 = await createEditor({ uploadMedia: slowMock as unknown as CummentsEditor["uploadMedia"] })
    const input2 = el2.querySelector('input[type="file"]') as HTMLInputElement
    const file2 = new File(["hello"], "j.png", { type: "image/png" })
    Object.defineProperty(input2, "files", { value: [file2], writable: true })
    input2.dispatchEvent(new Event("change", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    const postBtn2 = el2.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    expect(postBtn2.disabled).toBe(true)
  })
})
