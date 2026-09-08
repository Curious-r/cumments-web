import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./cumments-comments"
import { MockEventSource } from "../test/mocks"
import { graphemeLength } from "../utils/grapheme"
import type { CummentsEditor } from "./editor/cumments-editor"

function mockFetchWithProfile(displayName: string) {
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
        json: async () => ({
          visitor_id: "abcd1234",
          display_name: displayName,
          avatar_url: null,
        }),
        text: async () => "",
        clone: () =>
          ({
            json: async () => ({
              visitor_id: "abcd1234",
              display_name: displayName,
              avatar_url: null,
            }),
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

describe("Display name grapheme validation", () => {
  let origFetch: typeof fetch
  let origES: typeof globalThis.EventSource

  beforeEach(() => {
    origES = globalThis.EventSource
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource
    localStorage.clear()
  })

  afterEach(() => {
    globalThis.fetch = origFetch
    globalThis.EventSource = origES
    document.body.innerHTML = ""
  })

  async function render(displayName = "Alice") {
    origFetch = mockFetchWithProfile(displayName)
    const el = document.createElement("cumments-comments") as unknown as HTMLElement & {
      updateComplete: Promise<unknown>
      shadowRoot: ShadowRoot
    }
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "s")
    el.setAttribute("page-slug", "p")
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 150))
    await el.updateComplete.catch(() => {})
    await new Promise((r) => setTimeout(r, 30))
    return el
  }

  async function openProfileDialog(el: HTMLElement & { shadowRoot: ShadowRoot }) {
    const capsule = el.shadowRoot.querySelector('[part="identity-capsule"]') as HTMLElement
    capsule.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const profileBtn = Array.from(
      el.shadowRoot
        .querySelector('div[role="dialog"][aria-label="Identity"]')!
        .querySelectorAll("button"),
    ).find((b) => b.textContent?.includes("Profile")) as HTMLElement
    profileBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    return el.shadowRoot.querySelector(
      'input[aria-label="Profile display name"]',
    ) as HTMLInputElement
  }

  async function saveProfile(el: HTMLElement & { shadowRoot: ShadowRoot }) {
    const saveBtn = Array.from(el.shadowRoot.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Save"),
    ) as HTMLElement
    saveBtn.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
  }

  it("49 ASCII graphemes accepted", async () => {
    const el = await render("Alice")
    const input = await openProfileDialog(el)
    const name49 = "a".repeat(49)
    expect(graphemeLength(name49)).toBe(49)
    expect(name49.length).toBe(49)
    input.value = name49
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    await saveProfile(el)
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull()
    const editor = el.shadowRoot.querySelector("cumments-editor") as CummentsEditor
    expect(editor.querySelector('button[aria-label="Edit profile"]')?.textContent).toContain(name49)
  })

  it("50 ASCII graphemes accepted", async () => {
    const el = await render("Alice")
    const input = await openProfileDialog(el)
    const name50 = "a".repeat(50)
    expect(graphemeLength(name50)).toBe(50)
    input.value = name50
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    await saveProfile(el)
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull()
  })

  it("51 ASCII graphemes rejected", async () => {
    const el = await render("Alice")
    const input = await openProfileDialog(el)
    const name51 = "a".repeat(51)
    expect(graphemeLength(name51)).toBe(51)
    input.value = name51
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    await saveProfile(el)
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]')).toBeTruthy()
    expect(el.shadowRoot.innerHTML).toContain("50 characters or fewer")
  })

  it("50 Chinese graphemes accepted", async () => {
    const el = await render("Alice")
    const input = await openProfileDialog(el)
    const name50 = "中".repeat(50)
    expect(graphemeLength(name50)).toBe(50)
    input.value = name50
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    await saveProfile(el)
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull()
    const editor = el.shadowRoot.querySelector("cumments-editor") as CummentsEditor
    expect(editor.querySelector('button[aria-label="Edit profile"]')?.textContent).toContain(name50)
  })

  it("51 Chinese graphemes rejected", async () => {
    const el = await render("Alice")
    const input = await openProfileDialog(el)
    const name51 = "中".repeat(51)
    expect(graphemeLength(name51)).toBe(51)
    input.value = name51
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    await saveProfile(el)
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]')).toBeTruthy()
    expect(el.shadowRoot.innerHTML).toContain("50 characters or fewer")
  })

  it("50 flag graphemes accepted even though JS length > 50", async () => {
    const el = await render("Alice")
    const input = await openProfileDialog(el)
    const name50 = "🇩🇪".repeat(50)
    expect(graphemeLength(name50)).toBe(50)
    expect(name50.length).toBe(200)
    // demonstrates differing semantics: grapheme <=50 but length >50 must be accepted
    expect(name50.length).toBeGreaterThan(50)
    input.value = name50
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    await saveProfile(el)
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull()
  })

  it("50 ZWJ emoji graphemes accepted even though JS length > 50", async () => {
    const el = await render("Alice")
    const input = await openProfileDialog(el)
    const name50 = "👩‍👩‍👧‍👦".repeat(50)
    expect(graphemeLength(name50)).toBe(50)
    expect(name50.length).toBeGreaterThan(50)
    input.value = name50
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    await saveProfile(el)
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull()
  })

  it("combining sequences counted as one grapheme", async () => {
    const el = await render("Alice")
    const input = await openProfileDialog(el)
    const combining50 = "e\u0301".repeat(50)
    expect(graphemeLength(combining50)).toBe(50)
    expect(combining50.length).toBe(100)
    input.value = combining50
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    await saveProfile(el)
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull()

    // reopen and try 51
    const capsule = el.shadowRoot.querySelector('[part="identity-capsule"]') as HTMLElement
    capsule.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const profileBtn2 = Array.from(
      el.shadowRoot
        .querySelector('div[role="dialog"][aria-label="Identity"]')!
        .querySelectorAll("button"),
    ).find((b) => b.textContent?.includes("Profile")) as HTMLElement
    profileBtn2.click()
    await new Promise((r) => setTimeout(r, 30))
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete.catch(() => {})
    const input2 = el.shadowRoot.querySelector(
      'input[aria-label="Profile display name"]',
    ) as HTMLInputElement
    const combining51 = "e\u0301".repeat(51)
    expect(graphemeLength(combining51)).toBe(51)
    input2.value = combining51
    input2.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    await saveProfile(el)
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]')).toBeTruthy()
    expect(el.shadowRoot.innerHTML).toContain("50 characters or fewer")
  })

  it("graphemeLength 50 but length >50 is accepted (flag case)", async () => {
    const el = await render("Alice")
    const input = await openProfileDialog(el)
    const name = "🇩🇪".repeat(50)
    expect(graphemeLength(name) <= 50).toBe(true)
    expect(name.length > 50).toBe(true)
    input.value = name
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    await saveProfile(el)
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull()
  })

  it("trims input before validation", async () => {
    const el = await render("Alice")
    const input = await openProfileDialog(el)
    const nameWithSpaces = "  " + "a".repeat(50) + "  "
    expect(graphemeLength(nameWithSpaces.trim())).toBe(50)
    input.value = nameWithSpaces
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    await saveProfile(el)
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull()
  })

  it("error clears when correcting to valid grapheme length despite JS length", async () => {
    const el = await render("Alice")
    const input = await openProfileDialog(el)
    const invalid = "a".repeat(51)
    input.value = invalid
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    await saveProfile(el)
    expect(el.shadowRoot.innerHTML).toContain("50 characters or fewer")
    // now correct to 50 flags (grapheme 50, length 200)
    const validFlags = "🇩🇪".repeat(50)
    expect(graphemeLength(validFlags)).toBe(50)
    expect(validFlags.length).toBe(200)
    input.value = validFlags
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    // error should be cleared on input
    expect(el.shadowRoot.innerHTML).not.toContain("50 characters or fewer")
    await saveProfile(el)
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull()
  })
})
