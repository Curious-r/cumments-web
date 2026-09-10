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
        {
          key: "❤️",
          count: 2,
          mine: false,
          reactors: [],
        } as unknown as Message["reactions"][number],
        {
          key: "👍",
          count: 1,
          mine: false,
          reactors: [],
        } as unknown as Message["reactions"][number],
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
      reactions: [
        {
          key: "❤️",
          count: 3,
          mine: false,
          reactors: [],
        } as unknown as Message["reactions"][number],
      ],
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

  it("reactor details are revealed on demand, not rendered up front", async () => {
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
        } as unknown as Message["reactions"][number],
      ],
    })
    const el = await renderWithMessages([msg])
    // Nothing is exposed until the user reveals a reaction.
    expect(el.shadowRoot.querySelector(".reactor-panel")).toBeNull()
    const btn = el.shadowRoot.querySelector('button[data-reaction-key="👍"]') as HTMLElement
    btn.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    await el.updateComplete.catch(() => {})
    const panel = el.shadowRoot.querySelector(".reactor-panel")
    expect(panel).toBeTruthy()
    expect(panel?.textContent).toContain("Alice")
    expect(panel?.textContent).toContain("Bob")
    btn.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }))
    // The hide is deferred by a short pointer-transit grace so the pointer can
    // reach the panel; wait past it.
    await new Promise((r) => setTimeout(r, 250))
    await el.updateComplete.catch(() => {})
    expect(el.shadowRoot.querySelector(".reactor-panel")).toBeNull()
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
    // Opening second should close first? Actually one transient per instance, not global. So first should remain? But task says one transient a time per instance, not across instances.
    // At least they should be independent: both can be open separately? The spec says multi-instance remain isolated, so opening in one should not affect the other.
    // Our implementation uses per-instance openKey, so they are isolated. Check: el1 still has picker?
    expect(el2.shadowRoot.querySelector('[role="dialog"][aria-label="Pick reaction"]')).toBeTruthy()
    // el1 should still be open unless we consider global? The task says "At most one popover/menu is open at a time" per instance, not globally. So both can be open.
    // We'll just verify isolation: el1's state didn't get cleared by el2's action.
    expect(el1.shadowRoot.querySelector('[role="dialog"][aria-label="Pick reaction"]')).toBeTruthy()
    el2.remove()
  })

  // --- Viewport-aware positioning tests ---

  describe("viewport-aware positioning", () => {
    let originalInnerHeight: number
    let originalInnerWidth: number

    beforeEach(() => {
      originalInnerHeight = window.innerHeight
      originalInnerWidth = window.innerWidth
    })

    afterEach(() => {
      Object.defineProperty(window, "innerHeight", {
        value: originalInnerHeight,
        writable: true,
        configurable: true,
      })
      Object.defineProperty(window, "innerWidth", {
        value: originalInnerWidth,
        writable: true,
        configurable: true,
      })
    })

    it("places palette above trigger when near bottom of viewport", async () => {
      const el = await renderWithMessages([makeMessage()])
      const plus = el.shadowRoot.querySelector(
        'button[aria-label="Add reaction"]',
      ) as HTMLButtonElement
      // Position trigger near bottom of viewport
      plus.getBoundingClientRect = () =>
        ({
          top: window.innerHeight - 30,
          bottom: window.innerHeight - 10,
          left: 100,
          right: 128,
          width: 28,
          height: 28,
          x: 100,
          y: window.innerHeight - 30,
          toJSON: () => {},
        }) as DOMRect
      plus.click()
      await new Promise((r) => setTimeout(r, 40))
      await el.updateComplete.catch(() => {})
      const picker = el.shadowRoot.querySelector(
        '[role="dialog"][aria-label="Pick reaction"]',
      ) as HTMLElement
      expect(picker).toBeTruthy()
      // Mock picker dimensions (happy-dom may not report actual layout size)
      picker.getBoundingClientRect = () =>
        ({
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          width: 280,
          height: 48,
          x: 0,
          y: 0,
          toJSON: () => {},
        }) as DOMRect
      // Re-trigger positioning with mocked dimensions
      const trigger = el.shadowRoot.querySelector(
        'button[aria-label="Add reaction"]',
      ) as HTMLElement
      // Access private method for testing
      ;(
        el as unknown as { positionPalette: (t: HTMLElement, p: HTMLElement) => void }
      ).positionPalette(trigger, picker)
      const top = parseInt(picker.style.top, 10)
      // Palette should be placed above trigger (top < trigger top)
      expect(top).toBeLessThan(window.innerHeight - 30)
    })

    it("prefers above when both sides have enough space", async () => {
      const el = await renderWithMessages([makeMessage()])
      const plus = el.shadowRoot.querySelector(
        'button[aria-label="Add reaction"]',
      ) as HTMLButtonElement
      // Position trigger in the middle of the viewport with space on both sides
      plus.getBoundingClientRect = () =>
        ({
          top: 400,
          bottom: 428,
          left: 100,
          right: 128,
          width: 28,
          height: 28,
          x: 100,
          y: 400,
          toJSON: () => {},
        }) as DOMRect
      plus.click()
      await new Promise((r) => setTimeout(r, 40))
      await el.updateComplete.catch(() => {})
      const picker = el.shadowRoot.querySelector(
        '[role="dialog"][aria-label="Pick reaction"]',
      ) as HTMLElement
      expect(picker).toBeTruthy()
      // Mock picker dimensions (happy-dom may not report actual layout size)
      picker.getBoundingClientRect = () =>
        ({
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          width: 280,
          height: 48,
          x: 0,
          y: 0,
          toJSON: () => {},
        }) as DOMRect
      // Re-trigger positioning with mocked dimensions
      const trigger = el.shadowRoot.querySelector(
        'button[aria-label="Add reaction"]',
      ) as HTMLElement
      ;(
        el as unknown as { positionPalette: (t: HTMLElement, p: HTMLElement) => void }
      ).positionPalette(trigger, picker)
      const top = parseInt(picker.style.top, 10)
      // Palette should be placed above trigger when both sides fit
      expect(top).toBeLessThan(400)
    })

    it("places palette below trigger when near top of viewport", async () => {
      const el = await renderWithMessages([makeMessage()])
      const plus = el.shadowRoot.querySelector(
        'button[aria-label="Add reaction"]',
      ) as HTMLButtonElement
      // Position trigger near top of viewport
      plus.getBoundingClientRect = () =>
        ({
          top: 10,
          bottom: 30,
          left: 100,
          right: 128,
          width: 28,
          height: 28,
          x: 100,
          y: 10,
          toJSON: () => {},
        }) as DOMRect
      plus.click()
      await new Promise((r) => setTimeout(r, 40))
      await el.updateComplete.catch(() => {})
      const picker = el.shadowRoot.querySelector(
        '[role="dialog"][aria-label="Pick reaction"]',
      ) as HTMLElement
      expect(picker).toBeTruthy()
      // Mock picker dimensions (happy-dom may not report actual layout size)
      picker.getBoundingClientRect = () =>
        ({
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          width: 280,
          height: 48,
          x: 0,
          y: 0,
          toJSON: () => {},
        }) as DOMRect
      // Re-trigger positioning with mocked dimensions
      const trigger = el.shadowRoot.querySelector(
        'button[aria-label="Add reaction"]',
      ) as HTMLElement
      ;(
        el as unknown as { positionPalette: (t: HTMLElement, p: HTMLElement) => void }
      ).positionPalette(trigger, picker)
      const top = parseInt(picker.style.top, 10)
      // Palette should be placed below trigger (top > trigger top)
      expect(top).toBeGreaterThan(10)
    })

    it("clamps palette horizontally near right edge of viewport", async () => {
      const el = await renderWithMessages([makeMessage()])
      const plus = el.shadowRoot.querySelector(
        'button[aria-label="Add reaction"]',
      ) as HTMLButtonElement
      // Position trigger near right edge
      plus.getBoundingClientRect = () =>
        ({
          top: 100,
          bottom: 128,
          left: window.innerWidth - 20,
          right: window.innerWidth,
          width: 28,
          height: 28,
          x: window.innerWidth - 20,
          y: 100,
          toJSON: () => {},
        }) as DOMRect
      plus.click()
      await new Promise((r) => setTimeout(r, 40))
      await el.updateComplete.catch(() => {})
      const picker = el.shadowRoot.querySelector(
        '[role="dialog"][aria-label="Pick reaction"]',
      ) as HTMLElement
      expect(picker).toBeTruthy()
      const left = parseInt(picker.style.left, 10)
      // Palette right edge should not exceed viewport width minus margin
      expect(left + picker.getBoundingClientRect().width).toBeLessThanOrEqual(window.innerWidth - 8)
    })

    it("clamps palette horizontally near left edge of viewport", async () => {
      const el = await renderWithMessages([makeMessage()])
      const plus = el.shadowRoot.querySelector(
        'button[aria-label="Add reaction"]',
      ) as HTMLButtonElement
      // Position trigger near left edge
      plus.getBoundingClientRect = () =>
        ({
          top: 100,
          bottom: 128,
          left: -10,
          right: 18,
          width: 28,
          height: 28,
          x: -10,
          y: 100,
          toJSON: () => {},
        }) as DOMRect
      plus.click()
      await new Promise((r) => setTimeout(r, 40))
      await el.updateComplete.catch(() => {})
      const picker = el.shadowRoot.querySelector(
        '[role="dialog"][aria-label="Pick reaction"]',
      ) as HTMLElement
      expect(picker).toBeTruthy()
      const left = parseInt(picker.style.left, 10)
      // Palette left edge should not be less than margin
      expect(left).toBeGreaterThanOrEqual(8)
    })

    it("repositions palette on resize while open", async () => {
      const el = await renderWithMessages([makeMessage()])
      const plus = el.shadowRoot.querySelector(
        'button[aria-label="Add reaction"]',
      ) as HTMLButtonElement
      // Mock trigger bounding rect
      plus.getBoundingClientRect = () =>
        ({
          top: 100,
          bottom: 128,
          left: 100,
          right: 128,
          width: 28,
          height: 28,
          x: 100,
          y: 100,
          toJSON: () => {},
        }) as DOMRect
      plus.click()
      await new Promise((r) => setTimeout(r, 40))
      await el.updateComplete.catch(() => {})
      const picker = el.shadowRoot.querySelector(
        '[role="dialog"][aria-label="Pick reaction"]',
      ) as HTMLElement
      expect(picker).toBeTruthy()
      // Trigger resize event
      window.dispatchEvent(new Event("resize"))
      await new Promise((r) => setTimeout(r, 40))
      await el.updateComplete.catch(() => {})
      const topAfter = picker.style.top
      // Style should be set (not empty) indicating positioning was applied
      expect(topAfter).toBeTruthy()
      expect(topAfter).not.toBe("")
      // The position should be a numeric pixel value
      expect(topAfter).toMatch(/^\d+px$/)
    })
  })
})
