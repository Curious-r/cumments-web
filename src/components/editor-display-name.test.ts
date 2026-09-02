import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./cumments-comments"
import { MockEventSource } from "../test/mocks"
import type { CummentsEditor } from "./editor/cumments-editor"

function mockFetch() {
  const orig = globalThis.fetch
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const u = String(input instanceof Request ? (input as Request).url : input)
    if (u.includes("/api/v1/challenge")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ prefix: "test.", difficulty: 1 }),
        text: async () => "",
        clone: () =>
          ({ json: async () => ({ prefix: "test.", difficulty: 1 }) }) as unknown as Response,
      } as unknown as Response
    }
    if (u.includes("/visitors/profile")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ visitor_id: "abcd1234", display_name: "Alice", avatar_url: null }),
        text: async () => "",
        clone: () =>
          ({
            json: async () => ({ visitor_id: "abcd1234", display_name: "Alice", avatar_url: null }),
          }) as unknown as Response,
      } as unknown as Response
    }
    if (u.includes("/comments")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: [], meta: { total: 0, page: 1, per_page: 20, total_pages: 1 } }),
        text: async () => "",
        clone: () => ({ json: async () => ({}) }) as unknown as Response,
      } as unknown as Response
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({}),
      text: async () => "",
      clone: () => ({ json: async () => ({}) }) as unknown as Response,
    } as unknown as Response
  }) as unknown as typeof fetch
  return orig
}

describe("Editor profile boundary", () => {
  let origFetch: typeof fetch
  let origES: typeof globalThis.EventSource
  beforeEach(() => {
    origFetch = mockFetch()
    origES = globalThis.EventSource
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource
    localStorage.clear()
  })
  afterEach(() => {
    globalThis.fetch = origFetch
    globalThis.EventSource = origES
    document.body.innerHTML = ""
  })

  async function createEditorWithProfile(name: string, avatar: string | null = null) {
    const editor = document.createElement("cumments-editor") as CummentsEditor
    editor.lang = "en"
    editor.profileName = name
    editor.profileAvatar = avatar
    document.body.appendChild(editor)
    await new Promise((r) => setTimeout(r, 30))
    await (editor as unknown as { updateComplete: Promise<unknown> }).updateComplete?.catch(
      () => {},
    )
    await new Promise((r) => setTimeout(r, 20))
    return editor
  }

  async function createWithParent() {
    const el = document.createElement("cumments-comments") as unknown as HTMLElement & {
      shadowRoot: ShadowRoot
      updateComplete: Promise<unknown>
    }
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "s")
    el.setAttribute("page-slug", "p")
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 150))
    await el.updateComplete.catch(() => {})
    const editor = el.shadowRoot.querySelector("cumments-editor") as CummentsEditor
    expect(editor).toBeTruthy()
    await new Promise((r) => setTimeout(r, 30))
    return { el, editor }
  }

  it("composer does not contain editable display name input", async () => {
    const editor = await createEditorWithProfile("Alice")
    expect(editor.querySelector('input[aria-label="Display name"]')).toBeNull()
    const btn = editor.querySelector('button[aria-label="Edit profile"]')
    expect(btn).toBeTruthy()
    expect(btn?.textContent).toContain("Alice")
  })

  it("composer displays current profile identity context", async () => {
    const editor = await createEditorWithProfile("Bob", null)
    expect(editor.innerHTML).toContain("Commenting as")
    const btn = editor.querySelector('button[aria-label="Edit profile"]') as HTMLButtonElement
    expect(btn.textContent).toContain("Bob")
    const editor2 = await createEditorWithProfile("Carol", "https://cdn/avatar.png")
    // Composer shows name; avatar is shown in capsule and profile dialog, not required in composer button for bundle size
    const btn2 = editor2.querySelector('button[aria-label="Edit profile"]') as HTMLButtonElement
    expect(btn2.textContent).toContain("Carol")
    editor2.remove()
  })

  it("submitting uses current profile display name", async () => {
    const editor = await createEditorWithProfile("Frank")
    const draftInput = editor.querySelector('input[aria-label="Comment"]') as HTMLInputElement
    draftInput.value = "hello world"
    draftInput.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    let captured: unknown = null
    editor.addEventListener("cumments:submit", (e: Event) => {
      captured = (e as CustomEvent).detail
    })
    const submitBtn = editor.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    submitBtn?.click()
    await new Promise((r) => setTimeout(r, 30))
    expect(captured).toBeTruthy()
    expect((captured as { displayName: string }).displayName).toBe("Frank")
  })

  it("updating profileName updates composer without losing draft", async () => {
    const editor = await createEditorWithProfile("Alice")
    const draftInput = editor.querySelector('input[aria-label="Comment"]') as HTMLInputElement
    draftInput.value = "my draft"
    draftInput.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    editor.profileName = "Bob"
    await (editor as unknown as { updateComplete: Promise<unknown> }).updateComplete
    await new Promise((r) => setTimeout(r, 10))
    expect((editor as unknown as { currentDraft: string }).currentDraft).toBe("my draft")
    const btn = editor.querySelector('button[aria-label="Edit profile"]') as HTMLButtonElement
    expect(btn.textContent).toContain("Bob")
  })

  it("profile changes do not require editing comment and survive reply", async () => {
    const { el, editor } = await createWithParent()
    // Set a draft and reply
    const draftInput = editor.querySelector('input[aria-label="Comment"]') as HTMLInputElement
    draftInput?.focus()
    await new Promise((r) => setTimeout(r, 30))
    draftInput.value = "reply draft"
    draftInput.dispatchEvent(new Event("input", { bubbles: true }))
    editor.setReplyToId("$parent")
    await (editor as unknown as { updateComplete: Promise<unknown> }).updateComplete
    // Open profile via composer button
    const profileBtn = editor.querySelector(
      'button[aria-label="Edit profile"]',
    ) as HTMLButtonElement
    expect(profileBtn).toBeTruthy()
    profileBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    // Profile dialog should be open in parent
    const html = el.shadowRoot.innerHTML
    expect(html).toContain("Profile")
    // Draft and reply should still be there
    expect((editor as unknown as { currentDraft: string }).currentDraft).toBe("reply draft")
    expect((editor as unknown as { currentReplyToId: string | null }).currentReplyToId).toBe(
      "$parent",
    )
  })

  it("empty display name handled as Anonymous on submit", async () => {
    const editor = await createEditorWithProfile("")
    const draftInput = editor.querySelector('input[aria-label="Comment"]') as HTMLInputElement
    draftInput.value = "hello"
    draftInput.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    let captured: unknown = null
    editor.addEventListener("cumments:submit", (e: Event) => {
      captured = (e as CustomEvent).detail
    })
    const submitBtn = editor.querySelector('button[aria-label="Post comment"]') as HTMLButtonElement
    submitBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    expect((captured as { displayName: string }).displayName).toBe("")
    // Parent will normalize to Anonymous via EditorFeature / AppRuntime; editor sends raw profileName
  })

  it("composer does not render persistent profile-management form", async () => {
    const editor = await createEditorWithProfile("Alice")
    await new Promise((r) => setTimeout(r, 20))
    const html = editor.innerHTML
    expect(html).toContain("Commenting as")
    expect(html).not.toContain("Profile")
    // Should have read-only button, not editable input with placeholder Anonymous
    expect(editor.querySelector('input[placeholder="Anonymous"]')).toBeNull()
  })
})
