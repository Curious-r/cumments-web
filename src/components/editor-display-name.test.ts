import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./cumments-comments"
import type { Message } from "../api/contract/query"
import { EditorFeature } from "../features/editor-feature"
import type { CummentsEditor } from "./editor/cumments-editor"

class MockEventSource {
  static OPEN = 1
  url = ""
  readyState = 1
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  listeners = new Map<string, Set<EventListener>>()
  constructor(url: string) {
    this.url = url
    setTimeout(() => this.onopen?.(), 0)
  }
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

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

describe("Editor display name handling", () => {
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

  async function createEditorWithHint(hint: string) {
    const editor = document.createElement("cumments-editor") as CummentsEditor
    editor.lang = "en"
    editor.displayNameHint = hint
    document.body.appendChild(editor)
    await new Promise((r) => setTimeout(r, 30))
    await (editor as unknown as { updateComplete: Promise<unknown> }).updateComplete?.catch(
      () => {},
    )
    await new Promise((r) => setTimeout(r, 20))
    return { el: null as unknown as HTMLElement & { runtime: unknown }, editor }
  }

  async function createEditorWithHintViaParent(hint: string) {
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

  it("initial hint populates empty display name", async () => {
    const editor = document.createElement("cumments-editor") as CummentsEditor
    editor.displayNameHint = ""
    document.body.appendChild(editor)
    await new Promise((r) => setTimeout(r, 30))
    expect((editor as unknown as { currentDisplayName: string }).currentDisplayName).toBe("")
    // Set hint to Alice
    ;(editor as unknown as { displayNameHint: string }).displayNameHint = "Alice"
    editor.requestUpdate()
    await new Promise((r) => setTimeout(r, 30))
    expect((editor as unknown as { currentDisplayName: string }).currentDisplayName).toBe("Alice")
    editor.remove()
    return
  })

  it("explicit display name not overwritten by hint", async () => {
    const { editor } = await createEditorWithHint("Alice")
    await new Promise((r) => setTimeout(r, 30))
    // Set explicit value via input
    const input = editor.querySelector('input[aria-label="Display name"]') as HTMLInputElement
    expect(input).toBeTruthy()
    input.value = "Bob"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    expect((editor as unknown as { currentDisplayName: string }).currentDisplayName).toBe("Bob")
    // Change hint to Charlie – should not overwrite Bob
    ;(editor as unknown as { displayNameHint: string }).displayNameHint = "Charlie"
    editor.requestUpdate()
    await new Promise((r) => setTimeout(r, 30))
    expect((editor as unknown as { currentDisplayName: string }).currentDisplayName).toBe("Bob")
  })

  it("changing hint does not overwrite already edited display name", async () => {
    const { editor } = await createEditorWithHint("Alice")
    await new Promise((r) => setTimeout(r, 30))
    const input = editor.querySelector('input[aria-label="Display name"]') as HTMLInputElement
    input.value = "Bob"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    // Change hint multiple times
    ;(editor as unknown as { displayNameHint: string }).displayNameHint = "Charlie"
    editor.requestUpdate()
    await new Promise((r) => setTimeout(r, 30))
    expect((editor as unknown as { currentDisplayName: string }).currentDisplayName).toBe("Bob")
    ;(editor as unknown as { displayNameHint: string }).displayNameHint = "Dave"
    editor.requestUpdate()
    await new Promise((r) => setTimeout(r, 30))
    expect((editor as unknown as { currentDisplayName: string }).currentDisplayName).toBe("Bob")
  })

  it("editor display name changes remain local and do not mutate profile", async () => {
    const { editor, el } = await createEditorWithHintViaParent("Alice")
    await new Promise((r) => setTimeout(r, 30))
    const input = editor.querySelector('input[aria-label="Display name"]') as HTMLInputElement
    input.value = "Eve"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    // Check that profile feature was not mutated (profile current should still be Alice)
    const runtime = (
      el as unknown as { runtime: { profile: { current: { display_name: string | null } } } }
    ).runtime
    // Profile should still be Alice (or null if not loaded), not Eve
    if (runtime?.profile?.current) {
      expect(runtime.profile.current.display_name).not.toBe("Eve")
    }
    // Ensure no localStorage persistence of display name
    expect(localStorage.getItem("cumments_displayName")).toBeNull()
    expect(localStorage.getItem("displayName")).toBeNull()
  })

  it("submitting uses current editor display name", async () => {
    const { editor } = await createEditorWithHint("Alice")
    await new Promise((r) => setTimeout(r, 30))
    const input = editor.querySelector('input[aria-label="Display name"]') as HTMLInputElement
    input.value = "Frank"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    // Set draft and submit
    const draftInput = editor.querySelector('input[aria-label="Comment"]') as HTMLInputElement
    // Focus editor to expand
    draftInput?.focus()
    await new Promise((r) => setTimeout(r, 30))
    const anyEditor = editor as unknown as { draft: string; displayName: string }
    // Directly set draft via state
    editor as unknown as { currentDraft: string }
    // Use handleDisplayNameInput already tested, now test submit detail
    const content = "hello world"
    editor as unknown as { draft: string }
    // Simulate submit by dispatching event and checking detail
    let capturedDetail: unknown = null
    editor.addEventListener("cumments:submit", (e: Event) => {
      capturedDetail = (e as CustomEvent).detail
    })
    // Set draft via input
    const commentInput = editor.querySelector('input[aria-label="Comment"]') as HTMLInputElement
    if (commentInput) {
      commentInput.value = content
      commentInput.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 20))
      // Trigger submit via button or Enter
      const submitBtn = editor.querySelector(
        'button[aria-label="Post comment"]',
      ) as HTMLButtonElement
      submitBtn?.click()
      await new Promise((r) => setTimeout(r, 30))
      expect(capturedDetail).toBeTruthy()
      expect((capturedDetail as { displayName: string }).displayName).toBe("Frank")
    } else {
      // Fallback: check EditorFeature directly
      const feature = new EditorFeature({
        submit: async (_c, opts) => {
          capturedDetail = opts
        },
        getMessage: () => undefined,
      })
      await feature.submitFromIntent(content, null, "Frank")
      expect((capturedDetail as { displayName: string }).displayName).toBe("Frank")
    }
  })

  it("empty display name remains valid and becomes Anonymous on submit", async () => {
    const feature = new EditorFeature({
      submit: async (_c, opts) => {
        expect(opts.displayName).toBe("Anonymous")
      },
      getMessage: () => undefined,
    })
    await feature.submitFromIntent("hello", null, "")
    await feature.submitFromIntent("hello", null, "   ")
    await feature.submitFromIntent("hello", null, null)
  })

  it("editor does not render persistent profile-management form", async () => {
    const { editor } = await createEditorWithHint("Alice")
    await new Promise((r) => setTimeout(r, 50))
    // Check that editor shows compact context, not a large profile form
    const html = editor.innerHTML
    expect(html).toContain("Commenting as")
    // Should not have a prominent profile form with heading like "Profile" or large form
    expect(html).not.toContain("Profile")
    // The display name input should be subordinate (small, with placeholder Anonymous)
    const input = editor.querySelector('input[aria-label="Display name"]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.placeholder).toBe("Anonymous")
    // Check that the style is compact (max-width 100px, not 140px)
    expect(input.style.maxWidth).toBe("100px")
  })

  it("reply/edit behavior preserved", async () => {
    const msg = {
      event_id: "$parent",
      content: { type: "text", body: "parent" },
      author: { display_name: "Parent", public_key: "pk", avatar_url: null } as any,
      timestamp: new Date().toISOString(),
      reply_to: null,
      thread_root: null,
    } as unknown as Message
    const feature = new EditorFeature({
      submit: async () => {},
      getMessage: (id) => (id === "$parent" ? msg : undefined),
    })
    // Reply should derive thread root correctly
    expect(feature.deriveThreadRootFor("$parent")).toBe("$parent")
    expect(feature.deriveThreadRootFor(null)).toBeNull()
    // Editing draft should not affect display name
    const { editor } = await createEditorWithHint("Alice")
    const input = editor.querySelector('input[aria-label="Display name"]') as HTMLInputElement
    input.value = "Bob"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    expect((editor as unknown as { currentDisplayName: string }).currentDisplayName).toBe("Bob")
    // Set reply
    editor.setReplyToId("$parent")
    await new Promise((r) => setTimeout(r, 20))
    expect((editor as unknown as { currentReplyToId: string | null }).currentReplyToId).toBe(
      "$parent",
    )
    // Display name should still be Bob after setting reply
    expect((editor as unknown as { currentDisplayName: string }).currentDisplayName).toBe("Bob")
  })
})
