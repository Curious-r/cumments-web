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

describe("identity switch preserves draft", () => {
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

  it("switching identity preserves draft and does not clear composer", async () => {
    const el = document.createElement("cumments-comments") as unknown as HTMLElement & {
      updateComplete: Promise<unknown>
      shadowRoot: ShadowRoot
    }
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "s")
    el.setAttribute("page-slug", "p")
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 150))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const editor = el.shadowRoot.querySelector("cumments-editor") as CummentsEditor
    expect(editor).toBeTruthy()
    await new Promise((r) => setTimeout(r, 50))
    // Set a draft
    const draftInput = editor.querySelector('input[aria-label="Comment"]') as HTMLInputElement
    draftInput.focus()
    await new Promise((r) => setTimeout(r, 30))
    draftInput.value = "my draft"
    draftInput.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    expect((editor as unknown as { currentDraft: string }).currentDraft).toBe("my draft")
    const beforeDraft = (editor as unknown as { currentDraft: string }).currentDraft
    // Simulate identity switch
    const runtime = (
      el as unknown as {
        runtime: {
          identity: {
            setActive: (pk: string) => void
            addIdentity: (id: { publicKey: string; privateKey: string }) => void
          }
        }
      }
    ).runtime
    const { generateRandomIdentity } = await import("../identity/keypair")
    const id2 = await generateRandomIdentity()
    runtime.identity.addIdentity(id2)
    runtime.identity.setActive(id2.publicKey)
    await new Promise((r) => setTimeout(r, 100))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    // Draft should still be there
    const afterDraft = (editor as unknown as { currentDraft: string }).currentDraft
    expect(afterDraft).toBe(beforeDraft)
    expect(afterDraft).toBe("my draft")
    // Composer should still be expanded and show profile context
    expect(editor.innerHTML).toContain("Commenting as")
  })
})
