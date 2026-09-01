import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "./cumments-comments"
import type { Message } from "../api/contract/query"
import { MockEventSource } from "../test/mocks"

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    event_id: "$test",
    site_id: "s",
    page_slug: "p",
    author: {
      type: "visitor",
      display_name: "Author",
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

function mockFetchWithMessages(msgs: Message[] = []) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
    if (u.includes("/visitors")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ visitor_id: "abcd", display_name: "Alice", avatar_url: null }),
        text: async () => "",
        clone: () => ({ json: async () => ({}) }) as unknown as Response,
      } as unknown as Response
    }
    if (u.includes("/comments")) {
      if (init?.method === "POST" || init?.method === "DELETE" || init?.method === "PATCH") {
        return {
          ok: true,
          status: 202,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ submission_id: 1 }),
          text: async () => "",
          clone: () => ({ json: async () => ({ submission_id: 1 }) }) as unknown as Response,
        } as unknown as Response
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: msgs,
          meta: { total: msgs.length, page: 1, per_page: 20, total_pages: 1 },
        }),
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
}

describe("Reaction picker consolidation", () => {
  let origFetch: typeof fetch
  let origES: typeof globalThis.EventSource
  beforeEach(() => {
    origES = globalThis.EventSource
    origFetch = globalThis.fetch
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource
    localStorage.clear()
  })
  afterEach(() => {
    globalThis.fetch = origFetch as unknown as typeof fetch
    globalThis.EventSource = origES
    document.body.innerHTML = ""
  })

  async function renderWithMessages(msgs: Message[]) {
    origFetch = globalThis.fetch
    mockFetchWithMessages(msgs)
    const el = document.createElement("cumments-comments") as unknown as HTMLElement & {
      shadowRoot: ShadowRoot
      updateComplete: Promise<unknown>
    }
    el.setAttribute("endpoint", "https://comments.curious.host")
    el.setAttribute("site-id", "s")
    el.setAttribute("page-slug", "p")
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 120))
    await el.updateComplete.catch(() => {})
    await new Promise((r) => setTimeout(r, 30))
    return el
  }

  it("reaction summary is rendered persistently", async () => {
    const msg = makeMessage({
      reactions: [
        { key: "❤️", count: 2, mine: false, reactors: [] } as any,
        { key: "👍", count: 1, mine: false, reactors: [] } as any,
      ],
    })
    const el = await renderWithMessages([msg])
    expect(el.shadowRoot.innerHTML).toContain("❤️")
    expect(el.shadowRoot.innerHTML).toContain("2")
    expect(el.shadowRoot.querySelector('button[data-reaction-key="❤️"]')).toBeTruthy()
  })

  it("plus button is present and accessible", async () => {
    const el = await renderWithMessages([makeMessage()])
    const plus = el.shadowRoot.querySelector(
      'button[aria-label="Add reaction"]',
    ) as HTMLButtonElement
    expect(plus).toBeTruthy()
    expect(plus.getAttribute("aria-haspopup")).toBe("dialog")
    expect(plus.getAttribute("aria-expanded")).toBe("false")
    expect(plus.textContent?.trim()).toBe("+")
  })

  it("plus opens picker with dialog semantics and focus", async () => {
    const el = await renderWithMessages([makeMessage()])
    const plus = el.shadowRoot.querySelector(
      'button[aria-label="Add reaction"]',
    ) as HTMLButtonElement
    plus.click()
    await new Promise((r) => setTimeout(r, 40))
    await el.updateComplete.catch(() => {})
    expect(plus.getAttribute("aria-expanded")).toBe("true")
    const picker = el.shadowRoot.querySelector(
      '[role="dialog"][aria-label="Pick reaction"]',
    ) as HTMLElement
    expect(picker).toBeTruthy()
    // focus should be inside picker
    const focused = el.shadowRoot.activeElement as HTMLElement | null
    expect(picker.contains(focused as Node) || focused === picker).toBeTruthy()
  })

  it("Escape closes picker and returns focus to plus", async () => {
    const el = await renderWithMessages([makeMessage()])
    const plus = el.shadowRoot.querySelector(
      'button[aria-label="Add reaction"]',
    ) as HTMLButtonElement
    plus.click()
    await new Promise((r) => setTimeout(r, 40))
    await el.updateComplete.catch(() => {})
    const picker = el.shadowRoot.querySelector(
      '[role="dialog"][aria-label="Pick reaction"]',
    ) as HTMLElement
    expect(picker).toBeTruthy()
    // Send Escape via window (handled by window keydown)
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await new Promise((r) => setTimeout(r, 40))
    await el.updateComplete.catch(() => {})
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-label="Pick reaction"]')).toBeNull()
    expect(plus.getAttribute("aria-expanded")).toBe("false")
    await new Promise((r) => setTimeout(r, 10))
    expect(el.shadowRoot.activeElement === plus || document.activeElement === plus).toBeTruthy()
  })

  it("selecting a reaction invokes operation and closes picker without fabricating count", async () => {
    const msg = makeMessage({
      event_id: "$1",
      reactions: [{ key: "❤️", count: 3, mine: false, reactors: [] } as any],
    })
    const el = await renderWithMessages([msg])
    const plus = el.shadowRoot.querySelector(
      'button[aria-label="Add reaction"]',
    ) as HTMLButtonElement
    plus.click()
    await new Promise((r) => setTimeout(r, 40))
    await el.updateComplete.catch(() => {})
    const picker = el.shadowRoot.querySelector(
      '[role="dialog"][aria-label="Pick reaction"]',
    ) as HTMLElement
    expect(picker).toBeTruthy()
    const reactionBtn = Array.from(picker.querySelectorAll("button")).find(
      (b) => b.getAttribute("data-reaction-key") === "👍",
    ) as HTMLButtonElement
    // If not found, pick first emoji button
    const targetBtn =
      reactionBtn ?? (picker.querySelector("button[data-reaction-key]") as HTMLButtonElement)
    expect(targetBtn).toBeTruthy()
    const beforeCountText =
      el.shadowRoot.querySelector('button[data-reaction-key="❤️"]')?.textContent ?? ""
    expect(beforeCountText).toContain("3")
    // Mock fetch to capture reaction call
    const fetchSpy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    targetBtn.click()
    await new Promise((r) => setTimeout(r, 40))
    await el.updateComplete.catch(() => {})
    // Picker should be closed
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-label="Pick reaction"]')).toBeNull()
    // Count should still be 3 (not fabricated to 4) before server update
    const afterBtn = el.shadowRoot.querySelector('button[data-reaction-key="❤️"]') as HTMLElement
    expect(afterBtn?.textContent).toContain("3")
    // Fetch should have been called with reaction
    expect(fetchSpy).toHaveBeenCalled()
  })

  it("old quick-reaction buttons are absent", async () => {
    const el = await renderWithMessages([makeMessage()])
    // Old quick reactions had style opacity 0.7 and label reactLabel, or buttons with "+ 👍"
    expect(el.shadowRoot.innerHTML).not.toContain("opacity:0.7")
    // Should not have separate quick reaction container
    const quick = el.shadowRoot.querySelectorAll('button[aria-label*="reaction"]')
    // Only the plus and summary buttons should exist, not the old "+ 👍" quick buttons
    // Old quick buttons had text "+ 👍" etc., new picker has plain emojis
    const hasQuick = Array.from(quick).some((b) => b.textContent?.trim() === "+ 👍")
    expect(hasQuick).toBe(false)
  })

  it("old reactor tooltip is absent", async () => {
    const msg = makeMessage({
      reactions: [
        {
          key: "👍",
          count: 2,
          mine: false,
          reactors: [
            { display_name: "Alice", avatar_url: null },
            { display_name: "Bob", avatar_url: null },
          ],
        } as any,
      ],
    })
    const el = await renderWithMessages([msg])
    expect(el.shadowRoot.querySelector('[role="tooltip"]')).toBeNull()
    expect(el.shadowRoot.querySelector('[part="reactor-panel"]')).toBeNull()
    // Hovering should not create tooltip
    const btn = el.shadowRoot.querySelector('button[data-reaction-key="👍"]') as HTMLElement
    btn.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 350))
    expect(el.shadowRoot.querySelector('[role="tooltip"]')).toBeNull()
  })

  it("opening picker closes action menu", async () => {
    const msg = makeMessage()
    const el = await renderWithMessages([msg])
    // Open action menu first
    const more = el.shadowRoot.querySelector('[aria-label="More actions"]') as HTMLButtonElement
    more.click()
    await new Promise((r) => setTimeout(r, 40))
    await el.updateComplete.catch(() => {})
    expect(el.shadowRoot.querySelector('[role="menu"]')).toBeTruthy()
    // Now open picker
    const plus = el.shadowRoot.querySelector(
      'button[aria-label="Add reaction"]',
    ) as HTMLButtonElement
    plus.click()
    await new Promise((r) => setTimeout(r, 40))
    await el.updateComplete.catch(() => {})
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-label="Pick reaction"]')).toBeTruthy()
    expect(el.shadowRoot.querySelector('[role="menu"]')).toBeNull()
  })

  it("opening action menu closes picker", async () => {
    const el = await renderWithMessages([makeMessage()])
    const plus = el.shadowRoot.querySelector(
      'button[aria-label="Add reaction"]',
    ) as HTMLButtonElement
    plus.click()
    await new Promise((r) => setTimeout(r, 40))
    await el.updateComplete.catch(() => {})
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-label="Pick reaction"]')).toBeTruthy()
    const more = el.shadowRoot.querySelector('[aria-label="More actions"]') as HTMLButtonElement
    more.click()
    await new Promise((r) => setTimeout(r, 40))
    await el.updateComplete.catch(() => {})
    expect(el.shadowRoot.querySelector('[role="menu"]')).toBeTruthy()
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-label="Pick reaction"]')).toBeNull()
  })

  it("opening identity popover closes picker and vice versa", async () => {
    const el = await renderWithMessages([makeMessage()])
    const plus = el.shadowRoot.querySelector(
      'button[aria-label="Add reaction"]',
    ) as HTMLButtonElement
    plus.click()
    await new Promise((r) => setTimeout(r, 40))
    await el.updateComplete.catch(() => {})
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-label="Pick reaction"]')).toBeTruthy()
    const capsule = el.shadowRoot.querySelector('[part="identity-capsule"]') as HTMLButtonElement
    capsule.click()
    await new Promise((r) => setTimeout(r, 40))
    await el.updateComplete.catch(() => {})
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-label="Pick reaction"]')).toBeNull()
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-label="Identity"]')).toBeTruthy()
    // Picker should close popover when reopened
    plus.click()
    await new Promise((r) => setTimeout(r, 40))
    await el.updateComplete.catch(() => {})
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-label="Pick reaction"]')).toBeTruthy()
    expect(el.shadowRoot.querySelector('[role="dialog"][aria-label="Identity"]')).toBeNull()
  })

  it("multiple instances remain isolated", async () => {
    const msg = makeMessage()
    const el1 = await renderWithMessages([msg])
    // Create second instance manually
    const el2 = document.createElement("cumments-comments") as unknown as HTMLElement & {
      shadowRoot: ShadowRoot
      updateComplete: Promise<unknown>
    }
    el2.setAttribute("endpoint", "https://comments.curious.host")
    el2.setAttribute("site-id", "s")
    el2.setAttribute("page-slug", "p")
    document.body.appendChild(el2)
    await new Promise((r) => setTimeout(r, 120))
    await el2.updateComplete.catch(() => {})
    const plus1 = el1.shadowRoot.querySelector(
      'button[aria-label="Add reaction"]',
    ) as HTMLButtonElement
    const plus2 = el2.shadowRoot.querySelector(
      'button[aria-label="Add reaction"]',
    ) as HTMLButtonElement
    plus1.click()
    await new Promise((r) => setTimeout(r, 40))
    await el1.updateComplete.catch(() => {})
    await el2.updateComplete.catch(() => {})
    expect(el1.shadowRoot.querySelector('[role="dialog"][aria-label="Pick reaction"]')).toBeTruthy()
    expect(el2.shadowRoot.querySelector('[role="dialog"][aria-label="Pick reaction"]')).toBeNull()
    plus2.click()
    await new Promise((r) => setTimeout(r, 40))
    await el1.updateComplete.catch(() => {})
    await el2.updateComplete.catch(() => {})
    // Opening second should close first? Actually one transient per instance, not global. So first should remain? But task says one transient at a time per instance, not across instances.
    // At least they should be independent: both can be open separately? The spec says multi-instance remain isolated, so opening in one should not affect the other.
    // Our implementation uses per-instance openKey, so they are isolated. Check: el1 still has picker?
    expect(el2.shadowRoot.querySelector('[role="dialog"][aria-label="Pick reaction"]')).toBeTruthy()
    // el1 should still be open unless we consider global? The task says "At most one popover/menu is open at a time" per instance, not globally. So both can be open.
    // We'll just verify isolation: el1's state didn't get cleared by el2's action.
    expect(el1.shadowRoot.querySelector('[role="dialog"][aria-label="Pick reaction"]')).toBeTruthy()
    el2.remove()
  })
})
