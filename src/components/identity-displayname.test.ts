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
      // Return different profiles for different identities
      const url = new URL(u)
      const pk = url.searchParams.get("author_public_key") || "pk1"
      const name = pk.slice(0, 4) === "pk1_" ? "Alice" : "Bob"
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ visitor_id: "abcd1234", display_name: name, avatar_url: null }),
        text: async () => "",
        clone: () =>
          ({
            json: async () => ({ visitor_id: "abcd1234", display_name: name, avatar_url: null }),
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

describe("identity switch preserves displayName", () => {
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

  it("switching identity does not overwrite edited displayName", async () => {
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
    // Find editor and set displayName to Bob
    const editor = el.shadowRoot.querySelector("cumments-editor") as CummentsEditor
    expect(editor).toBeTruthy()
    // Wait for editor to be ready
    await new Promise((r) => setTimeout(r, 50))
    const displayInput = editor.querySelector(
      'input[aria-label="Display name"]',
    ) as HTMLInputElement
    expect(displayInput).toBeTruthy()
    displayInput.value = "Bob"
    displayInput.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    expect((editor as unknown as { currentDisplayName: string }).currentDisplayName).toBe("Bob")
    // Simulate identity switch by directly calling runtime identity
    const runtime = (
      el as unknown as {
        runtime: {
          identity: {
            setActive: (pk: string) => void
            addIdentity: (id: { publicKey: string; privateKey: string }) => void
            identities: { publicKey: string }[]
          }
        }
      }
    ).runtime
    // Create a second identity and switch
    const { generateRandomIdentity } = await import("../identity/keypair")
    const id2 = await generateRandomIdentity()
    runtime.identity.addIdentity(id2)
    // Preserve editor displayName before switch
    const before = (editor as unknown as { currentDisplayName: string }).currentDisplayName
    runtime.identity.setActive(id2.publicKey)
    await new Promise((r) => setTimeout(r, 100))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    // Editor displayName should still be Bob, not overwritten by new profile hint
    const after = (editor as unknown as { currentDisplayName: string }).currentDisplayName
    expect(after).toBe(before)
    expect(after).toBe("Bob")
  })
})
